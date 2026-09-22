import { mkdir, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { assertNoUnsafeNetwork, blockUnsafeNetwork, requireDemoUrl } from "./recovery-demo.mjs";

const root = path.resolve(import.meta.dirname, "..");
const rawDir = path.join(root, "public", "raw");
const output = path.join(root, "public", "kubeaquarium-footage.webm");
const beatsFile = path.join(root, "public", "kubeaquarium-beats.json");
const url = requireDemoUrl();
const W = 960;
const H = 540;
const timeout = 10_000;

await mkdir(rawDir, { recursive: true });
await rm(output, { force: true });
const browser = await chromium.launch({ headless: true, args: ["--enable-gpu", "--use-angle=metal", "--ignore-gpu-blocklist"] });
const context = await browser.newContext({ viewport: { width: W, height: H }, recordVideo: { dir: rawDir, size: { width: W, height: H } } });
const page = await context.newPage();
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
  await page.waitForTimeout(4_000);

  await mission.getByRole("button", { name: "Find pod" }).click();
  await mission.getByRole("button", { name: "Inspect failure" }).click();
  await page.locator("#demo-mission[data-mission-step=fire]").waitFor({ state: "visible", timeout });
  beat("inspect");
  await page.waitForTimeout(13_000);

  // The local demo URL and visible simulation badge were confirmed before attack input.
  await mission.getByRole("button", { name: "Prepare submarine" }).click();
  await page.waitForFunction(() => window.__kubeaquarium?.diveMode === true, null, { timeout });
  await page.mouse.click(W / 2, H / 2);
  await waitForPhase("accepted");
  beat("request");
  await waitForPhase("absent");
  beat("absent");
  await waitForPhase("candidate");
  beat("candidate");
  const ready = await waitForPhase("ready");
  const candidate = await ready.getAttribute("data-candidate-uid");
  const message = await ready.locator("p").textContent();
  if (candidate !== "demo-mission-new" || !message?.includes("same controller")) {
    throw new Error(`Unexpected Ready evidence: candidate=${candidate}, message=${message}`);
  }
  beat("ready");
  await page.waitForTimeout(6_000);

  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);
  await page.mouse.move(650, 270);
  await page.mouse.down();
  await page.mouse.move(330, 300, { steps: 24 });
  await page.mouse.up();
  beat("closing");
  await page.waitForTimeout(3_000);
  assertNoUnsafeNetwork(violations);
  if (errors.length) throw new Error(`Page errors: ${errors.join("\n")}`);
} finally {
  await context.close();
  await browser.close();
}

const files = await readdir(rawDir);
const videos = await Promise.all(files.filter((file) => file.endsWith(".webm")).map(async (file) => {
  const filePath = path.join(rawDir, file);
  return { filePath, mtime: (await stat(filePath)).mtimeMs };
}));
videos.sort((a, b) => b.mtime - a.mtime);
if (!videos[0]) throw new Error("Playwright did not produce a video file");
await rename(videos[0].filePath, output);
await writeFile(beatsFile, `${JSON.stringify(beats, null, 2)}\n`);
console.log(JSON.stringify({ video: output, beats }, null, 2));
