import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const url = process.env.BENCH_URL ?? 'http://127.0.0.1:5182';
const cycles = Number(process.env.BENCH_LEAK_CYCLES ?? 50);
const count = Number(process.env.BENCH_LEAK_COUNT ?? 200);
const output = process.env.BENCH_LEAK_OUTPUT ?? 'output/playwright/visual-leaks.json';
if (!Number.isInteger(cycles) || cycles < 1 || !Number.isInteger(count) || count < 1) throw new Error('BENCH_LEAK_CYCLES and BENCH_LEAK_COUNT must be positive integers');

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const pods = Array.from({ length: count }, (_, index) => ({
  uid: `leak-${index}`, name: `leak-worker-${index}`, namespace: `leak-${index % 8}`, node: `node-${index % 3}`,
  phase: 'Running', ready: true, restartCount: 0, reason: '', cpuMillis: 100, memMib: 128,
  createdAt: '2026-09-14T00:00:00.000Z', controller: { apiVersion: 'apps/v1', kind: 'ReplicaSet', name: 'leak', uid: 'leak-controller' }, deletionTimestamp: '',
}));

async function waitFor(predicate, timeout, message) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await delay(25);
  }
  throw new Error(message);
}

async function reset(page) {
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.__kubeaquarium?.diveMode === false);
}

async function snapshot(page) {
  const value = await page.evaluate(() => ({ domNodes: document.getElementsByTagName('*').length, scene: window.__kubeaquarium?.frameMetrics?.() ?? null }));
  assert.ok(value.scene, 'Scene frame metrics are unavailable');
  for (const field of ['drawCalls', 'geometries', 'textures']) assert.ok(Number.isFinite(value.scene[field]), `Scene metric ${field} is unavailable`);
  return { domNodes: value.domNodes, drawCalls: value.scene.drawCalls, geometries: value.scene.geometries, textures: value.scene.textures };
}

function trend(values) {
  const first = values[0];
  const last = values.at(-1);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const meanX = (values.length - 1) / 2;
  const meanY = values.reduce((sum, value) => sum + value, 0) / values.length;
  const slope = values.reduce((sum, value, index) => sum + (index - meanX) * (value - meanY), 0) / values.reduce((sum, _, index) => sum + (index - meanX) ** 2, 0);
  return { first, last, min, max, range: max - min, slopePerCycle: slope };
}

const browser = await chromium.launch({ headless: true, args: ['--enable-gpu', '--use-angle=metal', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const deletes = [];
let socket;
try {
  await page.route('**/api/**', async route => {
    const request = route.request();
    if (request.method() === 'DELETE') {
      const requestUrl = new URL(request.url());
      const uid = requestUrl.searchParams.get('uid');
      const name = decodeURIComponent(requestUrl.pathname.split('/').at(-1) ?? '');
      const pod = pods.find(candidate => candidate.name === name && (uid === null || candidate.uid === uid));
      assert.ok(pod, `Unknown synthetic DELETE ${uid} ${name}`);
      deletes.push(pod.uid);
      await route.fulfill({ status: 202, contentType: 'application/json', body: JSON.stringify({ accepted: true, uid: pod.uid }) });
      socket?.send(JSON.stringify({ type: 'deleted', uid: pod.uid }));
      return;
    }
    const path = new URL(request.url()).pathname;
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(path.endsWith('/contexts') ? [{ name: 'LEAK TEST', current: true }] : { type: 'snapshot', pods }) });
  });
  await page.routeWebSocket('**/api/stream', ws => { socket = ws; ws.send(JSON.stringify({ type: 'snapshot', pods })); });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(expected => window.__kubeaquarium?.pods === expected, count);

  const samples = [{ cycle: 0, motion: 'normal', ...(await snapshot(page)) }];
  for (let cycle = 1; cycle <= cycles; cycle++) {
    const old = pods[(cycle - 1) % pods.length];
    const replacement = { ...old, uid: `leak-churn-${cycle}`, name: `leak-churn-worker-${cycle}` };
    pods[(cycle - 1) % pods.length] = replacement;
    socket.send(JSON.stringify({ type: 'deleted', uid: old.uid }));
    socket.send(JSON.stringify({ type: 'added', pod: replacement }));
    await page.waitForTimeout(50);

    await reset(page);
    await page.keyboard.press('/');
    await page.locator('#search-input').fill(`ns:${replacement.namespace}`);
    await page.waitForFunction(() => window.__kubeaquarium?.matched > 0);
    await page.keyboard.press('Escape');
    await page.keyboard.press('ControlOrMeta+k');
    await page.locator('#radar-input').fill(replacement.name);
    await page.keyboard.press('Enter'); // selects and focuses the dynamic UID
    await page.waitForTimeout(30);
    await page.keyboard.press('Escape');

    const reduced = cycle > cycles / 2;
    await page.evaluate(value => {
      const control = document.querySelector('#reduce-motion');
      if (!(control instanceof HTMLInputElement)) throw new Error('Reduce-motion control is missing');
      control.checked = value;
      control.dispatchEvent(new Event('input', { bubbles: true }));
    }, reduced);
    await page.keyboard.press('f');
    await page.waitForFunction(() => window.__kubeaquarium?.diveMode === true);
    await page.keyboard.press('ControlOrMeta+l');
    const before = deletes.length;
    const previousHit = await page.evaluate(() => window.__kubeaquarium?.lastAttackHitUid ?? null);
    await page.mouse.click(720, 450);
    await page.waitForFunction(hit => window.__kubeaquarium?.lastAttackHitUid !== hit, previousHit, { timeout: 4_500 });
    await waitFor(() => deletes.length > before, 3_000, 'Impact did not issue a mocked DELETE');
    await reset(page);
    samples.push({ cycle, motion: reduced ? 'reduced' : 'normal', ...(await snapshot(page)) });
  }

  // The early cycles may allocate stable pools. The remaining samples must be
  // bounded; values are inspected, never treated as zero just because an API
  // is unavailable.
  const stable = samples.slice(Math.min(10, samples.length - 1));
  const summary = Object.fromEntries(['domNodes', 'drawCalls', 'geometries', 'textures'].map(field => [field, trend(stable.map(sample => sample[field]))]));
  assert.ok(summary.domNodes.range <= 24, `DOM grew across stable cycles: ${JSON.stringify(summary.domNodes)}`);
  assert.equal(summary.geometries.range, 0, `Geometry count changed across stable cycles: ${JSON.stringify(summary.geometries)}`);
  assert.equal(summary.textures.range, 0, `Texture count changed across stable cycles: ${JSON.stringify(summary.textures)}`);
  await (await import('node:fs/promises')).writeFile(output, JSON.stringify({ url, count, cycles, deletes: deletes.length, samples, summary }, null, 2));
  console.log(JSON.stringify({ cycles, deletes: deletes.length, summary }));
} finally {
  await browser.close();
}
