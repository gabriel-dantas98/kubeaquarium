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
  return violations;
}

export function assertNoUnsafeNetwork(violations) {
  if (violations.length) throw new Error(`Unsafe network request blocked: ${violations.join(", ")}`);
}
