# kubeaquarium — Design Spec

**Date:** 2026-04-30
**Status:** Approved (MVP)

## Goal

Visualize a Kubernetes cluster as a living 3D aquarium. Each pod is a Docker-style whale. Performance-first, game-feel, web-based. Works against any cluster reachable by the local `kubectl` (kind, EKS, GKE, AKS, on-prem).

## MVP Scope

- **Resources:** Pods only.
- **Grouping:** Namespaces as floating spherical bubbles in open ocean.
- **Whale attributes:**
  - Size = `log(cpu_millicores + memory_mib) * k` (clamped).
  - Color/animation by status: Running (Docker blue, swimming idle), Pending (translucent), CrashLoopBackOff (red, pulsing/upside-down), Terminating (fade-out + sink).
- **Camera:** Hybrid. 3rd-person orbit by default. Click a whale → cinematic dolly to 1st-person near the pod. ESC returns.
- **Connection:** Local CLI binary (`kubeaquarium`) reads `~/.kube/config`, hosts API+UI at `localhost:7777`, watches via `client-go` informer, broadcasts diffs over WebSocket.
- **Performance target:** 60 FPS with 500 pods on M-series Mac. Single `InstancedMesh` for all whales.

## Architecture

```
┌────────────────────────────────────┐
│  Browser (localhost:7777)          │
│  ┌──────────────────────────────┐  │
│  │ Three.js Scene               │  │
│  │  - InstancedMesh<Whale>      │  │
│  │  - Namespace bubbles         │  │
│  │  - Hybrid camera controller  │  │
│  └──────────────────────────────┘  │
│  ┌──────────────────────────────┐  │
│  │ HUD overlay (HTML/CSS)       │  │
│  │  - context picker            │  │
│  │  - pod detail panel          │  │
│  │  - FPS counter (stats.js)    │  │
│  └──────────────────────────────┘  │
└──────────────┬─────────────────────┘
       WebSocket │ (JSON pod events)
┌──────────────▼─────────────────────┐
│  Go binary `kubeaquarium`          │
│  - chi/std-mux HTTP server         │
│  - embed.FS static frontend        │
│  - client-go SharedInformer (pods) │
│  - gorilla/websocket hub           │
│  - GET /api/contexts               │
│  - GET /api/snapshot               │
│  - WS  /api/stream                 │
└──────────────┬─────────────────────┘
               │ kubeconfig
        ┌──────▼──────┐
        │ K8s cluster │ (kind, EKS, etc.)
        └─────────────┘
```

## Wire Protocol

WebSocket messages, all JSON:

```json
// On connect, server sends snapshot then incremental events
{ "type": "snapshot", "pods": [PodView, ...], "namespaces": [string, ...] }
{ "type": "added",    "pod": PodView }
{ "type": "updated",  "pod": PodView }
{ "type": "deleted",  "uid": "..." }

// PodView
{
  "uid": "abc-123",
  "name": "nginx-deploy-7c5b-xyz",
  "namespace": "default",
  "node": "kind-control-plane",
  "phase": "Running",        // Pending|Running|Succeeded|Failed|Unknown
  "ready": true,
  "restartCount": 2,
  "reason": "",              // CrashLoopBackOff, etc.
  "cpuMillis": 100,          // sum of containers.requests.cpu
  "memMib": 128,             // sum of containers.requests.memory
  "createdAt": "2026-04-30T05:00:00Z"
}
```

## Project Layout

```
kubeaquarium/
├── cmd/kubeaquarium/main.go          # CLI entry
├── internal/
│   ├── server/server.go               # HTTP + WS
│   ├── server/hub.go                  # WS broadcast
│   ├── k8s/watcher.go                 # informer + PodView mapping
│   └── k8s/contexts.go                # list kubeconfig contexts
├── web/                               # Vite project
│   ├── index.html
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   └── src/
│       ├── main.ts
│       ├── scene.ts                   # Three.js scene + InstancedMesh
│       ├── whale.ts                   # geometry + LOD
│       ├── namespaces.ts              # bubble layout
│       ├── camera.ts                  # hybrid camera controller
│       ├── stream.ts                  # WS client + state store
│       └── hud/                       # HTML overlays
├── deploy/kind/                       # cluster + sample manifests
│   ├── cluster.yaml
│   └── samples.yaml
└── Makefile
```

## Performance Strategy

1. Single `InstancedMesh` for whales — 1 draw call regardless of count.
2. Frustum culling enabled (default).
3. LOD: at distance > N, swap whale to billboard sprite.
4. Idle animation in vertex shader (tail wave) — zero per-instance CPU work.
5. Diff updates only — informer events touch only the affected instance matrix.
6. `requestAnimationFrame` loop with `stats.js` for FPS visibility.

## Sample Cluster (kind)

- 1 control-plane node.
- Namespaces: `default`, `kube-system` (already exists), `monitoring`, `payments`, `web`.
- Sample workloads: `nginx`, `redis`, `httpbin`, `busybox-sleeper`, a CrashLooping pod (bad image), with varied `resources.requests`.

## Out of Scope (explicit)

- Services, Deployments, Nodes, PVCs, Ingress (post-MVP).
- Authentication/authorization beyond `~/.kube/config`.
- Multi-cluster simultaneous view.
- Mobile.

## Risks

- **client-go version drift:** pin to recent stable.
- **kind on Apple Silicon + colima:** verified working at session start.
- **WebGPU not used** (broader compat). WebGL2 only.

## Acceptance

- `make run` starts cluster, builds, opens `http://localhost:7777`.
- 500 sample pods render, ≥60 FPS sustained at idle, ≥45 FPS while panning.
- Click whale → camera dollies + side panel shows pod details.
- Killing a pod reflects in UI within 2s.
