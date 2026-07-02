package k8s

import (
	"context"
	"fmt"
	"io"
	"sort"
	"time"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
	"sigs.k8s.io/yaml"
)

// PodYAML returns the canonical YAML for a pod, with managedFields and other
// noisy server-side fields stripped — closer to `kubectl get -o yaml`.
func PodYAML(ctx context.Context, cs kubernetes.Interface, ns, name string) ([]byte, error) {
	p, err := cs.CoreV1().Pods(ns).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		return nil, err
	}
	p.ManagedFields = nil
	// Round-trip through the typed object's JSON tags so we get a sane shape.
	return yaml.Marshal(p)
}

// DeletePod deletes a pod in the target namespace. The watcher stream will
// publish the deletion once Kubernetes confirms it.
func DeletePod(ctx context.Context, cs kubernetes.Interface, ns, name string) error {
	return cs.CoreV1().Pods(ns).Delete(ctx, name, metav1.DeleteOptions{})
}

type PodEvent struct {
	LastSeen string `json:"lastSeen"`
	Type     string `json:"type"`     // Normal | Warning
	Reason   string `json:"reason"`
	Message  string `json:"message"`
	Source   string `json:"source"`   // component
	Count    int32  `json:"count"`
}

func PodEvents(ctx context.Context, cs kubernetes.Interface, ns, name string) ([]PodEvent, error) {
	// Events for this pod by involvedObject.name + namespace.
	fs := fmt.Sprintf("involvedObject.name=%s,involvedObject.namespace=%s", name, ns)
	list, err := cs.CoreV1().Events(ns).List(ctx, metav1.ListOptions{
		FieldSelector: fs,
		Limit:         200,
	})
	if err != nil {
		return nil, err
	}
	out := make([]PodEvent, 0, len(list.Items))
	for _, e := range list.Items {
		when := e.LastTimestamp.Time
		if when.IsZero() {
			when = e.EventTime.Time
		}
		if when.IsZero() {
			when = e.CreationTimestamp.Time
		}
		out = append(out, PodEvent{
			LastSeen: when.UTC().Format(time.RFC3339),
			Type:     e.Type,
			Reason:   e.Reason,
			Message:  e.Message,
			Source:   e.Source.Component,
			Count:    e.Count,
		})
	}
	// newest first
	sort.Slice(out, func(i, j int) bool { return out[i].LastSeen > out[j].LastSeen })
	return out, nil
}

// StreamPodLogs streams logs for a single container into w.
// If container is "", and the pod has only one container, it picks it; otherwise it errors.
func StreamPodLogs(ctx context.Context, cs kubernetes.Interface, ns, name, container string, tailLines int64, follow bool, w io.Writer) error {
	if container == "" {
		p, err := cs.CoreV1().Pods(ns).Get(ctx, name, metav1.GetOptions{})
		if err != nil {
			return err
		}
		if len(p.Spec.Containers) == 1 {
			container = p.Spec.Containers[0].Name
		} else if len(p.Spec.Containers) > 1 {
			container = p.Spec.Containers[0].Name
		}
	}
	opts := &corev1.PodLogOptions{
		Container: container,
		Follow:    follow,
		TailLines: &tailLines,
	}
	req := cs.CoreV1().Pods(ns).GetLogs(name, opts)
	rc, err := req.Stream(ctx)
	if err != nil {
		return err
	}
	defer rc.Close()
	_, err = io.Copy(w, rc)
	return err
}

// PodContainers returns the list of container names for a pod.
func PodContainers(ctx context.Context, cs kubernetes.Interface, ns, name string) ([]string, error) {
	p, err := cs.CoreV1().Pods(ns).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		return nil, err
	}
	out := make([]string, 0, len(p.Spec.Containers))
	for _, c := range p.Spec.Containers {
		out = append(out, c.Name)
	}
	return out, nil
}
