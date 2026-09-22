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

## Final fix re-review

Static re-review of `118f696` and `11e2610` found no new important breakage in their scoped changes.

- **Demo capture WebSocket guard — ADDRESSED.** The capture and recovery verifier both install a dedicated `/api/stream` WebSocket route, deliberately attempt that socket, and require the route to record the blocked connection. The route remains narrow, so it does not intercept Vite HMR.
- **Generic controller assertion — ADDRESSED.** Recovery cards now expose the observed target and candidate controller UID, kind, and name. The capture and verifier require the fixture's exact `ReplicaSet checkout-demo/demo-rs-checkout` identity on both sides.
- **Personal baseline path — ADDRESSED.** The benchmark takes `BENCH_BASELINE_ROOT`, resolves and validates the supplied `web` checkout, requires clean tracked source, and records its repository path and revision in the metrics state.

The additional integrated fixes are consistent with the current source: returning slots rejoin rebuilt namespace membership; dive collision resolution does not move a blocked camera and has no obsolete 205-unit clamp; attack input is limited to the scene canvas; and reduced-motion mode omits decorative exhaust and projectile trails.

This was a read-only code and diff review. It did not rerun browser, benchmark, or other heavy checks; the validation results above are the recorded results from the primary task.

## Visual re-review of saved captures

Independent inspection of the saved 200-pod final benchmark captures found a concrete radar layout issue. In `200-radar.png`, the native `100 units` control was inserted as a third grid child, covering most of the radar's left column and part of the panel; the equivalent baseline radar capture has no such occlusion. The earlier filter-label finding is withdrawn: the three `bench-1 · Healthy` labels occupy distinct vertical bands (approximately y=357–377, y=384–404, and y=415–435).

The overview and dive captures have materially better framing than their baseline counterparts: no namespace bubble is clipped by the viewport, and the dive view keeps the cluster and submarine orientation understandable. The saved poster is legible overall.

This visual pass inspected only the supplied static images. It cannot establish whether the native menu was transient during capture, or assess interaction, animation, other viewport sizes, and later benchmark states.

## Radar layout follow-up

The range control now belongs to the radar console header, leaving the scope as the first grid child. `check-radar.mjs` exercises the real radar DOM with `hud.css`, validates desktop (1280×720) and narrow (640×800) placement and viewport bounds, checks visible compact heading/status text for out-of-range altitude, and verifies that the status is cleared for empty and positionless results. The resulting captures are saved as `docs/screenshots/visual-feedback/radar-1280x720.png` and `radar-640x800.png`; both show a contained radar with a circular blip reset and no panel occlusion.
