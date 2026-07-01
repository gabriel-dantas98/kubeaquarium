package k8s

import (
	"context"
	"testing"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/types"
	"k8s.io/client-go/kubernetes/fake"
)

func TestNewWatchOptionsNormalizesNamespacesAndLabelSelector(t *testing.T) {
	opts, err := NewWatchOptions([]string{" payments,default ", "kube-system", "payments"}, " app.kubernetes.io/name = api , tier in (frontend,backend) ")
	if err != nil {
		t.Fatalf("NewWatchOptions returned error: %v", err)
	}

	wantNamespaces := []string{"default", "kube-system", "payments"}
	if len(opts.Namespaces) != len(wantNamespaces) {
		t.Fatalf("namespaces length = %d, want %d (%v)", len(opts.Namespaces), len(wantNamespaces), opts.Namespaces)
	}
	for i := range wantNamespaces {
		if opts.Namespaces[i] != wantNamespaces[i] {
			t.Fatalf("namespace[%d] = %q, want %q", i, opts.Namespaces[i], wantNamespaces[i])
		}
	}

	if opts.LabelSelector != "app.kubernetes.io/name=api,tier in (backend,frontend)" {
		t.Fatalf("label selector = %q", opts.LabelSelector)
	}
}

func TestNewWatchOptionsRejectsInvalidLabelSelector(t *testing.T) {
	_, err := NewWatchOptions(nil, "app in (")
	if err == nil {
		t.Fatal("expected invalid label selector to return error")
	}
}

func TestWatcherSnapshotAppliesNamespaceAndLabelSelector(t *testing.T) {
	opts, err := NewWatchOptions([]string{"payments"}, "app=api")
	if err != nil {
		t.Fatalf("NewWatchOptions returned error: %v", err)
	}

	clientset := fake.NewSimpleClientset(
		testPod("payments", "api-1", map[string]string{"app": "api"}),
		testPod("payments", "worker-1", map[string]string{"app": "worker"}),
		testPod("default", "api-2", map[string]string{"app": "api"}),
	)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	watcher := NewWatcherWithOptions(clientset, opts)
	if err := watcher.Start(ctx); err != nil {
		t.Fatalf("start watcher: %v", err)
	}
	defer watcher.Stop()

	snapshot := watcher.Snapshot()
	if len(snapshot) != 1 {
		t.Fatalf("snapshot length = %d, want 1: %#v", len(snapshot), snapshot)
	}
	if snapshot[0].Namespace != "payments" || snapshot[0].Name != "api-1" {
		t.Fatalf("unexpected pod in snapshot: %#v", snapshot[0])
	}
}

func testPod(namespace, name string, labels map[string]string) *corev1.Pod {
	return &corev1.Pod{
		ObjectMeta: metav1.ObjectMeta{
			Namespace: namespace,
			Name:      name,
			UID:       typesUID(namespace + "/" + name),
			Labels:    labels,
		},
		Status: corev1.PodStatus{Phase: corev1.PodRunning},
	}
}

func typesUID(value string) types.UID {
	return types.UID(value)
}
