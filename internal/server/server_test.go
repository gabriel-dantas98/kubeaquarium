package server

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/gabriel-dantas98/kubeaquarium/internal/k8s"
	"github.com/gorilla/websocket"
	corev1 "k8s.io/api/core/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/client-go/kubernetes/fake"
	ktesting "k8s.io/client-go/testing"
)

func TestSnapshotFailureReturnsServiceUnavailable(t *testing.T) {
	cs := fake.NewSimpleClientset()
	s := New("", nil, k8s.NewWatcher(cs), cs, nil)
	s.snapshot = func() ([]k8s.PodView, error) { return nil, errors.New("cache unavailable") }
	r := httptest.NewRecorder()
	s.handleSnapshot(r, httptest.NewRequest(http.MethodGet, "/api/snapshot", nil))
	if r.Code != http.StatusServiceUnavailable || !strings.Contains(r.Body.String(), "cache unavailable") {
		t.Fatalf("snapshot response = %d %q", r.Code, r.Body.String())
	}
}

func TestServeStreamPeriodicallyConvergesAfterDroppedEvent(t *testing.T) {
	cs := fake.NewSimpleClientset()
	s := New("", nil, k8s.NewWatcher(cs), cs, nil)
	var mu sync.Mutex
	pods := []k8s.PodView{{UID: "before"}}
	s.snapshot = func() ([]k8s.PodView, error) {
		mu.Lock()
		defer mu.Unlock()
		return append([]k8s.PodView(nil), pods...), nil
	}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			t.Errorf("upgrade: %v", err)
			return
		}
		defer conn.Close()
		s.serveStream(conn, make(chan []byte), 10*time.Millisecond)
	}))
	defer server.Close()
	ws, _, err := websocket.DefaultDialer.Dial("ws"+strings.TrimPrefix(server.URL, "http"), nil)
	if err != nil {
		t.Fatal(err)
	}
	defer ws.Close()
	readSnapshot := func() []k8s.PodView {
		ws.SetReadDeadline(time.Now().Add(time.Second))
		var got struct {
			Type string        `json:"type"`
			Pods []k8s.PodView `json:"pods"`
		}
		if err := ws.ReadJSON(&got); err != nil {
			t.Fatal(err)
		}
		if got.Type != "snapshot" {
			t.Fatalf("type = %q", got.Type)
		}
		return got.Pods
	}
	if got := readSnapshot(); len(got) != 1 || got[0].UID != "before" {
		t.Fatalf("initial = %#v", got)
	}
	mu.Lock()
	pods = []k8s.PodView{{UID: "after"}}
	mu.Unlock()
	if got := readSnapshot(); len(got) != 1 || got[0].UID != "after" {
		t.Fatalf("periodic snapshot = %#v", got)
	}
}

func TestServeStreamStopsWhenClientCloses(t *testing.T) {
	cs := fake.NewSimpleClientset()
	s := New("", nil, k8s.NewWatcher(cs), cs, nil)
	returned := make(chan struct{})
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			t.Errorf("upgrade: %v", err)
			return
		}
		defer conn.Close()
		s.serveStream(conn, make(chan []byte), time.Hour)
		close(returned)
	}))
	defer server.Close()
	ws, _, err := websocket.DefaultDialer.Dial("ws"+strings.TrimPrefix(server.URL, "http"), nil)
	if err != nil {
		t.Fatal(err)
	}
	if _, _, err := ws.ReadMessage(); err != nil {
		t.Fatal(err)
	}
	if err := ws.Close(); err != nil {
		t.Fatal(err)
	}
	select {
	case <-returned:
	case <-time.After(time.Second):
		t.Fatal("writer remained blocked after client closed")
	}
}

func TestDeleteRequiresUIDAndReturnsAcceptance(t *testing.T) {
	cs := fake.NewSimpleClientset(&corev1.Pod{ObjectMeta: metav1.ObjectMeta{Namespace: "payments", Name: "api", UID: "pod-1"}})
	server := New("", nil, k8s.NewWatcher(cs), cs, nil)

	missing := httptest.NewRecorder()
	server.handlePodOps(missing, httptest.NewRequest(http.MethodDelete, "/api/pod/payments/api", nil))
	if missing.Code != http.StatusBadRequest {
		t.Fatalf("missing UID status = %d", missing.Code)
	}

	accepted := httptest.NewRecorder()
	server.handlePodOps(accepted, httptest.NewRequest(http.MethodDelete, "/api/pod/payments/api?uid=pod-1", nil))
	if accepted.Code != http.StatusAccepted {
		t.Fatalf("accepted status = %d: %s", accepted.Code, accepted.Body.String())
	}
	var body struct {
		Accepted bool   `json:"accepted"`
		UID      string `json:"uid"`
	}
	if err := json.Unmarshal(accepted.Body.Bytes(), &body); err != nil || !body.Accepted || body.UID != "pod-1" {
		t.Fatalf("response = %#v, err = %v", body, err)
	}
}

func TestDeleteMapsKubernetesErrors(t *testing.T) {
	tests := []struct {
		name   string
		err    error
		status int
	}{
		{"forbidden", apierrors.NewForbidden(corev1.Resource("pods"), "api", errors.New("denied")), 403},
		{"not found", apierrors.NewNotFound(corev1.Resource("pods"), "api"), 404},
		{"conflict", apierrors.NewConflict(corev1.Resource("pods"), "api", errors.New("changed")), 409},
		{"other", errors.New("broken"), 500},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			cs := fake.NewSimpleClientset()
			cs.PrependReactor("delete", "pods", func(ktesting.Action) (bool, runtime.Object, error) { return true, nil, tc.err })
			s := New("", nil, k8s.NewWatcher(cs), cs, nil)
			response := httptest.NewRecorder()
			s.handlePodOps(response, httptest.NewRequest(http.MethodDelete, "/api/pod/payments/api?uid=u", nil))
			if response.Code != tc.status {
				t.Fatalf("status = %d, want %d", response.Code, tc.status)
			}
		})
	}
}

func TestDeletePassesUIDPrecondition(t *testing.T) {
	cs := fake.NewSimpleClientset()
	cs.PrependReactor("delete", "pods", func(action ktesting.Action) (bool, runtime.Object, error) {
		opts := action.(ktesting.DeleteAction).GetDeleteOptions()
		if opts.Preconditions == nil || opts.Preconditions.UID == nil || string(*opts.Preconditions.UID) != "expected" {
			t.Fatalf("preconditions = %#v", opts.Preconditions)
		}
		return true, &corev1.Pod{ObjectMeta: metav1.ObjectMeta{Name: "api"}}, nil
	})
	s := New("", nil, k8s.NewWatcher(cs), cs, nil)
	r := httptest.NewRecorder()
	s.handlePodOps(r, httptest.NewRequest(http.MethodDelete, "/api/pod/payments/api?uid=expected", nil))
	if r.Code != 202 {
		t.Fatalf("status = %d", r.Code)
	}
}
