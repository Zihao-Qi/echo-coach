import { expect, test, type Page } from "@playwright/test";

const PAGES = ["/", "/practice", "/mock-interview"];
const PERMISSIONS_POLICY = "microphone=(self), camera=(), geolocation=()";
const REFERRER_POLICY = "strict-origin-when-cross-origin";

function nonceFrom(policy: string) {
  const match = policy.match(/script-src[^;]*'nonce-([^']+)'/);
  return match?.[1];
}

declare global {
  interface Window {
    __cspViolations?: string[];
  }
}

function watchCsp(page: Page) {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" && /content security policy/i.test(message.text())) consoleErrors.push(message.text());
  });
  return consoleErrors;
}

async function arm(page: Page) {
  await page.addInitScript(() => {
    window.__cspViolations = [];
    document.addEventListener("securitypolicyviolation", (event) => {
      window.__cspViolations?.push(`${event.effectiveDirective} ${event.blockedURI} ${event.sample}`);
    });
  });
}

async function drain(page: Page, sink: string[]) {
  sink.push(...await page.evaluate(() => {
    const found = window.__cspViolations ?? [];
    window.__cspViolations = [];
    return found;
  }));
}

test("public documents carry distinct nonces on their scripts", async ({ request }) => {
  for (const path of PAGES) {
    const first = await request.get(path);
    const second = await request.get(path);
    expect(first.status(), path).toBe(200);
    expect(second.status(), path).toBe(200);
    const policy = first.headers()["content-security-policy"];
    const again = second.headers()["content-security-policy"];
    const nonce = nonceFrom(policy ?? "");
    const other = nonceFrom(again ?? "");
    expect(nonce, path).toBeTruthy();
    expect(other).not.toBe(nonce);
    expect(policy).toContain("style-src-attr 'unsafe-inline'");
    expect(policy).toContain("connect-src 'self' https://generativelanguage.googleapis.com");
    expect(policy).not.toContain("script-src 'unsafe-inline'");
    expect(first.headers()["permissions-policy"]).toBe(PERMISSIONS_POLICY);
    expect(first.headers()["referrer-policy"]).toBe(REFERRER_POLICY);
    const html = await first.text();
    const scripts = [...html.matchAll(/<script\b[^>]*>/gi)];
    expect(scripts.length, path).toBeGreaterThan(0);
    for (const [tag] of scripts) {
      expect(tag, path).toContain(`nonce="${nonce}"`);
    }
  }
  for (const path of ["/api/practice/access", "/favicon.ico"]) {
    const response = await request.get(path);
    expect(response.headers()["content-security-policy"], path).toBeUndefined();
    expect(response.headers()["permissions-policy"], path).toBeUndefined();
    expect(response.headers()["referrer-policy"], path).toBeUndefined();
  }
});

test("sample practice, playback, recording and the mock interview report no CSP violations", async ({ page, baseURL }) => {
  const origin = new URL(baseURL!).origin;
  const external: string[] = [];
  await page.route("**/*", (route) => {
    const target = new URL(route.request().url());
    if (target.origin === origin || target.protocol === "blob:" || target.protocol === "data:") return route.continue();
    external.push(target.origin);
    return route.abort();
  });
  const violations: string[] = [];
  const consoleErrors = watchCsp(page);
  await arm(page);
  const draft = "I compared two fictional sketches and chose the simpler one because the deadline was one day away.";

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Good answers are built." })).toBeVisible();
  await drain(page, violations);
  await page.getByRole("link", { name: "Start focused practice", exact: true }).click();
  await expect(page.getByLabel("Your answer", { exact: true })).toBeVisible();
  await drain(page, violations);

  const progress = page.getByRole("progressbar", { name: "Question audio progress" });
  await page.getByRole("button", { name: "Listen to the question" }).click();
  await expect(page.getByRole("button", { name: "Pause question audio" })).toBeVisible();
  await expect.poll(async () => progress.getAttribute("aria-valuenow")).not.toBe("0");
  await page.getByRole("button", { name: "Pause question audio" }).click();
  await drain(page, violations);

  await page.getByRole("button", { name: "Record answer", exact: true }).click();
  await page.getByRole("button", { name: "Stop recording", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Sample transcript", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Discard", exact: true }).click();
  await page.getByLabel("Your answer", { exact: true }).fill(draft);
  const submitted = page.waitForResponse((response) => response.url().endsWith("/api/practice/evaluate") && response.request().method() === "POST");
  await page.getByRole("button", { name: "Get feedback", exact: true }).click();
  expect((await submitted).status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Sample feedback" })).toBeVisible();
  await drain(page, violations);

  await page.goto("/mock-interview");
  await page.getByRole("button", { name: "Start mock interview", exact: true }).click();
  const mockProgress = page.getByRole("progressbar", { name: "Question audio progress" });
  await page.getByRole("button", { name: "Listen to the question" }).click();
  await expect(page.getByRole("button", { name: "Pause question audio" })).toBeVisible();
  await expect.poll(async () => mockProgress.getAttribute("aria-valuenow")).not.toBe("0");
  await page.getByRole("button", { name: "Skip question", exact: true }).click();
  await expect(page.getByText("Question 2 of 3", { exact: true })).toBeVisible();
  await drain(page, violations);

  await page.goto("/practice");
  await expect(page.getByLabel("Your answer", { exact: true })).toBeVisible();
  await drain(page, violations);

  expect(violations).toEqual([]);
  expect(consoleErrors).toEqual([]);
  expect(external).toEqual([]);
});
