import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { access, mkdir, realpath, writeFile } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import os from 'node:os';
import { basename, resolve } from 'node:path';
import { promisify } from 'node:util';
import { chromium } from 'playwright';

// This benchmark is deliberately self-contained: every HTTP and WebSocket
// response is intercepted, and DELETE only changes the in-memory fixture.
const repo = resolve(import.meta.dirname, '..', '..');
const target = process.env.BENCH_TARGET ?? 'final';
const baselineWebRoot = process.env.BENCH_BASELINE_ROOT ? resolve(process.env.BENCH_BASELINE_ROOT) : null;
const webRoot = target === 'baseline' ? baselineWebRoot : resolve(repo, 'web');
const output = resolve(process.env.BENCH_OUTPUT ?? `output/playwright/benchmark-${target}`);
const port = Number(process.env.BENCH_PORT ?? (target === 'baseline' ? 5181 : 5182));
const url = process.env.BENCH_URL ?? `http://127.0.0.1:${port}`;
const duration = Number(process.env.BENCH_MS ?? 30_000);
const warmup = Number(process.env.BENCH_WARMUP_MS ?? 10_000);
const rounds = Number(process.env.BENCH_ROUNDS ?? 3);
const counts = (process.env.BENCH_COUNTS ?? '200,1200,2500').split(',').map(Number);
const screenshots = process.env.BENCH_SCREENSHOTS !== '0';
const autoServe = !process.env.BENCH_URL;
const execFileAsync = promisify(execFile);

if (!['baseline', 'final'].includes(target)) throw new Error(`BENCH_TARGET must be baseline or final, got ${target}`);
if (!counts.every(count => Number.isInteger(count) && count > 0)) throw new Error('BENCH_COUNTS must contain positive integers');
if (![duration, warmup, rounds].every(Number.isFinite) || duration <= 0 || warmup < 0 || !Number.isInteger(rounds) || rounds < 1) {
  throw new Error('Invalid benchmark durations or rounds');
}

const delay = ms => new Promise(resolveDelay => setTimeout(resolveDelay, ms));
const podsFor = count => Array.from({ length: count }, (_, index) => ({
  uid: `bench-${index}`,
  name: `worker-${index}`,
  namespace: `bench-${index % 8}`,
  node: `node-${index % 3}`,
  phase: index % 10 === 0 ? 'Failed' : 'Running',
  ready: index % 10 !== 0,
  restartCount: index % 10 === 0 ? 7 : 0,
  reason: index % 10 === 0 ? 'CrashLoopBackOff' : '',
  cpuMillis: 100,
  memMib: 128,
  createdAt: '2026-09-14T00:00:00.000Z',
  controller: { apiVersion: 'apps/v1', kind: 'ReplicaSet', name: `worker-${index % 8}`, uid: `rs-${index % 8}` },
  deletionTimestamp: '',
}));

async function verifyBaselineSource() {
  if (target !== 'baseline') return null;
  if (!baselineWebRoot) throw new Error('BENCH_BASELINE_ROOT must point to the baseline web directory when BENCH_TARGET=baseline');
  const resolvedWebRoot = await realpath(baselineWebRoot);
  if (basename(resolvedWebRoot) !== 'web') throw new Error(`BENCH_BASELINE_ROOT must name a web directory, got ${resolvedWebRoot}`);
  await access(resolve(resolvedWebRoot, 'package.json'));
  const { stdout: repoRootOutput } = await execFileAsync('git', ['-C', resolvedWebRoot, 'rev-parse', '--show-toplevel']);
  const repoRoot = repoRootOutput.trim();
  const { stdout: status } = await execFileAsync('git', ['-C', repoRoot, 'status', '--porcelain', '--untracked-files=no']);
  assert.equal(status.trim(), '', `Baseline tracked source must be clean:\n${status}`);
  const { stdout } = await execFileAsync('git', ['-C', repoRoot, 'rev-parse', 'HEAD']);
  const revision = stdout.trim();
  return { webRoot: resolvedWebRoot, repoRoot, revision };
}

async function waitForServer() {
  const until = Date.now() + 30_000;
  while (Date.now() < until) {
    try {
      if ((await fetch(url)).ok) return;
    } catch { /* Vite is still starting. */ }
    await delay(100);
  }
  throw new Error(`Timed out starting ${url}`);
}

async function startServer() {
  if (!autoServe) return null;
  await Promise.all([
    access(resolve(webRoot, 'package.json')),
    access(resolve(webRoot, 'node_modules', 'vite', 'bin', 'vite.js')),
  ]);
  const log = createWriteStream(resolve(output, 'server.log'));
  const child = spawn(process.execPath, [resolve(webRoot, 'node_modules', 'vite', 'bin', 'vite.js'), '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
    cwd: webRoot,
    env: { ...process.env, VITE_KUBEAQUARIUM_DEMO: '0' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.pipe(log);
  child.stderr.pipe(log);
  try {
    await waitForServer();
    return child;
  } catch (error) {
    child.kill('SIGTERM');
    throw error;
  }
}

async function resetToOverview(page) {
  // Escape is shared by both revisions. Each scenario has a fresh page, but
  // this also proves its measured state begins outside every modal and dive.
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.__kubeaquarium?.diveMode === false);
  await page.waitForFunction(() => {
    const hidden = selector => {
      const element = document.querySelector(selector);
      return !element || element.classList.contains('hidden') || getComputedStyle(element).display === 'none';
    };
    return hidden('#search') && hidden('#radar');
  });
}

async function panelIsOpen(page, selector) {
  return page.evaluate(panel => !document.querySelector(panel)?.classList.contains('hidden'), selector);
}

async function enterScenario(page, scenario) {
  await resetToOverview(page);
  if (scenario === 'overview') return;
  if (scenario === 'filter') {
    await page.keyboard.press('/');
    await page.waitForFunction(() => !document.querySelector('#search')?.classList.contains('hidden'));
    await page.locator('#search-input').fill('ns:bench-1');
    await page.waitForFunction(() => window.__kubeaquarium?.matched > 0);
    return;
  }
  if (scenario === 'radar') {
    await page.keyboard.press('ControlOrMeta+k');
    await page.waitForFunction(() => !document.querySelector('#radar')?.classList.contains('hidden'));
    await page.locator('#radar-input').fill('worker-1');
    await page.waitForFunction(() => document.querySelectorAll('.radar-row').length > 0);
    return;
  }
  await page.keyboard.press('f');
  await page.waitForFunction(() => window.__kubeaquarium?.diveMode === true);
  if (scenario === 'dive') return;
  await page.keyboard.press('ControlOrMeta+l');
  await page.waitForFunction(() => window.__kubeaquarium?.attackMode === true);
}

async function beginFrameSample(page, sampleMs) {
  await page.evaluate(ms => new Promise(resolveStarted => {
    const raw = [];
    let started;
    let previous;
    window.__benchmarkFrameSample = new Promise(resolveFinished => {
      const tick = timestamp => {
        if (previous !== undefined) raw.push(timestamp - previous);
        previous = timestamp;
        started ??= timestamp;
        if (timestamp - started < ms) return requestAnimationFrame(tick);
        const sorted = [...raw].sort((left, right) => left - right);
        const percentile = p => sorted.length ? sorted[Math.ceil(sorted.length * p) - 1] : 0;
        const canvas = document.querySelector('canvas');
        const resources = performance.getEntriesByType('resource');
        resolveFinished({
          raw,
          frames: raw.length,
          p50Ms: percentile(.5),
          p95Ms: percentile(.95),
          p99Ms: percentile(.99),
          over50Ms: raw.filter(value => value > 50).length,
          canvas: canvas ? { width: canvas.width, height: canvas.height, clientWidth: canvas.clientWidth, clientHeight: canvas.clientHeight } : null,
          resources: { entries: resources.length, transferSize: resources.reduce((sum, entry) => sum + (entry.transferSize || 0), 0) },
          domNodes: document.getElementsByTagName('*').length,
        });
      };
      requestAnimationFrame(tick);
    });
    requestAnimationFrame(() => resolveStarted());
  }), sampleMs);
}

async function finishFrameSample(page) {
  return page.evaluate(() => window.__benchmarkFrameSample);
}

async function waitFor(predicate, timeoutMs, message) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    if (predicate()) return;
    await delay(25);
  }
  throw new Error(message);
}

async function triggerImpactDuringSample(page, fixture) {
  const before = fixture.deleteUids.length;
  const previousHit = await page.evaluate(() => window.__kubeaquarium?.lastAttackHitUid ?? null);
  for (let attempt = 0; attempt < 5; attempt++) {
    await page.mouse.click(720, 450);
    try {
      await page.waitForFunction(lastHit => window.__kubeaquarium?.lastAttackHitUid !== lastHit, previousHit, { timeout: 1_500 });
      await waitFor(() => fixture.deleteUids.length > before, 3_000, 'Impact hit did not issue a mocked DELETE');
      const hitUid = await page.evaluate(() => window.__kubeaquarium?.lastAttackHitUid ?? null);
      assert.ok(hitUid, 'Impact has no hit UID');
      assert.equal(fixture.deleteUids.at(-1), hitUid, 'Mock DELETE UID differs from the impact UID');
      return;
    } catch (error) {
      if (attempt === 4) throw error;
      await page.keyboard.down('KeyW');
      await page.waitForTimeout(450);
      await page.keyboard.up('KeyW');
    }
  }
}

function checkpoint(state) {
  return writeFile(resolve(output, 'metrics.json'), JSON.stringify({ ...state, finishedAt: new Date().toISOString() }, null, 2));
}

async function createScenarioPage(browser, count) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const fixture = { pods: podsFor(count), deleteUids: [] };
  const errors = [];
  let socket;
  page.on('pageerror', error => errors.push(String(error)));
  page.on('console', message => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  await page.route('**/api/**', async route => {
    const request = route.request();
    if (request.method() === 'DELETE') {
      const requestUrl = new URL(request.url());
      const uid = requestUrl.searchParams.get('uid');
      const name = decodeURIComponent(requestUrl.pathname.split('/').at(-1) ?? '');
      const pod = fixture.pods.find(candidate => candidate.name === name && (uid === null || candidate.uid === uid));
      assert.ok(pod, `Synthetic DELETE referenced unknown pod uid=${uid} name=${name}`);
      fixture.deleteUids.push(pod.uid);
      await route.fulfill({ status: 202, contentType: 'application/json', body: JSON.stringify({ accepted: true, uid: pod.uid }) });
      socket?.send(JSON.stringify({ type: 'deleted', uid: pod.uid }));
      return;
    }
    const path = new URL(request.url()).pathname;
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(path.endsWith('/contexts') ? [{ name: 'BENCHMARK SIMULATED', current: true }] : { type: 'snapshot', pods: fixture.pods }),
    });
  });
  await page.routeWebSocket('**/api/stream', ws => {
    socket = ws;
    ws.send(JSON.stringify({ type: 'snapshot', pods: fixture.pods }));
  });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(expected => window.__kubeaquarium?.pods === expected, count, { timeout: 30_000 });
  return { page, fixture, errors };
}

async function runScenario(browser, count, round, scenario) {
  // A page (and therefore filter, attack, stream, deletion fixture, and debug
  // state) belongs to exactly one measurement.
  const { page, fixture, errors } = await createScenarioPage(browser, count);
  try {
    const initial = await page.evaluate(() => ({
      dpr: devicePixelRatio,
      userAgent: navigator.userAgent,
      frameMetrics: window.__kubeaquarium?.frameMetrics?.() ?? null,
    }));
    await enterScenario(page, scenario);
    await page.waitForTimeout(warmup);
    await beginFrameSample(page, duration);
    if (scenario === 'impact') await triggerImpactDuringSample(page, fixture);
    const sample = await finishFrameSample(page);
    const debug = await page.evaluate(() => ({
      mode: window.__kubeaquarium?.diveMode ? 'dive' : 'overview',
      attackMode: window.__kubeaquarium?.attackMode,
      hitUid: window.__kubeaquarium?.lastAttackHitUid,
      frameMetrics: window.__kubeaquarium?.frameMetrics?.() ?? null,
    }));
    if (scenario === 'overview') {
      assert.equal(debug.mode, 'overview', 'overview sample is still diving');
      assert.equal(await panelIsOpen(page, '#search'), false, 'overview sample has search open');
      assert.equal(await panelIsOpen(page, '#radar'), false, 'overview sample has radar open');
    }
    if (scenario === 'filter') assert.equal(await panelIsOpen(page, '#search'), true, 'filter panel closed during sample');
    if (scenario === 'radar') assert.equal(await panelIsOpen(page, '#radar'), true, 'radar panel closed during sample');
    if (scenario === 'dive' || scenario === 'impact') assert.equal(debug.mode, 'dive', `${scenario} left dive mode`);
    if (scenario === 'impact') {
      assert.equal(fixture.deleteUids.length, 1, 'Each measured impact must issue exactly one mocked DELETE');
      assert.equal(fixture.deleteUids[0], debug.hitUid, 'Measured impact did not delete its hit UID');
    }
    if (screenshots && round === 0) await page.screenshot({ path: resolve(output, `${count}-${scenario}.png`) });
    if (errors.length) throw new Error(`Browser errors for ${count} pods / ${scenario}:\n${errors.join('\n')}`);
    return { count, round, scenario, warmupMs: warmup, sampleMs: duration, initial, ...sample, debug, deletes: fixture.deleteUids.length };
  } finally {
    await page.close();
  }
}

await mkdir(output, { recursive: true });
const baselineSource = await verifyBaselineSource();
const startedAt = new Date().toISOString();
let server;
let browser;
const results = [];
const state = {
  target,
  sourceRevision: baselineSource?.revision ?? (await execFileAsync('git', ['-C', repo, 'rev-parse', 'HEAD'])).stdout.trim(),
  source: baselineSource ?? { webRoot, repoRoot: repo, revision: (await execFileAsync('git', ['-C', repo, 'rev-parse', 'HEAD'])).stdout.trim() },
  webRoot,
  url,
  startedAt,
  duration,
  warmup,
  rounds,
  counts,
  viewport: [1440, 900],
  deviceScaleFactor: 1,
  browser: null,
  machine: { platform: os.platform(), release: os.release(), version: os.version(), arch: os.arch(), model: os.cpus()[0]?.model ?? null },
  gpu: null,
  resourceMetrics: 'DOM and PerformanceResourceTiming are collected. Renderer resource counts are null unless the application explicitly exposes them; null never means zero.',
  results,
};
try {
  server = await startServer();
  browser = await chromium.launch({ headless: true, args: ['--enable-gpu', '--use-angle=metal', '--ignore-gpu-blocklist'] });
  state.browser = browser.version();
  try {
    const cdp = await browser.newBrowserCDPSession();
    state.gpu = await cdp.send('SystemInfo.getInfo');
    await cdp.detach();
  } catch (error) {
    state.gpu = { unavailable: String(error) };
  }
  for (const count of counts) for (let round = 0; round < rounds; round++) for (const scenario of ['overview', 'filter', 'radar', 'dive', 'impact']) {
    const result = await runScenario(browser, count, round, scenario);
    results.push(result);
    await checkpoint(state);
    console.log(JSON.stringify({ target, count, round, scenario, p95Ms: result.p95Ms, over50Ms: result.over50Ms, deletes: result.deletes }));
  }
} finally {
  await checkpoint(state);
  await browser?.close();
  server?.kill('SIGTERM');
}
