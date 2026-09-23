package server

import (
	"context"
	"encoding/json"
	"io/fs"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gabriel-dantas98/kubeaquarium/internal/k8s"
	"github.com/gorilla/websocket"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/client-go/kubernetes"
)

type Server struct {
	addr     string
	staticFS fs.FS
	watcher  *k8s.Watcher
	cs       kubernetes.Interface
	hub      *Hub
	ctxList  []k8s.ContextInfo
	snapshot func() ([]k8s.PodView, error)
}

func New(addr string, staticFS fs.FS, watcher *k8s.Watcher, cs kubernetes.Interface, ctxList []k8s.ContextInfo) *Server {
	return &Server{
		addr: addr, staticFS: staticFS, watcher: watcher, cs: cs,
		hub: NewHub(), ctxList: ctxList, snapshot: watcher.Snapshot,
	}
}

func (s *Server) Run(ctx context.Context) error {
	mux := http.NewServeMux()

	// static frontend
	mux.Handle("/", http.FileServer(http.FS(s.staticFS)))

	mux.HandleFunc("/api/contexts", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(s.ctxList)
	})

	mux.HandleFunc("/api/snapshot", s.handleSnapshot)

	mux.HandleFunc("/api/stream", s.handleWS)
	mux.HandleFunc("/api/pod/", s.handlePodOps)

	// fan out events to hub
	go func() {
		for {
			var ev k8s.Event
			select {
			case <-ctx.Done():
				return
			case ev = <-s.watcher.Events():
			}
			b, err := json.Marshal(ev)
			if err == nil {
				s.hub.Broadcast(b)
			}
		}
	}()

	srv := &http.Server{
		Addr:    s.addr,
		Handler: mux,
	}
	go func() {
		<-ctx.Done()
		c, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = srv.Shutdown(c)
	}()
	return srv.ListenAndServe()
}

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 4096,
	CheckOrigin:     func(r *http.Request) bool { return true }, // local-only
}

func (s *Server) handleWS(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("ws upgrade: %v", err)
		return
	}
	defer conn.Close()

	ch := s.hub.Register()
	defer s.hub.Unregister(ch)
	s.serveStream(conn, ch, 5*time.Second)
}

func (s *Server) handleSnapshot(w http.ResponseWriter, r *http.Request) {
	pods, err := s.snapshot()
	if err != nil {
		http.Error(w, err.Error(), http.StatusServiceUnavailable)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{"type": "snapshot", "pods": pods})
}

func (s *Server) serveStream(conn *websocket.Conn, ch <-chan []byte, interval time.Duration) {
	pods, err := s.snapshot()
	if err != nil {
		return
	}
	if err := conn.WriteJSON(map[string]any{"type": "snapshot", "pods": pods}); err != nil {
		return
	}
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	done := make(chan struct{})

	// read pump (just drain to detect close)
	go func() {
		defer close(done)
		for {
			if _, _, err := conn.NextReader(); err != nil {
				return
			}
		}
	}()

	for {
		select {
		case <-done:
			return
		case msg, ok := <-ch:
			if !ok {
				return
			}
			if err := conn.WriteMessage(websocket.TextMessage, msg); err != nil {
				return
			}
		case <-ticker.C:
			pods, err := s.snapshot()
			if err != nil {
				return
			}
			if err := conn.WriteJSON(map[string]any{"type": "snapshot", "pods": pods}); err != nil {
				return
			}
		}
	}
}

// handlePodOps routes:
//
//	DELETE /api/pod/{ns}/{name}
//	GET /api/pod/{ns}/{name}/yaml
//	GET /api/pod/{ns}/{name}/events
//	GET /api/pod/{ns}/{name}/containers
//	GET /api/pod/{ns}/{name}/logs?container=&tail=200&follow=1
func (s *Server) handlePodOps(w http.ResponseWriter, r *http.Request) {
	// Trim prefix and split path
	path := strings.TrimPrefix(r.URL.Path, "/api/pod/")
	parts := strings.Split(path, "/")
	if r.Method == http.MethodDelete {
		if len(parts) != 2 {
			http.Error(w, "expected DELETE /api/pod/{ns}/{name}", http.StatusBadRequest)
			return
		}
		ns, name := parts[0], parts[1]
		uid := r.URL.Query().Get("uid")
		if uid == "" {
			http.Error(w, "uid is required", http.StatusBadRequest)
			return
		}
		if err := k8s.DeletePod(r.Context(), s.cs, ns, name, uid); err != nil {
			status := http.StatusInternalServerError
			switch {
			case apierrors.IsForbidden(err):
				status = http.StatusForbidden
			case apierrors.IsNotFound(err):
				status = http.StatusNotFound
			case apierrors.IsConflict(err):
				status = http.StatusConflict
			}
			http.Error(w, err.Error(), status)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusAccepted)
		json.NewEncoder(w).Encode(map[string]any{"accepted": true, "uid": uid})
		return
	}
	if len(parts) != 3 {
		http.Error(w, "expected /api/pod/{ns}/{name}/{op}", http.StatusBadRequest)
		return
	}
	ns, name, op := parts[0], parts[1], parts[2]

	ctx := r.Context()
	switch op {
	case "yaml":
		b, err := k8s.PodYAML(ctx, s.cs, ns, name)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "text/yaml; charset=utf-8")
		w.Write(b)

	case "events":
		evs, err := k8s.PodEvents(ctx, s.cs, ns, name)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(evs)

	case "containers":
		cs, err := k8s.PodContainers(ctx, s.cs, ns, name)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(cs)

	case "logs":
		container := r.URL.Query().Get("container")
		tail := int64(200)
		if t := r.URL.Query().Get("tail"); t != "" {
			if n, err := strconv.ParseInt(t, 10, 64); err == nil && n > 0 {
				tail = n
			}
		}
		follow := r.URL.Query().Get("follow") == "1"

		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("X-Accel-Buffering", "no")
		flusher, _ := w.(http.Flusher)
		fw := &flushWriter{w: w, f: flusher}
		if err := k8s.StreamPodLogs(ctx, s.cs, ns, name, container, tail, follow, fw); err != nil {
			// Best-effort: client may have disconnected; just return.
			return
		}

	default:
		http.NotFound(w, r)
	}
}

type flushWriter struct {
	w http.ResponseWriter
	f http.Flusher
}

func (fw *flushWriter) Write(p []byte) (int, error) {
	n, err := fw.w.Write(p)
	if fw.f != nil {
		fw.f.Flush()
	}
	return n, err
}
