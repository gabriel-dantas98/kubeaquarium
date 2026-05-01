package k8s

import (
	"context"
	"strings"
	"time"

	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/api/resource"
	"k8s.io/apimachinery/pkg/labels"
	"k8s.io/client-go/informers"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/tools/cache"
)

type PodView struct {
	UID          string `json:"uid"`
	Name         string `json:"name"`
	Namespace    string `json:"namespace"`
	Node         string `json:"node"`
	Phase        string `json:"phase"`
	Ready        bool   `json:"ready"`
	RestartCount int32  `json:"restartCount"`
	Reason       string `json:"reason"`
	CPUMillis    int64  `json:"cpuMillis"`
	MemMiB       int64  `json:"memMib"`
	CreatedAt    string `json:"createdAt"`
}

type Event struct {
	Type string   `json:"type"` // added | updated | deleted | snapshot
	Pod  *PodView `json:"pod,omitempty"`
	UID  string   `json:"uid,omitempty"`
}

type Watcher struct {
	clientset kubernetes.Interface
	factory   informers.SharedInformerFactory
	stopCh    chan struct{}
	out       chan Event
}

func NewWatcher(cs kubernetes.Interface) *Watcher {
	return &Watcher{
		clientset: cs,
		stopCh:    make(chan struct{}),
		out:       make(chan Event, 256),
	}
}

func (w *Watcher) Events() <-chan Event { return w.out }

func (w *Watcher) Start(ctx context.Context) error {
	w.factory = informers.NewSharedInformerFactory(w.clientset, 30*time.Second)
	podInformer := w.factory.Core().V1().Pods().Informer()
	_, err := podInformer.AddEventHandler(cache.ResourceEventHandlerFuncs{
		AddFunc: func(obj interface{}) {
			if p, ok := obj.(*corev1.Pod); ok {
				v := toView(p)
				w.send(Event{Type: "added", Pod: &v})
			}
		},
		UpdateFunc: func(_, obj interface{}) {
			if p, ok := obj.(*corev1.Pod); ok {
				v := toView(p)
				w.send(Event{Type: "updated", Pod: &v})
			}
		},
		DeleteFunc: func(obj interface{}) {
			p, ok := obj.(*corev1.Pod)
			if !ok {
				if t, ok2 := obj.(cache.DeletedFinalStateUnknown); ok2 {
					p, _ = t.Obj.(*corev1.Pod)
				}
			}
			if p != nil {
				w.send(Event{Type: "deleted", UID: string(p.UID)})
			}
		},
	})
	if err != nil {
		return err
	}
	w.factory.Start(w.stopCh)
	if !cache.WaitForCacheSync(ctx.Done(), podInformer.HasSynced) {
		return context.Canceled
	}
	return nil
}

func (w *Watcher) Snapshot() []PodView {
	lister := w.factory.Core().V1().Pods().Lister()
	pods, err := lister.List(labels.Everything())
	if err != nil {
		return nil
	}
	out := make([]PodView, 0, len(pods))
	for _, p := range pods {
		out = append(out, toView(p))
	}
	return out
}

func (w *Watcher) Stop() {
	select {
	case <-w.stopCh:
	default:
		close(w.stopCh)
	}
}

func (w *Watcher) send(e Event) {
	select {
	case w.out <- e:
	default:
		// drop on backpressure; snapshot will reconcile
	}
}

func toView(p *corev1.Pod) PodView {
	var cpu, mem int64
	for _, c := range p.Spec.Containers {
		if q, ok := c.Resources.Requests[corev1.ResourceCPU]; ok {
			cpu += q.MilliValue()
		}
		if q, ok := c.Resources.Requests[corev1.ResourceMemory]; ok {
			mem += q.Value() / (1024 * 1024)
		}
	}
	// Fallback: if no requests, use limits
	if cpu == 0 || mem == 0 {
		for _, c := range p.Spec.Containers {
			if cpu == 0 {
				if q, ok := c.Resources.Limits[corev1.ResourceCPU]; ok {
					cpu += q.MilliValue()
				}
			}
			if mem == 0 {
				if q, ok := c.Resources.Limits[corev1.ResourceMemory]; ok {
					mem += q.Value() / (1024 * 1024)
				}
			}
		}
	}
	if cpu == 0 {
		cpu = 10
	}
	if mem == 0 {
		mem = 16
	}

	ready := false
	var restarts int32
	reason := ""
	for _, cs := range p.Status.ContainerStatuses {
		if cs.Ready {
			ready = true
		}
		restarts += cs.RestartCount
		if cs.State.Waiting != nil && cs.State.Waiting.Reason != "" {
			reason = cs.State.Waiting.Reason
		}
	}
	if reason == "" && p.Status.Reason != "" {
		reason = p.Status.Reason
	}
	phase := string(p.Status.Phase)
	// Be a bit more specific for crashloop / waiting reasons
	if strings.Contains(reason, "CrashLoopBackOff") {
		phase = "CrashLoopBackOff"
	}

	createdAt := ""
	if !p.CreationTimestamp.IsZero() {
		createdAt = p.CreationTimestamp.UTC().Format(time.RFC3339)
	}
	_ = resource.MustParse // ensure import is used

	return PodView{
		UID:          string(p.UID),
		Name:         p.Name,
		Namespace:    p.Namespace,
		Node:         p.Spec.NodeName,
		Phase:        phase,
		Ready:        ready,
		RestartCount: restarts,
		Reason:       reason,
		CPUMillis:    cpu,
		MemMiB:       mem,
		CreatedAt:    createdAt,
	}
}
