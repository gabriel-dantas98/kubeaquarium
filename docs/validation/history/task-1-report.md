# Task 1 report: restore label integration and frontend compilation

## Delivered

- Restored the label animation-loop calls with one live `LabelContext` shared by pod and namespace labels.
- The context uses scene dive state, the active filter query, the explicit `RadarHUD.isOpen` modal state, and measured rectangles for active HUD surfaces.
- Namespace labels render in the same loop as pod labels; labels hide while the radar dialog is open.
- Defined `BubbleUniforms` as a Three.js-compatible string-indexed uniform map with a typed `uVisibility` entry.
- Added `video/scripts/check-labels.mjs`, a focused Playwright regression for overview namespace labels, interactive HUD overlap, radar suppression, and browser page errors.

## Verification

Commands run from the repository root unless noted:

```text
cd web && npx tsc --noEmit
```

Result: passed with no output.

```text
cd web && KUBEAQUARIUM_WEB_OUT_DIR=/tmp/kubeaquarium-review-build npm run build
```

Result: passed; Vite built 30 modules in 702 ms into `/tmp/kubeaquarium-review-build`. Vite emitted its existing advisory that the minified JavaScript chunk exceeds 500 kB.

```text
DEMO_URL='http://127.0.0.1:7781/?demo' node video/scripts/check-labels.mjs
```

Result: passed with no output. The browser confirmed namespace labels in overview, no visible label overlap with the top bar or demo mission panel, no labels while the radar is open, and no `pageerror` events.

```text
git diff --check
```

Result: passed with no output.

## Self-review

Reviewed the final diff for scope and behavior. The implementation only changes label context wiring, the uniform type, and focused browser coverage. It keeps selected-label ordering and rendering behavior in `LabelLayer` unchanged. No compatibility paths or casts were added.

## Concern

No task-blocking concerns. The Vite chunk-size advisory remains, but this task does not alter bundle architecture.

## Review fix 1

The camera settings content is absolutely positioned outside its `<details>` element. The label context now measures `.settings-panel` itself while the camera settings are open.

Commands run:

```text
DEMO_URL='http://127.0.0.1:7781/?demo' node video/scripts/check-labels.mjs
```

Result: passed with no output. The regression now opens Camera settings and confirms that visible pod and namespace labels do not overlap the rendered settings panel.

```text
cd web && npx tsc --noEmit && KUBEAQUARIUM_WEB_OUT_DIR=/tmp/kubeaquarium-review-build npm run build
```

Result: passed; Vite built 30 modules in 763 ms. The existing >500 kB chunk advisory remains.

```text
git diff --check
```

Result: passed with no output.
