import { mkdir, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

// Hero-sequence choreography (~35s):
//   a. establishing slow orbit over the aquarium
//   b. '/' filter (ns:payments) + dolly to a match
//   c. Cmd+K radar -> 'crashloop' -> focus the red whale
//   d. F dive + W glide
//   e. Cmd+L arm -> fire homing missile -> explosion + kill feed
//   f. hold still: ReplicaSet resurrects the pod (self-healing money shot)
//   g. Esc back to orbit, closing wide shot

const root = path.resolve(import.meta.dirname, "..");
const rawDir = path.join(root, "public", "raw");
const output = path.join(root, "public", "kubeaquarium-footage.webm");
const beatsFile = path.join(root, "public", "kubeaquarium-beats.json");
const url = process.env.DEMO_URL ?? "http://127.0.0.1:7781";
const query = process.env.DEMO_QUERY ?? "ns:payments";
const radarQuery = process.env.DEMO_RADAR_QUERY ?? "crashloop";
const minPods = Number(process.env.DEMO_MIN_PODS ?? 40);

const W = 960;
const H = 540;
const CX = W / 2;
const CY = H / 2;

await mkdir(rawDir, { recursive: true });
await rm(output, { force: true });

// GPU-accelerated headless: without ANGLE the WebGL scene records at ~13fps.
const browser = await chromium.launch({
  headless: true,
  args: ["--enable-gpu", "--use-angle=metal", "--ignore-gpu-blocklist"],
});
const context = await browser.newContext({
  viewport: { width: W, height: H },
  recordVideo: { dir: rawDir, size: { width: W, height: H } },
});
const page = await context.newPage();

const t0 = Date.now();
const beats = [];
const beat = (name) => {
  const at = (Date.now() - t0) / 1000;
  beats.push({ name, at: Number(at.toFixed(2)) });
  console.log(`[beat +${at.toFixed(1)}s] ${name}`);
};

/** Slow, cinematic orbit drag. Wall-clock paced so CDP round-trips don't stretch it. */
async function slowDrag(fromX, fromY, toX, toY, ms) {
  const start = Date.now();
  await page.mouse.move(fromX, fromY);
  await page.mouse.down();
  for (;;) {
    const t = Math.min(1, (Date.now() - start) / ms);
    const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; // easeInOut
    await page.mouse.move(fromX + (toX - fromX) * e, fromY + (toY - fromY) * e);
    if (t >= 1) break;
    await page.waitForTimeout(30);
  }
  await page.mouse.up();
}

/**
 * Screen position of the labeled whale nearest the crosshair. The label layer
 * renders one .pod-label.visible per nearby whale at the whale's projected
 * screen position, which is the only whale-position data exposed to the DOM.
 */
async function nearestLabeledWhale() {
  return page.evaluate(([w, h]) => {
    const labels = [...document.querySelectorAll(".pod-label.visible")];
    let best = null;
    let bestD = Infinity;
    for (const el of labels) {
      // Leave the control plane alone: nuking kube-apiserver on camera is
      // the wrong kind of demo.
      if (/^(kube-system|local-path-storage)\//.test(el.title)) continue;
      const x = parseFloat(el.style.left);
      const y = parseFloat(el.style.top) + 24; // label sits above the whale
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      if (x < 40 || x > w - 40 || y < 40 || y > h - 60) continue;
      const d = Math.hypot(x - w / 2, y - h / 2);
      if (d < bestD) { bestD = d; best = { x, y, pod: el.title }; }
    }
    return best;
  }, [W, H]);
}

await page.goto(url, { waitUntil: "domcontentloaded" });
await page.addStyleTag({
  content: "#stats-container { display: none !important; }",
});
await page.evaluate(() => {
  window.setInterval(() => {
    const context = document.getElementById("ctx-name");
    if (context) context.textContent = "demo-cluster";
  }, 100);
});
await page.waitForFunction(
  (min) => window.__kubeaquarium && window.__kubeaquarium.pods >= min,
  minPods,
  { timeout: 60000 },
);
await page.waitForTimeout(1800);

// --- a. Establishing shot: slow orbit (~6s) -------------------------------
beat("orbit");
await slowDrag(CX - 200, CY + 20, CX + 210, CY - 45, 5200);
await page.waitForTimeout(900);

// --- b. Filter: '/' + query + Enter dolly (~5s) ---------------------------
beat("filter");
await page.keyboard.press("/");
await page.waitForTimeout(350);
await page.keyboard.type(query, { delay: 55 });
await page.waitForTimeout(1100);
await page.keyboard.press("Enter"); // dolly to first match
await page.waitForTimeout(2600);
await page.keyboard.press("Escape"); // close search
await page.waitForTimeout(700);

// --- c. Radar: Cmd/Ctrl+K -> crashloop -> red whale (~5s) -----------------
beat("radar");
await page.keyboard.press("ControlOrMeta+k");
await page.waitForTimeout(500);
await page.keyboard.type(radarQuery, { delay: 65 });
await page.waitForTimeout(1300);
await page.keyboard.press("Enter"); // focus the CrashLoopBackOff whale
await page.waitForTimeout(2400);
await page.keyboard.press("Escape"); // close detail panel
await page.waitForTimeout(500);

// --- d. Dive: F + short glide (~4s) ---------------------------------------
// The radar focus left the camera inside the bubble surrounded by whales —
// dive right here. Make sure the detail panel is really closed first: any
// click that lands on it is swallowed by isInteractive() and no missile
// ever fires.
for (let i = 0; i < 3; i++) {
  const open = await page.evaluate(
    () => !document.getElementById("detail")?.classList.contains("hidden"),
  );
  if (!open) break;
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
}
beat("dive");
await page.keyboard.press("f");
await page.waitForTimeout(700);
await page.mouse.move(CX, CY); // center reticle
await page.keyboard.down("KeyW");
await page.waitForTimeout(1200); // short glide, stay among the whales
await page.keyboard.up("KeyW");
await page.waitForTimeout(600);

// --- e. Arm + fire: Cmd/Ctrl+L, missile, explosion, kill feed (~6s) -------
beat("arm");
await page.keyboard.press("ControlOrMeta+l");
await page.waitForTimeout(400);
if (!(await page.evaluate(() => window.__kubeaquarium.attackMode))) {
  await page.click("#attack-toggle"); // fallback if the shortcut was swallowed
  await page.waitForTimeout(300);
}
await page.waitForTimeout(500);

let hitUid = null;
for (let attempt = 0; attempt < 4 && !hitUid; attempt++) {
  if (attempt > 0) {
    // Nudge forward so more whales come into label range before retrying.
    await page.keyboard.down("KeyW");
    await page.waitForTimeout(900);
    await page.keyboard.up("KeyW");
    await page.waitForTimeout(300);
  }
  // Aim the reticle at a real whale (labels expose projected positions).
  const whale = await nearestLabeledWhale();
  const [ax, ay] = whale ? [whale.x, whale.y] : [CX, CY];
  await page.mouse.move(ax, ay, { steps: 8 });
  await page.waitForTimeout(350);
  beat(`fire#${attempt + 1}${whale ? ` -> ${whale.pod}` : " -> blind"}`);
  await page.mouse.down();
  await page.mouse.up();
  try {
    // Homing missile flight -> explosion -> onAttackHit sets the uid.
    await page.waitForFunction(
      () => window.__kubeaquarium.lastAttackHitUid !== null,
      null,
      { timeout: 4000 },
    );
    hitUid = await page.evaluate(() => window.__kubeaquarium.lastAttackHitUid);
  } catch {
    hitUid = null; // fizzled into empty water, retry
    console.log(
      "[diag]",
      await page.evaluate(() => ({
        pods: window.__kubeaquarium.pods,
        projectiles: window.__kubeaquarium.projectiles,
        attackMode: window.__kubeaquarium.attackMode,
        diveMode: window.__kubeaquarium.diveMode,
      })),
    );
  }
}
if (!hitUid) {
  throw new Error("missile never connected after all attempts; re-run capture");
}
beat("explosion");
// Let the explosion, camera shake and the kill-feed entry breathe on screen.
await page.waitForTimeout(2600);

// --- f. Resurrection: hold the camera still (~6s) -------------------------
beat("resurrection");
await page.waitForTimeout(6200);

// --- g. Esc back to orbit, closing wide shot (~3s) ------------------------
beat("closing");
await page.keyboard.press("ControlOrMeta+l"); // disarm
await page.waitForTimeout(300);
await page.keyboard.press("Escape"); // exit dive -> orbit
await page.waitForTimeout(500);
await slowDrag(CX + 150, CY, CX - 170, CY - 30, 2200);
await page.waitForTimeout(900);
beat("end");

const state = await page.evaluate(() => ({
  fps: window.__kubeaquarium.fps,
  pods: window.__kubeaquarium.pods,
  matched: window.__kubeaquarium.matched,
  lastAttackHitUid: window.__kubeaquarium.lastAttackHitUid,
}));

await context.close();
await browser.close();

const files = await readdir(rawDir);
const videos = await Promise.all(
  files
    .filter((file) => file.endsWith(".webm"))
    .map(async (file) => {
      const filePath = path.join(rawDir, file);
      return { filePath, mtime: (await stat(filePath)).mtimeMs };
    }),
);
videos.sort((a, b) => b.mtime - a.mtime);
if (!videos[0]) {
  throw new Error("Playwright did not produce a video file");
}

await rename(videos[0].filePath, output);
await writeFile(beatsFile, JSON.stringify(beats, null, 2));
console.log(JSON.stringify({ video: output, beats, ...state }, null, 2));
