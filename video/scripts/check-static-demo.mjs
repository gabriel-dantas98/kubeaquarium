import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const target = new URL(process.env.DEMO_URL ?? 'http://127.0.0.1:7782/kubeaquarium/');
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(target.hostname), 'Static demo checks must run on localhost');
assert.ok(['http:', 'https:'].includes(target.protocol), 'Use an HTTP preview URL');
assert.equal(target.search, '', 'Use the built demo URL without query parameters');

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [], apiRequests = [], sockets = [];
page.on('pageerror', error => errors.push(error.stack ?? error.message));
page.on('request', request => {
  if (new URL(request.url()).pathname.split('/').includes('api')) apiRequests.push(request.url());
});
page.on('websocket', socket => sockets.push(socket.url()));

try {
  const response = await page.goto(target.href, { waitUntil: 'networkidle' });
  assert.equal(response?.status(), 200, 'Static demo must load successfully');
  const html = await response.text();
  for (const field of ['og:title', 'og:description', 'og:type', 'og:url', 'og:image', 'twitter:card']) {
    assert.ok(html.includes(`"${field}"`), `${field} must exist in server HTML without JavaScript`);
  }
  const imagePath = new URL('social/kubeaquarium.png', target);
  const image = await page.request.get(imagePath.href);
  assert.equal(image.status(), 200, 'Social card must exist at the deployed base path');
  assert.ok(image.headers()['content-type']?.startsWith('image/png'));
  const png = await image.body();
  assert.equal(png.readUInt32BE(16), 1200);
  assert.equal(png.readUInt32BE(20), 630);
  await page.waitForFunction(() => window.__kubeaquarium?.pods > 0);
  assert.equal(new URL(page.url()).search, '', 'Demo must work without ?demo');
  const pods = await page.evaluate(() => window.__kubeaquarium.pods);
  const models = ['nautilus', 'manta', 'atlas'];
  assert.deepEqual(await page.locator('#submarine-model option').evaluateAll(options => options.map(option => option.value)), models);

  for (const model of models) {
    await page.locator('#camera-settings > summary').click();
    await page.locator('#submarine-model').selectOption(model);
    await page.waitForFunction(expected => window.__kubeaquarium.submarineDebug().model === expected, model);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__kubeaquarium?.pods > 0);
    assert.equal(await page.locator('#submarine-model').inputValue(), model, `${model} selection must persist`);
    assert.equal(await page.evaluate(() => window.__kubeaquarium.submarineDebug().model), model, `${model} hull must persist`);
  }
  assert.deepEqual(apiRequests, [], 'Built demo must make no API HTTP requests');
  assert.deepEqual(sockets, [], 'Built demo must open no WebSocket connections');
  assert.deepEqual(errors, [], 'Built demo must have zero page errors');
  console.log(JSON.stringify({ url: target.href, pods, models, persistence: 'passed', apiRequests, sockets, pageErrors: errors }, null, 2));
} finally {
  await browser.close();
}
