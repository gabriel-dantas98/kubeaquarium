import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { blockUnsafeNetwork, requireDemoUrl } from './recovery-demo.mjs';

const url = requireDemoUrl();
const output = path.resolve(process.env.VISUAL_CAPTURE_OUTPUT ?? 'docs/screenshots/visual-feedback');
const sizes = [[1600, 900], [1280, 720]];
await mkdir(output, { recursive: true });
const manifest = { url, startedAt: new Date().toISOString(), captures: [], errors: [] };

function name(size, stage, reduced) { return `${size[0]}x${size[1]}-${stage}${reduced ? '-reduced' : ''}.png`; }
async function labelsDoNotIntersect(page) {
  return page.evaluate(() => {
    const overlap = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
    return ![...document.querySelectorAll('.pod-label.visible,.namespace-label.visible')].some(label =>
      [...document.querySelectorAll('.topbar,#search:not(.hidden),#radar:not(.hidden),.detail:not(.hidden)')].some(panel => overlap(label.getBoundingClientRect(), panel.getBoundingClientRect())));
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
    const shot = async (stage, reduced = false) => {
      const file = path.join(output, name(size, stage, reduced));
      await page.screenshot({ path: file });
      manifest.captures.push({ file, stage, size, reduced, labelsNonIntersecting: await labelsDoNotIntersect(page) });
    };
    await shot('overview');
    await page.keyboard.press('/'); await page.locator('#search-input').fill('ns:demo'); await shot('filter'); await page.keyboard.press('Escape');
    await page.keyboard.press('ControlOrMeta+k'); await page.locator('#radar-input').fill('checkout'); await shot('radar'); await page.keyboard.press('Enter'); await page.waitForTimeout(950); await shot('focus'); await page.keyboard.press('Escape');
    await page.keyboard.press('f'); await page.waitForFunction(() => window.__kubeaquarium?.diveMode === true); await shot('dive');
    await page.keyboard.press('ControlOrMeta+l');
    const before = await page.evaluate(() => window.__kubeaquarium?.lastAttackHitUid ?? null);
    await page.mouse.click(size[0] / 2, size[1] / 2);
    await page.waitForFunction(hit => window.__kubeaquarium?.lastAttackHitUid !== hit, before, { timeout: 5_000 });
    await shot('impact'); // immediate after confirmed hit; particle visibility is recorded, not assumed.
    await page.keyboard.press('Escape');
    await page.locator('#reduce-motion').check();
    await page.keyboard.press('f'); await page.waitForFunction(() => window.__kubeaquarium?.diveMode === true); await shot('dive', true);
    if (blocked.length || errors.length) throw new Error(`blocked=${blocked.join(',')} errors=${errors.join(',')}`);
  } catch (error) { manifest.errors.push({ size, error: String(error), blocked, errors }); }
  finally { await browser.close(); }
}
await writeFile(path.join(output, 'manifest.json'), JSON.stringify({ ...manifest, finishedAt: new Date().toISOString() }, null, 2));
if (manifest.errors.length) throw new Error(JSON.stringify(manifest.errors));
