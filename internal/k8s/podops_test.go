package k8s

import (
	"context"
	"testing"

	"fmt"
	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/client-go/kubernetes/fake"
	ktesting "k8s.io/client-go/testing"
)

func TestDeletePodRemovesPod(t *testing.T) {
	ctx := context.Background()
	cs := fake.NewSimpleClientset(&corev1.Pod{
		ObjectMeta: metav1.ObjectMeta{
			Namespace: "payments",
			Name:      "api-1",
			UID:       "uid-1",
		},
	})

	if err := DeletePod(ctx, cs, "payments", "api-1", "uid-1"); err != nil {
		t.Fatalf("DeletePod returned error: %v", err)
	}

	_, err := cs.CoreV1().Pods("payments").Get(ctx, "api-1", metav1.GetOptions{})
	if !errors.IsNotFound(err) {
		t.Fatalf("pod should be deleted, got err=%v", err)
	}
}

func TestDeletePodUsesUIDPreconditionAndPropagatesConflict(t *testing.T) {
	cs := fake.NewSimpleClientset()
	cs.PrependReactor("delete", "pods", func(action ktesting.Action) (bool, runtime.Object, error) {
		opts := action.(ktesting.DeleteAction).GetDeleteOptions()
		if opts.Preconditions == nil || opts.Preconditions.UID == nil || string(*opts.Preconditions.UID) != "old" {
			t.Fatalf("UID precondition = %#v", opts.Preconditions)
		}
		return true, nil, errors.NewConflict(corev1.Resource("pods"), "api", fmt.Errorf("UID changed"))
	})
	if err := DeletePod(context.Background(), cs, "payments", "api", "old"); !errors.IsConflict(err) {
		t.Fatalf("want conflict, got %v", err)
	}
}
