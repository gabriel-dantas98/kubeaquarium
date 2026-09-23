import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { blockUnsafeNetwork, requireDemoUrl } from './recovery-demo.mjs';

const url = requireDemoUrl();
const output = path.resolve(process.env.VISUAL_CAPTURE_OUTPUT ?? 'docs/screenshots/visual-feedback');
const sizes = [[1600, 900], [1280, 720]];
await mkdir(output, { recursive: true });
const manifest = { url, startedAt: new Date().toISOString(), captures: [], errors: [], impactCapture: { timing: 'immediately after lastAttackHitUid changes', effectDurationMs: 250, limitation: 'A screenshot may miss particles if compositor scheduling exceeds the short effect duration.' } };

function name(size, stage, reduced) { return `${size[0]}x${size[1]}-${stage}${reduced ? '-reduced' : ''}.png`; }
async function settle(page, selector, opacity) {
  await page.waitForFunction(({ selector, opacity }) => Number(getComputedStyle(document.querySelector(selector)).opacity) >= opacity, { selector, opacity });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}
async function labelsDoNotIntersect(page) {
  return page.evaluate(() => {
    const overlap = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
    const labels = [...document.querySelectorAll('.pod-label.visible,.namespace-label.visible')];
    const panels = [...document.querySelectorAll('.topbar,#search:not(.hidden),#radar:not(.hidden),.detail:not(.hidden),#demo-mission,#recovery-panel')].filter(panel => { const rect = panel.getBoundingClientRect(); return rect.width > 0 && rect.height > 0; });
    return !labels.some((label, index) => panels.some(panel => overlap(label.getBoundingClientRect(), panel.getBoundingClientRect())) || labels.slice(index + 1).some(other => overlap(label.getBoundingClientRect(), other.getBoundingClientRect())));
  });
}

for (const size of sizes) {
  const browser = await chromium.launch({ headless: true, args: ['--enable-gpu', '--use-angle=metal', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: size[0], height: size[1] } });
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  const blocked = await blockUnsafeNetwork(page);
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__kubeaquarium?.pods > 0);
    await page.waitForFunction(() => document.querySelectorAll('.namespace-label.visible').length > 0);
    await page.waitForTimeout(300);
    const shot = async (stage, reduced = false) => {
      const file = path.join(output, name(size, stage, reduced));
      await page.evaluate(() => window.__kubeaquarium?.pause?.());
      const labelsNonIntersecting = await labelsDoNotIntersect(page);
      if (!labelsNonIntersecting) throw new Error(`Visible labels overlap during ${stage}`);
      await page.screenshot({ path: file });
      await page.evaluate(() => window.__kubeaquarium?.resume?.());
      manifest.captures.push({ file, stage, size, reduced, labelsNonIntersecting });
    };
    await shot('overview');
    await page.keyboard.press('/'); await page.locator('#search-input').fill('ns:bench-payments'); await page.waitForFunction(() => window.__kubeaquarium?.matched > 0); await settle(page, '#search', .99); await shot('filter'); await page.keyboard.press('Escape'); await page.waitForFunction(() => Number(getComputedStyle(document.querySelector('#search')).opacity) <= .01);
    await page.keyboard.press('ControlOrMeta+k'); await page.locator('#radar-input').fill('checkout'); await settle(page, '#radar', .99); await shot('radar'); await page.keyboard.press('Enter'); await page.waitForTimeout(950); await shot('focus'); await page.keyboard.press('Escape');
    const mission = page.locator('#demo-mission');
    await mission.getByRole('button', { name: 'Find pod' }).click();
    await mission.getByRole('button', { name: 'Inspect failure' }).click();
    await mission.getByRole('button', { name: 'Prepare submarine' }).click();
    await page.waitForFunction(() => window.__kubeaquarium?.diveMode === true); await shot('dive');
    if (!await page.evaluate(() => window.__kubeaquarium?.attackMode)) await page.keyboard.press('ControlOrMeta+l');
    const before = await page.evaluate(() => window.__kubeaquarium?.lastAttackHitUid ?? null);
    await page.mouse.click(size[0] / 2, size[1] / 2);
    await page.waitForFunction(hit => window.__kubeaquarium?.lastAttackHitUid !== hit, before, { timeout: 5_000 });
    await shot('impact'); // immediate after confirmed hit; the ~250ms effect is recorded, never assumed.
    await page.keyboard.press('Escape');
    await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForFunction(() => window.__kubeaquarium?.pods > 0);
    await page.locator('#camera-settings summary').click(); await page.locator('#reduce-motion').check(); await page.locator('#camera-settings summary').click();
    const reducedMission = page.locator('#demo-mission');
    await reducedMission.getByRole('button', { name: 'Find pod' }).click(); await reducedMission.getByRole('button', { name: 'Inspect failure' }).click(); await reducedMission.getByRole('button', { name: 'Prepare submarine' }).click();
    await page.waitForFunction(() => window.__kubeaquarium?.diveMode === true); await shot('dive', true);
    const reducedBefore = await page.evaluate(() => window.__kubeaquarium?.lastAttackHitUid ?? null);
    await page.mouse.click(size[0] / 2, size[1] / 2); await page.waitForFunction(hit => window.__kubeaquarium?.lastAttackHitUid !== hit, reducedBefore, { timeout: 5_000 }); await shot('impact', true);
    if (blocked.length || errors.length) throw new Error(`blocked=${blocked.join(',')} errors=${errors.join(',')}`);
  } catch (error) { manifest.errors.push({ size, error: String(error), blocked, errors }); }
  finally { await browser.close(); }
}
await writeFile(path.join(output, 'manifest.json'), JSON.stringify({ ...manifest, finishedAt: new Date().toISOString() }, null, 2));
if (manifest.errors.length) throw new Error(JSON.stringify(manifest.errors));
