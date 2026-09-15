package k8s

import (
	"encoding/json"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"strings"
	"testing"
	"time"
)

func TestToViewUsesPodReadyAndController(t *testing.T) {
	controller, notController := true, false
	deleted := metav1.NewTime(time.Date(2026, 9, 10, 12, 0, 0, 123, time.UTC))
	p := &corev1.Pod{ObjectMeta: metav1.ObjectMeta{UID: "pod", CreationTimestamp: deleted, DeletionTimestamp: &deleted, OwnerReferences: []metav1.OwnerReference{
		{APIVersion: "v1", Kind: "ConfigMap", Name: "ignored", UID: "x", Controller: &notController},
		{APIVersion: "apps/v1", Kind: "ReplicaSet", Name: "api-rs", UID: "rs", Controller: &controller},
	}}, Status: corev1.PodStatus{ContainerStatuses: []corev1.ContainerStatus{{Ready: true}, {Ready: false}}}}
	v := toView(p)
	if v.Ready {
		t.Fatal("container readiness must not imply PodReady")
	}
	p.Status.Conditions = []corev1.PodCondition{{Type: corev1.PodReady, Status: corev1.ConditionTrue}}
	v = toView(p)
	if !v.Ready || v.Controller == nil || v.Controller.UID != "rs" {
		t.Fatalf("view = %#v", v)
	}
	if v.DeletionTimestamp != "2026-09-10T12:00:00.000000123Z" {
		t.Fatalf("deletion timestamp = %q", v.DeletionTimestamp)
	}
	p.OwnerReferences = nil
	p.DeletionTimestamp = nil
	b, _ := json.Marshal(toView(p))
	if string(b) == "" || !strings.Contains(string(b), `"controller":null`) {
		t.Fatalf("json = %s", b)
	}
}

func TestSnapshotEmptyIsJSONArray(t *testing.T) {
	w := NewWatcher(nil)
	pods, err := w.Snapshot()
	if err != nil {
		t.Fatal(err)
	}
	b, err := json.Marshal(pods)
	if err != nil || string(b) != "[]" {
		t.Fatalf("snapshot JSON = %s, err = %v", b, err)
	}
}
