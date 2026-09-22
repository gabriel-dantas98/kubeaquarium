import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', error => errors.push(error));
const pose = () => page.evaluate(() => window.__kubeaquarium.navigationDebug());
const distance = (a, b) => Math.hypot(...a.map((value, index) => value - b[index]));
const directionDelta = (a, b) => Math.hypot(...a.map((value, index) => value - b[index]));

async function openRadar() {
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+k' : 'Control+k');
  await page.locator('#radar-input').waitFor({ state: 'visible' });
}
async function closeRadar() {
  if (await page.locator('#radar').evaluate(node => !node.classList.contains('hidden'))) {
    await page.locator('#radar-input').press('Escape');
    await page.waitForFunction(() => document.getElementById('radar')?.classList.contains('hidden'));
  }
}

try {
  await page.goto(process.env.DEMO_URL ?? 'http://127.0.0.1:5173/?demo');
  await page.waitForFunction(() => window.__kubeaquarium?.pods > 0);

  const spatial = await page.evaluate(async () => {
    const { layoutNamespaces } = await import('/src/namespaces.ts');
    const { projectRadar } = await import('/src/hud/radar-projection.ts');
    const state = { allocations: new Map() };
    const first = layoutNamespaces(['a', 'b'], new Map([['a', 1], ['b', 100]]), state);
    const before = Object.fromEntries([...first].map(([name, value]) => [name, value.center.toArray()]));
    const grown = layoutNamespaces(['a', 'b'], new Map([['a', 1000], ['b', 1]]), state);
    const after = Object.fromEntries([...grown].map(([name, value]) => [name, value.center.toArray()]));
    const radarPose = { position: { x: 0, y: 0, z: 0 }, forward: { x: 0, y: 0, z: -1 } };
    return { before, after, grown: [...grown].map(([, value]) => ({ radius: value.radius, capacity: value.capacityRadius })),
      front: projectRadar({ x: 0, y: 0, z: -10 }, radarPose, 100), right: projectRadar({ x: 10, y: 0, z: 0 }, radarPose, 100) };
  });
  assert.deepEqual(spatial.before, spatial.after, 'namespace centers moved after count changes');
  assert.ok(spatial.grown.every(item => item.radius <= item.capacity));
  assert.ok(Math.abs(spatial.front.x) < 1e-9 && spatial.front.y < 0);
  assert.ok(spatial.right.x > 0 && Math.abs(spatial.right.y) < 1e-9);

  const beforeTyping = await pose();
  await openRadar();
  await page.locator('#radar-input').fill('fw asd');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Space');
  await page.keyboard.press('Shift');
  const afterTyping = await pose();
  assert.equal(afterTyping.mode, 'orbit');
  assert.ok(distance(beforeTyping.position, afterTyping.position) < 1e-6, 'typing in radar moved camera');
  assert.ok(directionDelta(beforeTyping.direction, afterTyping.direction) < 1e-6, 'typing in radar turned camera');
  await closeRadar();

  await page.keyboard.press('Control+f');
  await page.keyboard.press('Meta+f');
  assert.equal((await pose()).mode, 'orbit', 'modified F toggled dive');
  await page.mouse.move(560, 360);
  await page.mouse.down();
  await page.mouse.move(680, 390, { steps: 4 });
  await page.mouse.up();
  assert.ok(await page.locator('#detail').evaluate(node => node.classList.contains('hidden')), 'orbit drag selected a pod');

  await page.keyboard.press('f');
  assert.equal((await pose()).mode, 'dive');
  await page.keyboard.down('w');
  await page.waitForTimeout(120);
  await openRadar();
  await closeRadar();
  const blockedStart = await pose();
  await page.waitForTimeout(180);
  const blockedEnd = await pose();
  assert.ok(distance(blockedStart.position, blockedEnd.position) < 0.02, 'movement resumed after closing radar without a new keydown');
  await page.keyboard.down('w');
  await page.waitForTimeout(100);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  const blurStart = await pose();
  await page.waitForTimeout(140);
  const blurEnd = await pose();
  assert.ok(distance(blurStart.position, blurEnd.position) < 0.02, 'blur left movement active');
  await page.keyboard.up('w');

  const canvas = page.locator('#scene');
  const beforeLook = await pose();
  await canvas.click({ button: 'right', position: { x: 620, y: 360 } });
  await page.mouse.move(620, 360);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(720, 390, { steps: 4 });
  await page.mouse.up({ button: 'right' });
  const afterLook = await pose();
  assert.ok(distance(beforeLook.position, afterLook.position) < 1e-6, 'looking translated the camera');
  assert.ok(directionDelta(beforeLook.direction, afterLook.direction) > 0.02, 'right drag did not turn the camera');
  await page.keyboard.down('w');
  await page.waitForTimeout(150);
  await page.keyboard.up('w');
  const afterForward = await pose();
  const displacement = afterForward.position.map((value, index) => value - afterLook.position[index]);
  assert.ok(displacement.reduce((sum, value, index) => sum + value * afterLook.direction[index], 0) > 0, 'W did not move in the looked direction');

  await openRadar();
  await page.locator('#radar-input').press('Enter');
  await page.waitForFunction(() => !document.getElementById('detail')?.classList.contains('hidden'));
  await openRadar();
  await page.locator('#radar-input').press('Escape');
  await page.waitForFunction(() => document.getElementById('radar')?.classList.contains('hidden'));
  assert.ok(await page.locator('#detail').evaluate(node => !node.classList.contains('hidden')), 'one Escape also closed detail');
  await page.locator('#detail [data-close]').click();

  await page.locator('#camera-settings summary').click();
  await page.locator('#look-sensitivity').evaluate((node) => {
    const input = node;
    input.value = '2';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.locator('#invert-look').check();
  await page.locator('#reduce-motion').check();
  await page.waitForTimeout(50);
  await page.reload();
  await page.waitForFunction(() => window.__kubeaquarium?.pods > 0);
  const settings = await page.evaluate(() => JSON.parse(localStorage.getItem('kubeaquarium.camera.v1')));
  assert.deepEqual(settings, { lookSensitivity: 2, invertY: true, reducedMotion: true }, 'camera preferences did not persist');
  await page.keyboard.press('f');
  await page.keyboard.down('w');
  await page.waitForTimeout(80);
  await page.keyboard.up('w');
  const reducedStart = await pose();
  await page.waitForTimeout(100);
  const reducedEnd = await pose();
  assert.ok(distance(reducedStart.position, reducedEnd.position) < 0.02, 'reduced motion kept dive inertia');

  const rightDrag = async () => {
    const start = await pose();
    await page.mouse.move(600, 360); await page.mouse.down({ button: 'right' });
    await page.mouse.move(650, 360, { steps: 3 }); await page.mouse.up({ button: 'right' });
    return directionDelta(start.direction, (await pose()).direction);
  };
  await page.locator('#camera-settings summary').click();
  await page.locator('#look-sensitivity').evaluate(node => {
    const input = node; input.value = '1'; input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.locator('#camera-settings summary').click();
  const lowSensitivity = await rightDrag();
  await page.locator('#camera-settings summary').click();
  await page.locator('#look-sensitivity').evaluate(node => {
    const input = node; input.value = '2'; input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.locator('#camera-settings summary').click();
  const highSensitivity = await rightDrag();
  assert.ok(highSensitivity > lowSensitivity * 1.8, `sensitivity 2 did not approximately double look change (${lowSensitivity}, ${highSensitivity})`);

  const verticalDelta = async (inverted) => {
    const checkbox = page.locator('#invert-look');
    await page.locator('#camera-settings summary').click();
    if (await checkbox.isChecked() !== inverted) await checkbox.click();
    await page.locator('#camera-settings summary').click();
    const start = await pose();
    await page.mouse.move(600, 360); await page.mouse.down({ button: 'right' });
    await page.mouse.move(600, 390, { steps: 3 }); await page.mouse.up({ button: 'right' });
    return (await pose()).direction[1] - start.direction[1];
  };
  const normalVertical = await verticalDelta(false);
  const invertedVertical = await verticalDelta(true);
  assert.ok(normalVertical * invertedVertical < 0, 'invert vertical look did not reverse pitch');

  await page.locator('#overview-toggle').click();
  await page.waitForTimeout(200);
  const pick = await page.evaluate(async () => {
    window.__kubeaquarium.pause();
    const THREE = await import('/node_modules/.vite/deps/three.js');
    const pose = window.__kubeaquarium.navigationDebug();
    const camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, .1, 10000);
    camera.position.fromArray(pose.position);
    camera.lookAt(camera.position.clone().add(new THREE.Vector3().fromArray(pose.direction)));
    camera.updateMatrixWorld();
    return window.__kubeaquarium.slotsDebug().map(slot => {
      const world = new THREE.Vector3().fromArray(slot.pos);
      const projected = world.clone().project(camera);
      return { x: (projected.x * .5 + .5) * innerWidth, y: (-projected.y * .5 + .5) * innerHeight,
        z: projected.z, size: slot.scale / world.distanceTo(camera.position) };
    }).filter(point => point.z > -1 && point.z < 1 && point.x > 350 && point.x < innerWidth - 80 && point.y > 100 && point.y < innerHeight - 180)
      .sort((a, b) => b.size - a.size)[0];
  });
  assert.ok(pick, 'no visible pod available for the short-click regression');
  await page.mouse.move(pick.x, pick.y);
  await page.mouse.down();
  await page.mouse.move(pick.x + 1, pick.y);
  await page.mouse.up();
  await page.waitForFunction(() => !document.getElementById('detail').classList.contains('hidden'));
  await page.evaluate(() => window.__kubeaquarium.resume());

  assert.deepEqual(errors, [], `page errors: ${errors.map(String).join('\n')}`);
} catch (error) {
  await page.screenshot({ path: 'navigation-failure.png' });
  throw error;
} finally {
  await browser.close();
}
