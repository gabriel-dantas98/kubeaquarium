import assert from 'node:assert/strict';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { assertNoUnsafeNetwork, blockUnsafeNetwork, requireDemoUrl } from './recovery-demo.mjs';

const output = path.resolve(process.env.PLAYTHROUGH_OUTPUT ?? 'output/playwright/fleet-playthrough');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--enable-gpu', '--use-angle=metal', '--ignore-gpu-blocklist'] });
const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, recordVideo: { dir: output, size: { width: 1280, height: 720 } } });
const page = await context.newPage();
const recording = await page.video().path();
const errors = [];
page.on('pageerror', error => errors.push(String(error)));
const blocked = await blockUnsafeNetwork(page);
const report = { models: [], errors };
const pose = () => page.evaluate(() => window.__kubeaquarium.navigationDebug());
const distance = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]));
try {
  await page.goto(requireDemoUrl());
  await page.waitForFunction(() => window.__kubeaquarium?.pods > 0);
  await page.evaluate(async () => {
    const { runSubmarineTests } = await import('/src/submarine.test.ts');
    runSubmarineTests();
  });
  await page.locator('#demo-mission').getByRole('button', { name: 'Explore freely' }).click();
  await page.locator('#camera-settings summary').click();
  await page.locator('#reduce-motion').check();
  await page.locator('#camera-settings summary').click();
  for (const model of ['nautilus', 'manta', 'atlas']) {
    await page.locator('#camera-settings summary').click();
    await page.locator('#submarine-model').selectOption(model);
    await page.locator('#camera-settings summary').click();
    if ((await pose()).mode !== 'dive') await page.keyboard.press('f');
    const start = await pose();
    await page.keyboard.down('w');
    await page.waitForTimeout(1100);
    await page.keyboard.up('w');
    const moved = await pose();
    assert.ok(distance(start.position, moved.position) > 1, `${model}: forward movement failed`);
    await page.mouse.move(620, 350);
    await page.mouse.down({ button: 'right' });
    await page.mouse.move(780, 390, { steps: 30 });
    await page.mouse.up({ button: 'right' });
    const turned = await pose();
    assert.ok(distance(moved.direction, turned.direction) > .05, `${model}: steering failed`);
    await page.keyboard.down('d');
    await page.waitForTimeout(800);
    await page.keyboard.up('d');
    await page.screenshot({ path: path.join(output, `${model}.png`) });
    await page.waitForTimeout(800);
    report.models.push({ model, moved: distance(start.position, moved.position), turned: distance(moved.direction, turned.direction) });
    await page.locator('#overview-toggle').click();
    await page.waitForFunction(() => !window.__kubeaquarium.diveMode);
  }
  await page.reload();
  await page.waitForFunction(() => window.__kubeaquarium?.pods > 0);
  assert.equal(await page.locator('#submarine-model').inputValue(), 'atlas', 'vehicle choice did not persist');
  assertNoUnsafeNetwork(blocked);
  assert.deepEqual(errors, []);
} finally {
  await context.close();
  await browser.close();
  await rename(recording, path.join(output, 'playthrough.webm'));
  await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
}
console.log(JSON.stringify(report));
