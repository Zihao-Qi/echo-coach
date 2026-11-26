import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { demoAudioAssets, getSampleContent } from "../../src/content/questions/demo-audio";
import type { AnswerEvaluation } from "../../src/domain/interview/practice";
import { SAMPLE_FEEDBACK_NOTICE as notice } from "../../src/infrastructure/config/public-demo";

const base = "https://127.0.0.1:8443";
const draft = "DEMO_ANSWER_MARKER: I showed a fictional student group two project sketches and chose the simpler one.";
const url = /\/api\/practice\/evaluate$/;
const temporaryHistory = "Use made-up examples. No personal details. History is temporary and may reset.";
declare global {
  interface Window { captureProbe: { calls: number; streams: MediaStream[]; deny: boolean }; }
}

async function expectPublicNavigation(page: Page) {
  await expect(page.getByRole("link", { name: "Mock interview", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Original voice demo" })).toHaveCount(0);
  await expect(page.getByText(/sign in with google/i)).toHaveCount(0);
}

async function openPractice(page: Page) {
  const external: string[] = [];
  await page.route("**/*", (route) => {
    if (new URL(route.request().url()).origin === base) return route.continue();
    external.push("outbound browser request");
    return route.abort();
  });
  await page.goto("/");
  await expectPublicNavigation(page);
  await page.getByRole("link", { name: "Start focused practice", exact: true }).click();
  await expectPublicNavigation(page);
  await expect(page.getByText(temporaryHistory, { exact: false })).toBeVisible();
  await expect(page.getByLabel("Your answer", { exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Voice answer capture" })).toContainText("Your audio stays in this browser and is deleted when you stop.");
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
  await expect(page.getByText(notice, { exact: false })).toHaveCount(1);
  await expect(feedback.getByText(notice, { exact: true })).toBeVisible();
  await expect(feedback.getByRole("heading", { name: "Sample feedback" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Session recap" })).toBeVisible();
  expect(first.attempt.provenance.mode).toBe("demo");
  expect((await context.cookies()).find((cookie) => cookie.name === "echo-practice-demo")).toMatchObject({ secure: true, httpOnly: true, sameSite: "Lax" });
  await page.getByRole("button", { name: "Edit answer" }).click();
  await page.getByLabel("Your answer", { exact: true }).fill(draft + " I checked my choice with the group.");
  const retry = await submit(page, /^Evaluate my retry$/);
  expect(retry.attempt.previousAttemptId).toBe(first.attempt.id);
  const evaluation: AnswerEvaluation = retry.attempt.evaluation;
  const expectedCue = [evaluation.comparison?.nextFocus, ...evaluation.nextSteps, ...evaluation.gaps.map((gap) => gap.nextStep)]
    .map((action) => action?.trim()).find((action) => action);
  expect(expectedCue, "The sample retry must include an actionable cue").toBeTruthy();
  await expect(page.getByText(notice, { exact: false })).toHaveCount(1);
  await page.getByRole("button", { name: "Edit answer" }).click();
  const cue = page.getByRole("region", { name: "Focus for this retry" });
  await expect(cue.getByText(expectedCue!, { exact: true })).toBeVisible();
  await expect(cue.getByText("Sample focus for this retry", { exact: true })).toBeVisible();
  await expect(feedback.getByRole("button", { name: "Try another question in Behavioral: Learning and accountability", exact: true })).toHaveCount(1);
  await expect(feedback.getByText(notice, { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: /^Answer follow-up$/i }).click();
  await expect(page.getByRole("region", { name: "Voice answer capture" })).toHaveCount(0);
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
  await page.getByRole("button", { name: "Edit answer" }).click();
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
  await page.getByRole("button", { name: "Edit answer" }).click();
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

test("the public mock round makes no API calls and bundled audio supports range and immutable caching", async ({ page }) => {
  const unexpected: string[] = [];
  await page.route("**/*", route => {
    const request = new URL(route.request().url());
    if (request.origin === base && !request.pathname.startsWith("/api/")) return route.continue();
    unexpected.push(request.origin === base ? "app API" : "outbound");
    return route.abort();
  });
  await page.goto("/mock-interview");
  await expect(page.getByText(/Self-review only. Nothing is scored\./)).toBeVisible();
  await page.getByRole("button", { name: "Start mock interview" }).click();
  const question = demoAudioAssets.find(asset => asset.kind === "question" && asset.id === "behavioral-project");
  const listen = page.getByRole("button", { name: "Listen to the question" });
  if (question) {
    await expect(listen).toBeVisible();
    const range = await page.request.get(question.path, { headers: { Range: "bytes=0-31" } });
    expect(range.status()).toBe(206);
    expect(range.headers()["content-range"]).toBe(`bytes 0-31/${question.size}`);
    expect(range.headers()["cache-control"]).toBe("public, max-age=31536000, immutable");
    await listen.click();
    await expect(page.getByRole("button", { name: "Pause question audio" })).toBeVisible();
  } else await expect(listen).toHaveCount(0);
  await page.getByRole("button", { name: "Skip question" }).click();
  await page.getByRole("button", { name: "End round early" }).click();
  await expect(page.getByRole("heading", { name: "Round answers" })).toBeVisible();
  for (const path of ["/audio/questions/not-bundled.12345678.m4a", "/audio/answers/nested/nonexistent.12345678.m4a", ...(question ? [question.path.replace(".m4a", "%2em4a")] : [])]) {
    const missing = await page.request.get(path);
    expect(missing.status(), path).toBe(404);
    expect(missing.headers()["cache-control"]).toBe("private, no-store");
  }
  expect(unexpected).toEqual([]);
});

test("public recording releases fake microphone tracks and never makes an audio or transcription request", async ({ page }) => {
  await page.addInitScript(() => {
    const w = window;
    w.captureProbe = { calls: 0, streams: [], deny: false };
    const get = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      w.captureProbe.calls++;
      if (w.captureProbe.deny) throw new DOMException("Denied by test", "NotAllowedError");
      const stream = await get(constraints);
      w.captureProbe.streams.push(stream);
      return stream;
    };
  });
  const external = await openPractice(page);
  const sentAudio: string[] = [];
  page.on("request", request => {
    const type = request.headers()["content-type"] ?? "";
    if (request.url().includes("/api/practice/transcriptions") || /^audio\/|^application\/octet-stream|^multipart\//.test(type) || request.postDataBuffer()) sentAudio.push(new URL(request.url()).pathname);
  });
  const microphone = () => page.evaluate(() => {
    const probe = window.captureProbe;
    return { calls: probe.calls, live: probe.streams.flatMap(stream => stream.getTracks()).filter(track => track.readyState === "live").length };
  });
  const record = page.getByRole("button", { name: "Record answer", exact: true });
  const stop = page.getByRole("button", { name: "Stop recording", exact: true });
  const sample = page.getByRole("textbox", { name: "Sample transcript", exact: true });
  const answer = page.getByRole("textbox", { name: "Your answer", exact: true });
  expect(await microphone()).toEqual({ calls: 0, live: 0 });
  await page.getByRole("button", { name: "Software engineering", exact: true }).click();
  const listen = page.getByRole("button", { name: "Listen to the question" });
  if (demoAudioAssets.length > 0) {
    await listen.click();
    const pause = page.getByRole("button", { name: "Pause question audio" });
    await expect(pause).toBeVisible();
    await pause.click();
    await listen.click();
    await expect(pause).toBeVisible();
  } else await expect(listen).toHaveCount(0);
  await answer.fill(draft);
  await record.click();
  await expect(stop).toBeVisible();
  if (demoAudioAssets.length > 0) await expect(listen).toBeVisible();
  await expect(page.getByRole("button", { name: "Get feedback" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Behavioral", exact: true })).toBeDisabled();
  await stop.click();
  await expect(sample).toBeFocused();
  await expect(sample).toHaveValue(getSampleContent("swe-hash-map")!.sampleTranscript);
  expect(await microphone()).toEqual({ calls: 1, live: 0 });
  await sample.fill("I edited this fictional sample before applying it.");
  const apply = page.getByRole("button", { name: "Use in answer draft" });
  page.once("dialog", dialog => dialog.dismiss());
  await apply.click();
  await expect(answer).toHaveValue(draft);
  page.once("dialog", dialog => dialog.accept());
  await apply.click();
  await expect(answer).toBeFocused();
  await expect(answer).toHaveValue("I edited this fictional sample before applying it.");
  await record.click();
  await page.getByRole("button", { name: "Discard", exact: true }).click();
  await expect(sample).toHaveCount(0);
  expect(await microphone()).toEqual({ calls: 2, live: 0 });
  await page.clock.install();
  await record.click();
  await expect(stop).toBeVisible();
  await page.clock.fastForward(120_001);
  await expect(sample).toHaveValue(getSampleContent("swe-hash-map")!.sampleTranscript);
  expect(await microphone()).toEqual({ calls: 3, live: 0 });
  await page.getByRole("button", { name: "Discard", exact: true }).click();
  await page.evaluate(() => { window.captureProbe.deny = true; });
  await record.click();
  await expect(page.getByRole("alert").filter({ hasText: "Microphone access was denied" })).toBeVisible();
  await expect(sample).toHaveCount(0);
  await expect(answer).toBeEnabled();
  expect(await microphone()).toEqual({ calls: 4, live: 0 });
  expect(sentAudio).toEqual([]);
  expect(external).toEqual([]);
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
