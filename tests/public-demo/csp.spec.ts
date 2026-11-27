import { execFileSync } from "node:child_process";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const PAGES = ["/", "/practice", "/mock-interview"];
const PERMISSIONS_POLICY = "microphone=(self), camera=(), geolocation=()";
const REFERRER_POLICY = "strict-origin-when-cross-origin";

function nonceFrom(policy: string) {
  const match = policy.match(/script-src[^;]*'nonce-([^']+)'/);
  return match?.[1];
}

function directivesFor(nonce: string) {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    `style-src 'self' 'nonce-${nonce}'`,
    "style-src-attr 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "media-src 'self' blob:",
    "worker-src 'self' blob:",
    "connect-src 'self' https://generativelanguage.googleapis.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "frame-src 'none'",
    "upgrade-insecure-requests",
  ];
}

function assertPolicy(policy: string | undefined) {
  const directives = (policy ?? "").split(";").map((directive) => directive.trim()).filter(Boolean);
  const nonce = nonceFrom(directives.join("; "));
  expect(nonce).toBeTruthy();
  expect(directives).toEqual(directivesFor(nonce!));
  const scriptSrc = directives.find((directive) => directive.startsWith("script-src "));
  expect(scriptSrc?.split(/\s+/)).not.toContain("'unsafe-inline'");
  return nonce!;
}

function assertMarkup(html: string, nonce: string) {
  const scripts = [...html.matchAll(/<script\b[^>]*>/gi)];
  expect(scripts.length).toBeGreaterThan(0);
  for (const [tag] of scripts) expect(tag).toContain(`nonce="${nonce}"`);
  for (const [tag] of html.matchAll(/<style\b[^>]*>/gi)) expect(tag).toContain(`nonce="${nonce}"`);
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

async function restart(request: APIRequestContext) {
  execFileSync("docker", ["restart", "echo-public-demo"], { stdio: "pipe" });
  await expect.poll(async () => (await request.get("/", { failOnStatusCode: false }).catch(() => null))?.status()).toBe(200);
}

test("public documents carry distinct nonces on their scripts", async ({ request }) => {
  await restart(request);
  for (const path of PAGES) {
    const first = await request.get(path);
    const second = await request.get(path);
    expect(first.status(), path).toBe(200);
    expect(second.status(), path).toBe(200);
    const nonce = assertPolicy(first.headers()["content-security-policy"]);
    const other = assertPolicy(second.headers()["content-security-policy"]);
    expect(other, path).not.toBe(nonce);
    for (const response of [first, second]) {
      expect(response.headers()["permissions-policy"]).toBe(PERMISSIONS_POLICY);
      expect(response.headers()["referrer-policy"]).toBe(REFERRER_POLICY);
    }
    assertMarkup(await first.text(), nonce);
    assertMarkup(await second.text(), other);
  }
  for (const path of ["/api/practice/access", "/favicon.ico"]) {
    const response = await request.get(path);
    expect(response.headers()["content-security-policy"], path).toBeUndefined();
    expect(response.headers()["permissions-policy"], path).toBeUndefined();
    expect(response.headers()["referrer-policy"], path).toBeUndefined();
  }
});

test("sample practice, playback, recording and the mock interview report no CSP violations", async ({ page, baseURL }) => {
  await restart(page.request);
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

  const home = await page.goto("/");
  assertPolicy(home?.headers()["content-security-policy"]);
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

  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Mock interview", exact: true }).click();
  await expect(page).toHaveURL(/\/mock-interview$/);
  await page.getByRole("button", { name: "Start mock interview", exact: true }).click();
  const mockProgress = page.getByRole("progressbar", { name: "Question audio progress" });
  await page.getByRole("button", { name: "Listen to the question" }).click();
  await expect(page.getByRole("button", { name: "Pause question audio" })).toBeVisible();
  await expect.poll(async () => mockProgress.getAttribute("aria-valuenow")).not.toBe("0");
  await page.getByRole("button", { name: "Skip question", exact: true }).click();
  await expect(page.getByText("Question 2 of 3", { exact: true })).toBeVisible();
  await drain(page, violations);

  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Practice", exact: true }).click();
  await expect(page.getByLabel("Your answer", { exact: true })).toBeVisible();
  await drain(page, violations);

  expect(violations).toEqual([]);
  expect(consoleErrors).toEqual([]);
  expect(external).toEqual([]);
});
