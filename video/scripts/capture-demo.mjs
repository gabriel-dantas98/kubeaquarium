import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { assertNoUnsafeNetwork, blockUnsafeNetwork, requireDemoUrl, verifyApiWebSocketBlocked } from "./recovery-demo.mjs";

const root = path.resolve(import.meta.dirname, "..");
const rawDir = path.join(root, "public", "raw");
const output = path.join(root, "public", "kubeaquarium-footage.webm");
const beatsFile = path.join(root, "public", "kubeaquarium-beats.json");
const url = requireDemoUrl();
const W = 1280;
const H = 720;
const timeout = 10_000;
const expectedController = { uid: "demo-rs-checkout", kind: "ReplicaSet", name: "checkout-demo" };

await mkdir(rawDir, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ["--enable-gpu", "--use-angle=metal", "--ignore-gpu-blocklist"] });
const context = await browser.newContext({ viewport: { width: W, height: H }, recordVideo: { dir: rawDir, size: { width: W, height: H } } });
const page = await context.newPage();
const recordedVideo = page.video();
if (!recordedVideo) throw new Error("Playwright did not create a video recorder");
const recordedPath = await recordedVideo.path();
const errors = [];
page.on("pageerror", (error) => errors.push(String(error)));
const violations = await blockUnsafeNetwork(page);
const beats = [];
const startedAt = Date.now();
const beat = (name) => {
  const at = Number(((Date.now() - startedAt) / 1000).toFixed(2));
  beats.push({ name, at });
  console.log(`[beat +${at.toFixed(1)}s] ${name}`);
};

async function waitForPhase(phase) {
  const card = page.locator(`[data-operation-phase="${phase}"][data-target-uid="demo-mission-old"]`);
  await card.waitFor({ state: "visible", timeout });
  return card;
}

try {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  const mission = page.locator("#demo-mission");
  await mission.getByText("SIMULATED · No cluster changes", { exact: true }).waitFor({ state: "visible", timeout });
  await page.waitForFunction(() => window.__kubeaquarium?.pods > 0, null, { timeout });
  await page.addStyleTag({ content: "#stats-container { display: none !important; }" });
  await page.waitForFunction(() => document.querySelectorAll('.namespace-label.visible').length > 0);
  beat("overview");
  await page.waitForTimeout(1_500);
  await page.mouse.move(900, 400);
  await page.mouse.down();
  await page.mouse.move(770, 440, { steps: 40 });
  await page.mouse.up();
  await page.waitForTimeout(2_000);

  await page.keyboard.press('/');
  await page.locator('#search-input').fill('ns:bench-payments');
  await page.waitForFunction(() => window.__kubeaquarium?.matched > 0);
  beat('filter');
  await page.waitForTimeout(3_500);
  await page.keyboard.press('Escape');
  await page.keyboard.press('ControlOrMeta+k');
  await page.locator('#radar-input').fill('checkout');
  await page.waitForFunction(() => getComputedStyle(document.getElementById('radar')).opacity === '1');
  beat('radar');
  await page.waitForTimeout(3_500);
  await page.keyboard.press('Escape');

  await mission.getByRole("button", { name: "Find pod" }).click();
  await mission.getByRole("button", { name: "Inspect failure" }).click();
  await page.locator("#demo-mission[data-mission-step=fire]").waitFor({ state: "visible", timeout });
  beat("inspect");
  await page.waitForTimeout(4_500);

  // The local demo URL and visible simulation badge were confirmed before attack input.
  await mission.getByRole("button", { name: "Prepare submarine" }).click();
  await page.waitForFunction(() => window.__kubeaquarium?.diveMode === true, null, { timeout });
  beat("dive");
  await page.waitForTimeout(2_500);
  await page.mouse.click(W / 2, H / 2);
  await waitForPhase("accepted");
  beat("request");
  await waitForPhase("absent");
  beat("absent");
  await waitForPhase("candidate");
  beat("candidate");
  const ready = await waitForPhase("ready");
  const candidate = await ready.getAttribute("data-candidate-uid");
  if (candidate !== "demo-mission-new") {
    throw new Error(`Unexpected Ready candidate: ${candidate}`);
  }
  for (const [field, value] of Object.entries(expectedController)) {
    const targetController = await ready.getAttribute(`data-target-controller-${field}`);
    const candidateController = await ready.getAttribute(`data-candidate-controller-${field}`);
    if (targetController !== value || candidateController !== value) {
      throw new Error(`Unexpected controller ${field}: target=${targetController}, candidate=${candidateController}, expected=${value}`);
    }
  }
  beat("ready");
  await page.waitForTimeout(4_000);

  await page.locator('#overview-toggle').click();
  await page.waitForFunction(() => !window.__kubeaquarium?.diveMode);
  await page.waitForTimeout(800);
  beat("closing");
  await page.waitForTimeout(4_000);
  assertNoUnsafeNetwork(violations);
  await verifyApiWebSocketBlocked(page, violations);
  if (errors.length) throw new Error(`Page errors: ${errors.join("\n")}`);
} finally {
  await context.close();
  await browser.close();
}

await rename(recordedPath, output);
await writeFile(beatsFile, `${JSON.stringify(beats, null, 2)}\n`);
console.log(JSON.stringify({ video: output, beats }, null, 2));
