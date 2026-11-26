import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

const base = "https://127.0.0.1:8443";
const notice = "This demo shows sample feedback. It does not assess whether your answer is correct.";
const draft = "DEMO_ANSWER_MARKER: I showed a fictional student group two project sketches and chose the simpler one.";
const url = /\/api\/practice\/evaluate$/;

async function openPractice(page: Page) {
  const external: string[] = [];
  await page.route("**/*", (route) => {
    if (new URL(route.request().url()).origin === base) return route.continue();
    external.push("outbound browser request");
    return route.abort();
  });
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Original voice demo" })).toHaveCount(0);
  await page.getByRole("link", { name: /Start a focused practice round/ }).click();
  await expect(page.getByText(notice, { exact: false }).first()).toBeVisible();
  await expect(page.getByLabel("Your answer", { exact: true })).toBeVisible();
  await expect(page.getByText(/microphone|record an answer|sign in with google/i)).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Original voice demo" })).toHaveCount(0);
  return external;
}

async function submit(page: Page, button: RegExp, status = 200, json = true) {
  const response = page.waitForResponse((response) => url.test(response.url()) && response.request().method() === "POST");
  await page.getByRole("button", { name: button }).click();
  const result = await response;
  expect(result.status()).toBe(status);
  return json ? result.json() : undefined;
}

async function restart(page: Page) {
  execFileSync("docker", ["restart", "echo-public-demo"], { stdio: "pipe" });
  await expect.poll(async () => (await page.request.get("/", { failOnStatusCode: false }).catch(() => null))?.status()).toBe(200);
}

test("mobile demo shows sample feedback, retries and a follow-up with no external requests", async ({ page, context }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const external = await openPractice(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.getByRole("button", { name: "Give me a hint" }).click();
  await expect(page.getByText(/^Hint 1:/)).toBeVisible();
  await page.getByLabel("Your answer", { exact: true }).fill(draft);
  const first = await submit(page, /^Get feedback$/);
  const feedback = page.getByRole("region", { name: "Answer feedback" });
  await expect(feedback.getByText(notice, { exact: true }).first()).toBeVisible();
  await expect(feedback.getByText(/Illustrative demo feedback/)).toBeVisible();
  expect(first.attempt.provenance.mode).toBe("demo");
  expect((await context.cookies()).find((cookie) => cookie.name === "echo-practice-demo")).toMatchObject({ secure: true, httpOnly: true, sameSite: "Lax" });
  await page.getByLabel("Your answer", { exact: true }).fill(draft + " I checked my choice with the group.");
  const retry = await submit(page, /^Evaluate my retry$/);
  expect(retry.attempt.previousAttemptId).toBe(first.attempt.id);
  await page.getByRole("button", { name: /^Answer follow-up$/i }).click();
  await page.getByLabel("Your answer", { exact: true }).fill("I chose the shorter fictional plan because the deadline was one day away.");
  const followUp = await submit(page, /^Get feedback$/);
  expect(followUp.attempt.followUpOfAttemptId).toBe(retry.attempt.id);
  await expect(feedback.getByText(notice, { exact: true }).first()).toBeVisible();
  expect(external).toEqual([]);
});

test("two HTTPS sessions stay isolated, disabled routes and cross-origin writes are refused, and restart keeps the draft", async ({ page, browser, context }) => {
  const external = await openPractice(page);
  const answer = page.getByLabel("Your answer", { exact: true });
  await answer.fill(draft);
  const first = await submit(page, /^Get feedback$/);
  const originalCookie = (await context.cookies()).find((cookie) => cookie.name === "echo-practice-demo")!.value;
  appendFileSync(process.env.PUBLIC_DEMO_LOG_MARKERS!, originalCookie + "\n");
  const other = await browser.newContext({ baseURL: base, ignoreHTTPSErrors: true });
  try {
    const crossSiteAccess = await other.request.get("/api/practice/access", { headers: { "sec-fetch-site": "cross-site" } });
    expect(crossSiteAccess.status()).toBe(200);
    expect(crossSiteAccess.headers()["set-cookie"]).toBeUndefined();
    const access = await other.request.get("/api/practice/access");
    expect(access.ok()).toBe(true);
    const history = await other.request.get("/api/practice/attempts");
    expect(history.headers()["cache-control"]).toContain("no-store");
    expect(history.headers().vary).toContain("Cookie");
    expect((await history.json()).records).toEqual([]);
    expect((await other.request.get(`/api/practice/attempts/${first.attempt.id}`)).status()).toBe(404);
  } finally { await other.close(); }
  for (const path of ["/api/practice/Access", "/legacy", "/session/fictional", "/session/fictional/recap", "/api/history", "/api/auth/session", "/api/session", "/api/session/speak", "/api/practice/transcriptions"]) {
    expect((await page.request.get(path)).status(), path).toBe(404);
  }
  expect((await page.request.post("/api/practice/transcriptions", { data: "not audio" })).status()).toBe(404);
  expect((await page.request.post("/api/practice/evaluate", {
    headers: { Origin: "https://not-the-demo.example" }, data: { answer: "DEMO_REQUEST_BODY_MARKER" },
  })).status()).toBe(403);
  await answer.fill(draft + " This is my unsent follow-on draft.");
  await restart(page);
  const posts: string[] = [];
  page.on("request", (request) => { if (url.test(request.url()) && request.method() === "POST") posts.push(request.url()); });
  await submit(page, /^Evaluate my retry$/, 401);
  await expect(page.getByRole("alert").filter({ hasText: "Your draft is still here" })).toBeVisible();
  await expect(answer).toHaveValue(draft + " This is my unsent follow-on draft.");
  expect(posts).toHaveLength(1);
  expect((await context.cookies()).find((cookie) => cookie.name === "echo-practice-demo")?.value).not.toBe(originalCookie);
  const fresh = await submit(page, /^Get feedback$/);
  expect(posts).toHaveLength(2);
  expect(fresh.attempt.previousAttemptId).toBeUndefined();
  const history = await page.request.get("/api/practice/attempts");
  expect((await history.json()).records.map((item: { id: string }) => item.id)).toEqual([fresh.attempt.id]);
  expect(external).toEqual([]);
});

test("a retained cookie sees empty history after a restart and does not replay old attempts", async ({ page, context }) => {
  await openPractice(page);
  const answer = page.getByLabel("Your answer", { exact: true });
  await answer.fill(draft);
  const first = await submit(page, /^Get feedback$/);
  const cookie = (await context.cookies()).find((item) => item.name === "echo-practice-demo")!.value;
  appendFileSync(process.env.PUBLIC_DEMO_LOG_MARKERS!, cookie + "\n");
  await answer.fill(draft + " I revised it, but haven’t sent it yet.");
  await restart(page);
  expect((await page.request.get(`/api/practice/attempts/${first.attempt.id}`)).status()).toBe(404);
  const reset = await submit(page, /^Evaluate my retry$/, 409);
  expect(reset.code).toBe("demo-history-reset");
  await expect(answer).toHaveValue(draft + " I revised it, but haven’t sent it yet.");
  await expect(page.getByRole("alert").filter({ hasText: "Your draft is still here" })).toBeVisible();
  expect((await context.cookies()).find((item) => item.name === "echo-practice-demo")?.value).toBe(cookie);
  const fresh = await submit(page, /^Get feedback$/);
  expect(fresh.attempt.previousAttemptId).toBeUndefined();
});

test("a single entry-point limit is shared across sessions and endpoints and preserves the draft", async ({ page }) => {
  await restart(page);
  await openPractice(page);
  await page.getByLabel("Your answer", { exact: true }).fill(draft);
  const access = await page.request.get("/api/practice/access");
  expect(access.status()).toBe(200);
  let limit: Awaited<ReturnType<typeof page.request.get>> | undefined;
  for (let i = 0; i <= 120; i++) {
    limit = await page.request.get(i % 2 ? "/api/practice/access" : "/api/practice/attempts", { headers: { "x-forwarded-for": `192.0.2.${i % 250}` } });
    if (limit.status() === 429) break;
    expect(limit.status()).toBe(200);
  }
  expect(limit?.status()).toBe(429);
  expect(Number(limit?.headers()["retry-after"])).toBeGreaterThan(0);
  expect((await page.request.get("/api/practice/transcriptions")).status()).toBe(404);
  expect((await page.request.get("/api/practice/access", { headers: { cookie: "", "x-forwarded-for": "198.51.100.1" } })).status()).toBe(429);
  await submit(page, /^Get feedback$/, 429);
  await expect(page.getByRole("alert").filter({ hasText: "The demo is busy" })).toBeVisible();
  await expect(page.getByLabel("Your answer", { exact: true })).toHaveValue(draft);

  // A hosting layer may refuse the request before the app can return JSON.
  const historyLoads: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/practice/attempts") historyLoads.push("attempt list");
  });
  await page.route(url, (route) => route.fulfill({ status: 503, contentType: "text/plain", body: "Service unavailable" }));
  await submit(page, /^Get feedback$/, 503, false);
  await expect(page.getByRole("alert").filter({ hasText: "Feedback is temporarily unavailable" })).toBeVisible();
  await expect(page.getByLabel("Your answer", { exact: true })).toHaveValue(draft);
  expect(historyLoads).toEqual([]);
});
