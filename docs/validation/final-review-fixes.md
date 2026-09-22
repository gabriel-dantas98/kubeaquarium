# Final review fix wave

This change set addresses the final review findings while the full baseline benchmark remains in progress.

- Demo capture now routes only `/api/stream` WebSockets, records the blocked attempt, and closes it without reaching a server. Vite's HMR WebSocket is outside that route. The verifier and capture script deliberately attempt the API socket after first confirming that the mission made no unsafe request.
- Recovery cards expose the controller UID, kind, and name from the real tracked target and observed candidate. The capture and verifier require the exact simulated ReplicaSet identity for both sides of the recovery evidence.
- Baseline benchmarks require `BENCH_BASELINE_ROOT` to resolve to a `web` directory in a clean tracked checkout. `metrics.json` records the source checkout and revision.
- Reappearing slots rejoin their namespace bubble after a bubble is rebuilt during their removal animation. The scene check covers the empty snapshot, removal, rebuild, and same-UID return path and checks the resulting namespace summary count.

## Static verification run

```text
node --test video/scripts/recovery-demo.test.mjs
# 1 pass, 0 fail

node --check video/scripts/recovery-demo.mjs
node --check video/scripts/verify-recovery.mjs
node --check video/scripts/capture-demo.mjs
node --check video/scripts/benchmark-visual.mjs
node --check video/scripts/check-scene.mjs
# exit 0

web/node_modules/.bin/tsc --noEmit -p web/tsconfig.json
# exit 0
```

The WebSocket test was observed failing before the route was added: the API stream route was absent. After the baseline finished, the browser checks below passed. The baseline completed all 45 scenarios; the final comparison remains pending:

```bash
export DEMO_URL='http://127.0.0.1:7781/?demo'
node video/scripts/test-recovery.mjs
node video/scripts/verify-recovery.mjs
node video/scripts/check-scene.mjs
BENCH_TARGET=baseline BENCH_BASELINE_ROOT='/absolute/path/to/baseline/web' node video/scripts/benchmark-visual.mjs
BENCH_TARGET=final node video/scripts/benchmark-visual.mjs
```

## Additional integrated regressions

The final checks also cover removing the obsolete 205-unit dive boundary, preventing collisions from moving a camera while input is blocked, and accepting attacks only on the scene canvas. The visible mission test clicks its guide text while armed and verifies that no projectile or delete operation is created. The navigation test verifies that a one-pixel gesture on a visible pod opens its detail panel. Reduced-motion mode omits decorative exhaust and projectile trails.

Fresh integrated run: node guard test, recovery suite, exact-controller verifier, scene, navigation, radar, labels, audio and two-cycle delayed-acceptance mission all passed. Web TypeScript/build, `go test -p 1 ./...`, `go vet -p 1 ./...`, and video lint passed. The backend race test passed earlier in this run; backend source was unchanged afterward.
