package k8s

import (
	"context"
	"testing"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/client-go/kubernetes/fake"
)

func TestDeletePodRemovesPod(t *testing.T) {
	ctx := context.Background()
	cs := fake.NewSimpleClientset(&corev1.Pod{
		ObjectMeta: metav1.ObjectMeta{
			Namespace: "payments",
			Name:      "api-1",
		},
	})

	if err := DeletePod(ctx, cs, "payments", "api-1"); err != nil {
		t.Fatalf("DeletePod returned error: %v", err)
	}

	_, err := cs.CoreV1().Pods("payments").Get(ctx, "api-1", metav1.GetOptions{})
	if !errors.IsNotFound(err) {
		t.Fatalf("pod should be deleted, got err=%v", err)
	}
}
