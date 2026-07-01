import { mkdir, readdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const root = path.resolve(import.meta.dirname, "..");
const rawDir = path.join(root, "public", "raw");
const output = path.join(root, "public", "kubeaquarium-footage.webm");
const url = process.env.DEMO_URL ?? "http://127.0.0.1:7781";
const query = process.env.DEMO_QUERY ?? "ns:monitoring phase:Running";

await mkdir(rawDir, { recursive: true });
await rm(output, { force: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1280, height: 720 },
  recordVideo: { dir: rawDir, size: { width: 1280, height: 720 } },
});
const page = await context.newPage();

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
  () => window.__kubeaquarium && window.__kubeaquarium.pods > 100,
  null,
  { timeout: 60000 },
);

await page.waitForTimeout(2500);
await page.keyboard.press("/");
await page.keyboard.type(query, { delay: 35 });
await page.waitForTimeout(2200);
await page.keyboard.press("Enter");
await page.waitForTimeout(3400);
await page.keyboard.press("Escape");
await page.mouse.move(640, 360);
await page.mouse.down();
await page.mouse.move(910, 420, { steps: 36 });
await page.mouse.up();
await page.waitForTimeout(2200);
await page.keyboard.press("F");
await page.waitForTimeout(500);
await page.keyboard.down("KeyW");
await page.mouse.move(730, 320, { steps: 24 });
await page.waitForTimeout(1900);
await page.keyboard.up("KeyW");
await page.keyboard.press("Escape");
await page.waitForTimeout(1100);

const state = await page.evaluate(() => ({
  fps: window.__kubeaquarium.fps,
  pods: window.__kubeaquarium.pods,
  matched: window.__kubeaquarium.matched,
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
console.log(JSON.stringify({ video: output, ...state }, null, 2));
