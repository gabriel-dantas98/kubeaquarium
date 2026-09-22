import { chromium } from "playwright";
import { assertNoUnsafeNetwork, blockUnsafeNetwork, requireDemoUrl, verifyApiWebSocketBlocked } from "./recovery-demo.mjs";

const url = requireDemoUrl();
const timeout = 10_000;
const expected = {
  targetUid: "demo-mission-old",
  candidateUid: "demo-mission-new",
  controller: { uid: "demo-rs-checkout", kind: "ReplicaSet", name: "checkout-demo" },
};
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errors = [];
page.on("pageerror", (error) => errors.push(String(error)));
const violations = await blockUnsafeNetwork(page);

async function phase(name) {
  const card = page.locator(`[data-operation-phase="${name}"][data-target-uid="${expected.targetUid}"]`);
  await card.waitFor({ state: "visible", timeout });
  return card;
}

try {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  const mission = page.locator("#demo-mission");
  await mission.getByText("SIMULATED · No cluster changes", { exact: true }).waitFor({ state: "visible", timeout });
  await page.waitForFunction(() => window.__kubeaquarium?.pods > 0, null, { timeout });
  await mission.getByRole("button", { name: "Find pod" }).click();
  await mission.getByRole("button", { name: "Inspect failure" }).click();
  await page.locator("#demo-mission[data-mission-step=fire]").waitFor({ state: "visible", timeout });
  const inspected = await page.locator("#detail").textContent();
  if (!inspected?.includes("checkout-demo-old")) throw new Error("Mission target was not visibly inspected");
  await mission.getByRole("button", { name: "Prepare submarine" }).click();
  await page.waitForFunction(() => window.__kubeaquarium?.diveMode === true, null, { timeout });
  await page.mouse.click(480, 270);
  await phase("accepted");
  await phase("absent");
  await phase("candidate");
  const ready = await phase("ready");
  const candidate = await ready.getAttribute("data-candidate-uid");
  if (candidate !== expected.candidateUid) throw new Error(`Unexpected candidate UID: ${candidate}`);
  for (const [field, value] of Object.entries(expected.controller)) {
    const targetController = await ready.getAttribute(`data-target-controller-${field}`);
    const candidateController = await ready.getAttribute(`data-candidate-controller-${field}`);
    if (targetController !== value || candidateController !== value) {
      throw new Error(`Unexpected controller ${field}: target=${targetController}, candidate=${candidateController}, expected=${value}`);
    }
  }
  await mission.getByText("Recovery observed", { exact: true }).waitFor({ state: "visible", timeout });
  assertNoUnsafeNetwork(violations);
  await verifyApiWebSocketBlocked(page, violations);
  if (errors.length) throw new Error(`Page errors: ${errors.join("\n")}`);
  console.log(`verified ${expected.targetUid} -> ${expected.candidateUid} (${expected.controller.kind} ${expected.controller.name}/${expected.controller.uid}): accepted, absent, candidate, Ready`);
} finally {
  await browser.close();
}
