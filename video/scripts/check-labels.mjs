import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', error => errors.push(error));

try {
  await page.goto(process.env.DEMO_URL ?? 'http://127.0.0.1:7781/?demo');
  await page.waitForFunction(() => window.__kubeaquarium?.pods > 0);
  await page.waitForFunction(() => document.querySelectorAll('.namespace-label.visible').length > 0);

  const overviewLabels = await page.locator('.namespace-label.visible').count();
  assert.ok(overviewLabels > 0, 'namespace labels did not appear in overview');
  const overlapsInteractiveHud = await page.evaluate(() => {
    const intersects = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
    const panels = [...document.querySelectorAll('.topbar, #demo-mission')]
      .map(element => element.getBoundingClientRect())
      .filter(rect => rect.width > 0 && rect.height > 0);
    return [...document.querySelectorAll('.pod-label.visible, .namespace-label.visible')]
      .some(label => panels.some(panel => intersects(label.getBoundingClientRect(), panel)));
  });
  assert.equal(overlapsInteractiveHud, false, 'labels overlapped an interactive HUD panel');

  await page.keyboard.press('Control+k');
  await page.waitForFunction(() => !document.getElementById('radar')?.classList.contains('hidden'));
  const labelsWhileRadarOpen = await page.locator('.pod-label.visible, .namespace-label.visible').count();
  assert.equal(labelsWhileRadarOpen, 0, 'labels remained visible while the radar was open');
  assert.deepEqual(errors, [], `page errors: ${errors.map(String).join('\n')}`);
} finally {
  await browser.close();
}
