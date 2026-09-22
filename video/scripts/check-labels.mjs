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
  const layerOrder = await page.evaluate(() => ({
    labels: getComputedStyle(document.getElementById('labels')).zIndex,
    hud: getComputedStyle(document.getElementById('hud')).zIndex,
    labelPosition: getComputedStyle(document.querySelector('.namespace-label')).position,
  }));
  assert.deepEqual(layerOrder, { labels: '10', hud: '20', labelPosition: 'absolute' }, 'labels did not use the HUD layer rules');
  const overlapsInteractiveHud = await page.evaluate(() => {
    const intersects = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
    const panels = [...document.querySelectorAll('.topbar, #demo-mission')]
      .map(element => element.getBoundingClientRect())
      .filter(rect => rect.width > 0 && rect.height > 0);
    return [...document.querySelectorAll('.pod-label.visible, .namespace-label.visible')]
      .some(label => panels.some(panel => intersects(label.getBoundingClientRect(), panel)));
  });
  assert.equal(overlapsInteractiveHud, false, 'labels overlapped an interactive HUD panel');

  await page.locator('#camera-settings summary').click();
  await page.waitForFunction(() => {
    const settings = document.querySelector('.settings-panel');
    return document.getElementById('camera-settings')?.open && settings?.getBoundingClientRect().height;
  });
  const overlapsSettings = await page.evaluate(() => {
    const settings = document.querySelector('.settings-panel')?.getBoundingClientRect();
    if (!settings) return false;
    return [...document.querySelectorAll('.pod-label.visible, .namespace-label.visible')]
      .some(label => {
        const rect = label.getBoundingClientRect();
        return rect.left < settings.right && rect.right > settings.left && rect.top < settings.bottom && rect.bottom > settings.top;
      });
  });
  assert.equal(overlapsSettings, false, 'labels overlapped the open camera settings panel');

  await page.keyboard.press('Control+k');
  await page.waitForFunction(() => !document.getElementById('radar')?.classList.contains('hidden'));
  const labelsWhileRadarOpen = await page.locator('.pod-label.visible, .namespace-label.visible').count();
  assert.equal(labelsWhileRadarOpen, 0, 'labels remained visible while the radar was open');

  const poolResult = await page.evaluate(async () => {
    const root = document.getElementById('labels');
    root.replaceChildren();
    const { LabelLayer } = await import('/src/hud/labels.ts');
    const layer = new LabelLayer();
    const context = { mode: 'overview', filterActive: false, modalOpen: false, blockedRects: [] };
    const target = (uid, x = innerWidth / 2, y = innerHeight / 2, focused = false) => ({
      uid,
      name: uid,
      namespace: `namespace-${uid}`,
      status: 'Running',
      statusClass: 'ok',
      screen: { x, y, depth: 100, offsetY: 22 },
      matched: false,
      focused,
    });

    const candidates = Array.from({ length: 81 }, (_, index) => target(`pod-${index}`, 80, 300));
    candidates.push(target('focused-after-eighty', innerWidth / 2, innerHeight / 2, true));
    layer.render(candidates, context);
    const focusedVisible = [...document.querySelectorAll('.pod-label.visible')]
      .some(element => element.textContent.includes('focused-after-eighty'));

    const blocked = { left: 300, right: 980, top: 180, bottom: 560 };
    layer.render([target('blocked', innerWidth / 2, innerHeight / 2)], { ...context, blockedRects: [blocked] });
    const blockedVisible = document.querySelectorAll('.pod-label.visible').length;

    for (let index = 0; index < 3_000; index += 1) {
      layer.render([target(`churn-${index}`)], { ...context, filterActive: true });
      layer.renderNamespaces([{ namespace: `namespace-${index}`, total: index + 1, unhealthy: index % 3, x: innerWidth / 2, y: 120, depth: index }], context);
    }
    const bounded = {
      pods: document.querySelectorAll('.pod-label').length,
      namespaces: document.querySelectorAll('.namespace-label').length,
    };

    layer.render([], context);
    layer.renderNamespaces([{ namespace: 'a-very-long-namespace-name-that-needs-measuring-after-resize', total: 9, unhealthy: 2, x: innerWidth / 2, y: innerHeight / 2, depth: 1 }], context);
    const beforeResize = document.querySelector('.namespace-label.visible')?.getBoundingClientRect();
    layer.render([target('modal-hidden')], { ...context, modalOpen: true });
    layer.renderNamespaces([{ namespace: 'modal-hidden', total: 1, unhealthy: 0, x: 300, y: 300, depth: 1 }], { ...context, modalOpen: true });
    const hiddenForModal = document.querySelectorAll('.pod-label.visible, .namespace-label.visible').length;
    return { focusedVisible, blockedVisible, bounded, beforeResize, hiddenForModal };
  });
  assert.equal(poolResult.focusedVisible, true, 'focused candidate after 80 targets was not shown');
  assert.equal(poolResult.blockedVisible, 0, 'label was placed over a blocked rectangle');
  assert.deepEqual(poolResult.bounded, { pods: 16, namespaces: 12 }, 'label pools grew while UIDs churned');
  assert.ok(poolResult.beforeResize, 'namespace summary was not visible before resize');
  assert.equal(poolResult.hiddenForModal, 0, 'modal context did not hide label pools');

  await page.setViewportSize({ width: 640, height: 480 });
  const resizedSummary = await page.evaluate(async () => {
    const root = document.getElementById('labels');
    root.replaceChildren();
    const { LabelLayer } = await import('/src/hud/labels.ts');
    const layer = new LabelLayer();
    layer.renderNamespaces([{
      namespace: 'a-very-long-namespace-name-that-needs-measuring-after-resize',
      total: 9,
      unhealthy: 2,
      x: innerWidth / 2,
      y: innerHeight / 2,
      depth: 1,
    }], { mode: 'overview', filterActive: false, modalOpen: false, blockedRects: [] });
    const rect = document.querySelector('.namespace-label.visible')?.getBoundingClientRect();
    return rect && { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: innerWidth, height: innerHeight };
  });
  assert.ok(resizedSummary, 'namespace summary did not reappear after resize');
  assert.ok(resizedSummary.left >= 8 && resizedSummary.right <= resizedSummary.width - 8, 'namespace label used stale width after resize');
  assert.ok(resizedSummary.top >= 8 && resizedSummary.bottom <= resizedSummary.height - 8, 'namespace label used stale height after resize');
  assert.deepEqual(errors, [], `page errors: ${errors.map(String).join('\n')}`);
} finally {
  await browser.close();
}
