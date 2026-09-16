import { chromium } from 'playwright';

const url = process.env.DEMO_URL || 'http://127.0.0.1:7781/?demo';
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error));
  await page.clock.install();
  await page.goto(url);
  await page.evaluate(async () => {
    const recovery = await import('/src/recovery.test.ts');
    const operations = await import('/src/operations.test.ts');
    const stream = await import('/src/stream.test.ts');
    recovery.testObservedRecovery();
    recovery.runRecoveryTests();
    await operations.runOperationsTests();
    await stream.runStreamTests();
  });
  await page.clock.runFor(1);
  if (errors.length) throw new Error(`page errors: ${errors.map(String).join('\n')}`);
  console.log('recovery frontend tests passed');
} finally {
  await browser?.close();
}
