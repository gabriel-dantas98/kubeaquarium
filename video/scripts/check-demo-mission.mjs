import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', error => errors.push(String(error)));

try {
  await page.goto(process.env.DEMO_URL ?? 'http://127.0.0.1:7781/?demo');
  await page.waitForFunction(() => window.__kubeaquarium?.pods > 0);

  const mission = page.locator('#demo-mission');
  for (let cycle = 0; cycle < 2; cycle++) {
    await mission.getByRole('button', { name: 'Find pod' }).click();
    await mission.getByRole('button', { name: 'Inspect failure' }).click();
    await mission.getByRole('button', { name: 'Prepare submarine' }).click();
    await page.waitForFunction(() => window.__kubeaquarium?.diveMode === true, { timeout: 5000 });
    await page.mouse.click(640, 360);
    await mission.getByText('Watch the new pod become Ready').waitFor({ timeout: 5000 });
    await mission.getByText('Recovery observed').waitFor({ timeout: 7000 });
    if (cycle === 0) await mission.getByRole('button', { name: 'Restart mission' }).click();
  }

  if (errors.length) throw new Error(`page errors: ${errors.join('\n')}`);
  console.log('visible demo mission flow passed');
} finally {
  await browser.close();
}
