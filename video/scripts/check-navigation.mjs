import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', error => errors.push(error));
try {
  await page.goto(process.env.DEMO_URL ?? 'http://127.0.0.1:5173');
  await page.waitForFunction(() => window.__kubeaquarium?.pods > 0);
  const result = await page.evaluate(async () => {
    const { layoutNamespaces } = await import('/src/namespaces.ts');
    const { projectRadar } = await import('/src/hud/radar-projection.ts');
    const state = { allocations: new Map() };
    const first = layoutNamespaces(['a', 'b'], new Map([['a', 1], ['b', 100]]), state);
    const before = Object.fromEntries([...first].map(([name, value]) => [name, value.center.toArray()]));
    const grown = layoutNamespaces(['a', 'b'], new Map([['a', 1000], ['b', 1]]), state);
    const after = Object.fromEntries([...grown].map(([name, value]) => [name, value.center.toArray()]));
    const pose = { position: { x: 0, y: 0, z: 0 }, forward: { x: 0, y: 0, z: -1 } };
    return {
      before, after,
      grown: [...grown].map(([, value]) => ({ radius: value.radius, capacity: value.capacityRadius })),
      front: projectRadar({ x: 0, y: 0, z: -10 }, pose, 100),
      right: projectRadar({ x: 10, y: 0, z: 0 }, pose, 100),
      outside: projectRadar({ x: 1000, y: 3, z: 0 }, pose, 100),
    };
  });
  assert.deepEqual(result.before, result.after, 'namespace centers moved after count changes');
  assert.ok(result.grown.every(item => item.radius <= item.capacity));
  assert.ok(Math.abs(result.front.x) < 1e-9 && result.front.y < 0);
  assert.ok(result.right.x > 0 && Math.abs(result.right.y) < 1e-9);
  assert.equal(result.outside.outside, true);
  assert.ok(Math.hypot(result.outside.x, result.outside.y) <= 1 + 1e-9);
  assert.deepEqual(errors, [], `page errors: ${errors.map(String).join('\n')}`);
} catch (error) {
  await page.screenshot({ path: 'navigation-failure.png' });
  throw error;
} finally {
  await browser.close();
}
