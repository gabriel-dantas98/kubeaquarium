# Radar Navigation Design

## Goal

Add a cockpit-style radar overlay that makes it fast to find a specific Kubernetes resource in large clusters. The first implementation selects pods from the client-side pod store. The UI and data model should be ready for future resource providers such as Deployments, Services, Jobs, and Nodes.

## User Flow

- `Cmd+K` on macOS or `Ctrl+K` elsewhere opens the radar.
- Typing filters resources by name, namespace, phase, reason, and node.
- `ArrowDown` and `ArrowUp` move the active result.
- `Enter` selects the active result.
- Selecting a pod navigates the camera to the pod, marks it focused, and opens the detail panel.
- `Esc` closes the radar without changing the current focus.

The existing `/` filter remains a fast k9s-style visual filter. The radar is a direct navigation tool.

## Visual Direction

The radar should feel like a compact cockpit computer, not a generic command palette. It appears as a floating panel with:

- a radar scope on the left, including rings, a sweep line, and blips derived from current result state;
- a dense result list on the right;
- monospaced status labels for kind, namespace, phase, and node;
- strong keyboard focus state for the active row.

The overlay must not use oversized marketing-style UI. It should preserve the aquarium scene as the primary surface.

## Architecture

### `RadarHUD`

`web/src/hud/radar.ts` owns all radar UI state:

- open/closed state;
- current query;
- active result index;
- keyboard handling;
- result rendering;
- result selection.

It receives a provider function instead of importing the store directly. This keeps the component testable and lets future resource providers plug in without changing the visual component.

### `RadarItem`

The radar uses a generic item contract:

```ts
export interface RadarItem {
  id: string;
  kind: 'pod';
  name: string;
  namespace?: string;
  status?: string;
  meta?: string;
  tokens: string[];
}
```

Future providers can extend `kind` without changing the keyboard or filtering logic.

### Pod Provider

`main.ts` creates pod radar items from `store.pods`. Each item includes:

- `id`: pod UID;
- `kind`: `pod`;
- `name`: pod name;
- `namespace`: pod namespace;
- `status`: pod reason or phase;
- `meta`: node name when present;
- `tokens`: lowercased searchable fields.

On select, `main.ts` resolves the selected UID, calls `scene.focusOnPod(uid)`, `scene.setFocused(uid)`, and `detail.show(pod)`.

## Filtering And Ranking

Filtering runs locally over current radar items. The first pass should be simple and fast:

- empty query shows the first results ordered by namespace and name;
- all query terms must match at least one token;
- exact name matches rank first;
- prefix matches rank ahead of substring matches;
- matching namespace and kind contribute smaller boosts;
- render at most 50 rows.

This keeps runtime bounded for large clusters and avoids rendering thousands of DOM nodes.

## Error Handling

- If there are no pods, show an empty radar state.
- If the selected pod disappears before `Enter`, close over the missing UID safely and do nothing.
- If the radar is open, it owns `Esc`, arrows, and `Enter`.
- It must not intercept keys while another input, textarea, or contenteditable element is active unless the radar itself is already open.

## Testing

- Unit-level TypeScript coverage is not currently configured, so validation should use build and browser checks.
- Run `npm --prefix web run build`.
- Run `go test ./...`.
- Verify in a browser that `Cmd/Ctrl+K`, typing, arrows, `Enter`, and `Esc` work.
- Verify selecting a pod opens the existing detail panel and does not break `/` filtering.

## Out Of Scope

- Backend APIs for arbitrary Kubernetes resources.
- Full command palette actions such as `logs pod`, `yaml pod`, or `events pod`.
- Server-side resource search.
