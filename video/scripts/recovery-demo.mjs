const demoHostnames = new Set(["127.0.0.1", "localhost", "::1"]);

/** Refuse to drive anything other than the explicitly selected local demo. */
export function requireDemoUrl(value = process.env.DEMO_URL) {
  if (!value) throw new Error("DEMO_URL must point to the local ?demo experience");
  const url = new URL(value);
  if (url.protocol !== "http:" || !demoHostnames.has(url.hostname) || !url.searchParams.has("demo")) {
    throw new Error(`Refusing non-local or non-demo URL: ${url}`);
  }
  return url.toString();
}

/** A capture must never reach the live API. */
export async function blockUnsafeNetwork(page) {
  const violations = [];
  await page.route("**/*", async (route) => {
    const request = route.request();
    const requestUrl = new URL(request.url());
    const unsafe = requestUrl.pathname.startsWith("/api/") || !["GET", "HEAD"].includes(request.method());
    if (unsafe) {
      violations.push(`${request.method()} ${request.url()}`);
      await route.abort("blockedbyclient");
      return;
    }
    await route.continue();
  });
  await page.routeWebSocket("**/api/stream", async (socket) => {
    violations.push("WebSocket /api/stream");
    await socket.close({ code: 1008, reason: "API network disabled for demo capture" });
  });
  return violations;
}

/** Prove the API WebSocket guard blocks a connection before it can reach a server. */
export async function verifyApiWebSocketBlocked(page, violations) {
  const before = violations.length;
  await page.evaluate(() => new Promise((resolve) => {
    const socket = new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/api/stream`);
    socket.addEventListener('close', resolve, { once: true });
    socket.addEventListener('error', () => {}, { once: true });
  }));
  if (!violations.slice(before).includes("WebSocket /api/stream")) {
    throw new Error("API stream WebSocket escaped the capture network guard");
  }
}

export function assertNoUnsafeNetwork(violations) {
  if (violations.length) throw new Error(`Unsafe network request blocked: ${violations.join(", ")}`);
}
