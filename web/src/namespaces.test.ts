import { layoutNamespaces, placeInBubble, resourceScale, radiusForCount, type NamespaceLayoutState } from './namespaces';
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
export function runNamespaceTests() {
  assert(resourceScale(250, 0) === resourceScale(0, 256), 'CPU and memory have equivalent reference units');
  assert(resourceScale(10, 8) * 4 < resourceScale(2000, 4096), 'resource tiers differ visibly');
  assert(resourceScale(NaN, -1) === .55, 'invalid resources remain finite');
  assert(radiusForCount(500) > radiusForCount(50), 'dense bubbles continue growing');
  assert(radiusForCount(10, 100) > radiusForCount(10, 10), 'large whales need more room');
  const state: NamespaceLayoutState = { allocations: new Map() };
  const counts = new Map([['a', 2], ['b', 20], ['c', 200], ['d', 3]]);
  const first = layoutNamespaces([...counts.keys()], counts, state);
  const replay = layoutNamespaces([...counts.keys()].reverse(), counts, { allocations: new Map() });
  for (const [name, layout] of first) assert(layout.center.equals(replay.get(name)!.center), 'deterministic layout');
  const repeated = layoutNamespaces([...counts.keys()], counts, state);
  for (const [name, layout] of first) assert(layout.center.equals(repeated.get(name)!.center), 'unchanged centers');
  counts.set('a', 2000);
  const grown = layoutNamespaces([...counts.keys()], counts, state);
  assert(grown.get('a')!.radius > first.get('a')!.radius, 'growth not clipped by neighbors');
  for (const a of grown.values()) for (const b of grown.values()) {
    if (a === b) continue;
    assert(a.center.distanceTo(b.center) >= a.radius + b.radius + 13.99, 'navigation channels survive growth');
  }
  counts.set('a', 1);
  const shrunk = layoutNamespaces([...counts.keys()], counts, state);
  for (const [name, layout] of grown) assert(layout.center.equals(shrunk.get(name)!.center), 'shrink preserves positions');
  for (const count of [1, 8, 50, 500, 2000]) {
    const layout = layoutNamespaces(['pods'], new Map([['pods', count]]), { allocations: new Map() }).get('pods')!;
    const points = Array.from({length: count}, (_, i) => placeInBubble(layout, `pod-${i}`, i));
    for (let i = 0; i < points.length; i++) {
      assert(points[i].distanceTo(layout.center) < layout.radius, 'spawn remains in shell');
      for (let j = 0; j < i; j++) assert(points[i].distanceTo(points[j]) > 3.5, 'dense spawns keep physical space');
    }
  }
}
