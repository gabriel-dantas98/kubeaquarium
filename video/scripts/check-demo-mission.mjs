import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', error => errors.push(String(error)));

try {
  await page.goto(process.env.DEMO_URL ?? 'http://127.0.0.1:7781/?demo');
  await page.waitForFunction(() => window.__kubeaquarium?.pods > 0);
  await page.evaluate(async () => {
    const moduleUrl = performance.getEntriesByType('resource')
      .map(entry => entry.name)
      .find(name => new URL(name).pathname === '/src/demo.ts');
    if (!moduleUrl) throw new Error('loaded DemoStream module was not found');
    const { DemoStream } = await import(moduleUrl);
    const original = DemoStream.prototype.deletePod;
    DemoStream.prototype.deletePod = async function(pod) {
      const accepted = await original.call(this, pod);
      await new Promise(resolve => window.setTimeout(resolve, 5000));
      return accepted;
    };

  });

  const mission = page.locator('#demo-mission');
  for (let cycle = 0; cycle < 2; cycle++) {
    await mission.getByRole('button', { name: 'Find pod' }).click();
    await mission.getByRole('button', { name: 'Inspect failure' }).click();
    await mission.getByRole('button', { name: 'Prepare submarine' }).click();
    await page.waitForFunction(() => window.__kubeaquarium?.diveMode === true, { timeout: 5000 });
    await mission.locator('p').click();
    await page.waitForTimeout(100);
    if (await page.evaluate(() => window.__kubeaquarium.projectiles !== 0) || await page.locator('[data-operation-phase]').count() !== 0) {
      throw new Error('clicking mission copy fired a simulated delete');
    }
    await page.mouse.click(640, 360);
    await page.locator('[data-operation-phase="ready"][data-target-uid="demo-mission-old"]').waitFor({ timeout: 6000 });
    if (!await mission.getByText('Fire a simulated request').isVisible()) throw new Error(`guide advanced before delayed DELETE acceptance: ${await mission.textContent()}`);
    try {
      await mission.getByText('Recovery observed').waitFor({ timeout: 6000 });
    } catch {
      throw new Error(`guide did not complete after delayed acceptance: ${await mission.textContent()}`);
    }
    if (cycle === 0) await mission.getByRole('button', { name: 'Restart mission' }).click();
  }

  if (errors.length) throw new Error(`page errors: ${errors.join('\n')}`);
  console.log('visible demo mission flow passed');
} finally {
  await browser.close();
}
