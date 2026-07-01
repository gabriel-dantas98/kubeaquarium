# kubeaquarium local benchmark - 2026-07-01T19:45:43Z

## Summary

Result: **passed** for the stable local run.

- Cluster: local kind `kind-kubeaquarium` on Colima/Docker.
- Workload: repo samples plus generated benchmark resources.
- Visible pods in kubeaquarium: `222`.
- Browser benchmark: Chromium headed, 1440x900, 10 FPS samples.
- FPS: avg `120.6`, min `120`, p50 `121`, p95 `122`.
- Filter validation: `ns:bench-payments phase:Running` matched `17 / 222`.
- Detail panel validation: overview opened, Events/YAML/Logs tabs loaded.

## Local Runtime Notes

Initial attempt with target `600` pods saturated the local Colima VM. Kubernetes API calls returned TLS handshake timeouts, and Docker stats showed `kubeaquarium-control-plane` using `1.158GiB / 1.914GiB` while other local containers were also running. The cluster was recreated and benchmarked at target `220`, which produced a stable run with mixed pod states.

Pod phase snapshot from `pods.json`:

- `170 Pending`
- `50 Running`
- `2 Succeeded`

The high Pending count is expected on this single-node local cluster because the generated workload intentionally creates more pods than the node can schedule. This still validates kubeaquarium behavior for large visible pod counts, Pending state rendering, Error/CrashLoop pods, Completed jobs, namespaces, and mixed resource controllers.

## Commands

```bash
podman machine start podman-machine-default
PATH=/opt/homebrew/Cellar/docker/29.6.0/bin:$PATH \
  KIND_EXPERIMENTAL_PROVIDER=docker \
  DOCKER_HOST=unix:///Users/gabriel.dantas/.colima/default/docker.sock \
  kind create cluster --config deploy/kind/cluster.yaml

kubectl --context kind-kubeaquarium apply -f deploy/kind/samples.yaml
KUBE_CONTEXT=kind-kubeaquarium \
  /Users/gabriel.dantas/.codex/skills/kubeaquarium-benchmark/scripts/apply_workloads.sh 220

npm run build --prefix web
go run ./cmd/kubeaquarium --addr 127.0.0.1:7783 --context kind-kubeaquarium --no-open

KUBEAQUARIUM_URL=http://127.0.0.1:7783 \
  BENCHMARK_OUTPUT_DIR=docs/benchmarks/20260701T194543Z/final \
  MIN_PODS=200 \
  SAMPLE_SECONDS=10 \
  PLAYWRIGHT_PROJECT_DIR=video \
  HEADLESS=0 \
  node /Users/gabriel.dantas/.codex/skills/kubeaquarium-benchmark/scripts/browser_benchmark.mjs
```

## UI Validation

From `final/metrics.json`:

- `detailOpened`: `true`
- Events tab text length: `893`
- YAML tab text length: `4011`
- YAML includes `apiVersion`: `true`
- Logs tab text length: `162`
- Fatal browser errors: `0`
- Non-fatal browser automation limitation: Chromium reports a Pointer Lock `WrongDocumentError` when testing fly mode under Playwright. Orbit/drag and keyboard navigation screenshots were still captured.

Additional Kubernetes evidence:

- `selected-pod-describe.txt`
- `selected-pod.yaml`
- `log-pod-describe.txt`
- `log-pod-logs.txt`

## Assets

- [metrics.json](final/metrics.json)
- [loaded aquarium](final/01-loaded.png)
- [filter applied](final/02-filter.png)
- [focused pod](final/03-focused.png)
- [detail overview](final/04-detail-overview.png)
- [events tab](final/05-detail-events.png)
- [YAML tab](final/05-detail-yaml.png)
- [logs tab](final/05-detail-logs.png)
- [navigation check](final/06-navigation.png)
- [browser recording](final/page@60c55c8c50173c09c815bc50dbcc7be9.webm)
- [Kubernetes resources](k8s-resources.txt)
- [Kubernetes events](k8s-events.txt)
- [pod snapshot](pods.json)

## Reproduction Skill

Created and validated skill:

- `/Users/gabriel.dantas/.codex/skills/kubeaquarium-benchmark/SKILL.md`
- `/Users/gabriel.dantas/.codex/skills/kubeaquarium-benchmark/scripts/apply_workloads.sh`
- `/Users/gabriel.dantas/.codex/skills/kubeaquarium-benchmark/scripts/browser_benchmark.mjs`

Validation command:

```bash
python3 /Users/gabriel.dantas/.codex/skills/.system/skill-creator/scripts/quick_validate.py \
  /Users/gabriel.dantas/.codex/skills/kubeaquarium-benchmark
```

Output: `Skill is valid!`
