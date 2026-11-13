import { test, expect, type Page } from "@playwright/test";

interface VoiceTestState { calls: number; streams: MediaStream[]; release?: () => void; recorder?: MediaRecorder; staleStop?: () => void }
declare global { interface Window { voiceTest: VoiceTestState } }
type VoiceWindow = Window;

async function instrument(page: Page, mode: "normal" | "denied" | "late" = "normal") {
  await page.addInitScript((mode) => {
    const w = window as VoiceWindow;
    w.voiceTest = { calls: 0, streams: [] };
    const native = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      w.voiceTest.calls++;
      if (mode === "denied") throw new DOMException("Synthetic denied", "NotAllowedError");
      if (mode === "late") await new Promise<void>((resolve) => { w.voiceTest.release = resolve; });
      const stream = await native(constraints); w.voiceTest.streams.push(stream); return stream;
    };
    const NativeRecorder = MediaRecorder;
    window.MediaRecorder = class extends NativeRecorder {
      constructor(stream: MediaStream, options?: MediaRecorderOptions) { super(stream, options); w.voiceTest.recorder = this; }
    };
  }, mode);
}
async function open(page: Page) {
  await page.goto("/practice");
  await expect(page.getByRole("button", { name: "Record answer", exact: true })).toBeVisible();
}
async function record(page: Page) {
  await page.getByRole("button", { name: "Record answer", exact: true }).click();
  await expect(page.getByText(/Recording:.*0:01/)).toBeVisible();
  await page.getByRole("button", { name: "Stop recording", exact: true }).click();
  await expect(page.getByRole("button", { name: "Transcribe (demo)", exact: true })).toBeVisible();
}
async function transcribe(page: Page) {
  const response = page.waitForResponse((r) => r.url().endsWith("/api/practice/transcriptions") && r.request().method() === "POST");
  await page.getByRole("button", { name: "Transcribe (demo)", exact: true }).click();
  expect((await response).status()).toBe(200);
  await expect(page.getByLabel("Review and edit demo transcript before applying")).toBeVisible();
}

const original = "I implemented an API for a class project and added integration tests for the database boundary.";
const confirmed = "I chose integration tests because they exercised the API and database together, and I also tested a failed write.";

test("real fake-device capture requires edit/confirmation and separate evaluation", async ({ page }, testInfo) => {
  await instrument(page); await open(page);
  expect(await page.evaluate(() => (window as VoiceWindow).voiceTest.calls)).toBe(0);
  await page.getByLabel("Your answer", { exact: true }).fill(original);
  let evaluations = 0;
  page.on("request", (r) => { if (r.url().endsWith("/api/practice/evaluate") && r.method() === "POST") evaluations++; });
  await record(page);
  expect(await page.evaluate(() => (window as VoiceWindow).voiceTest.streams.every((s) => s.getTracks().every((t) => t.readyState === "ended")))).toBe(true);
  await expect(page.getByLabel("Your answer", { exact: true })).toHaveValue(original);
  await transcribe(page);
  await page.getByLabel("Review and edit demo transcript before applying").fill(confirmed);
  await page.screenshot({ path: testInfo.outputPath("voice-review-desktop.png"), fullPage: true });
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "Use confirmed transcript", exact: true }).click();
  await expect(page.getByLabel("Your answer", { exact: true })).toHaveValue(original);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Use confirmed transcript", exact: true }).click();
  await expect(page.getByLabel("Your answer", { exact: true })).toHaveValue(confirmed);
  expect(evaluations).toBe(0);
  const response = page.waitForResponse((r) => r.url().endsWith("/api/practice/evaluate") && r.request().method() === "POST");
  await page.getByRole("button", { name: "Get feedback", exact: true }).click();
  const body = await (await response).json();
  expect(body.attempt.answer).toBe(confirmed); expect(evaluations).toBe(1);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("heading", { name: "Record answer (optional)", exact: true }).scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("region", { name: "Voice answer capture" }).screenshot({ path: testInfo.outputPath("voice-mobile.png") });
});

test("voice confirmation on a follow-up preserves the original draft and source lineage", async ({ page }) => {
  await instrument(page); await open(page);
  await page.getByLabel("Your answer", { exact: true }).fill(original);
  const rootResponse = page.waitForResponse((r) => r.url().endsWith("/api/practice/evaluate") && r.request().method() === "POST");
  await page.getByRole("button", { name: "Get feedback", exact: true }).click();
  const root = (await (await rootResponse).json()).attempt;
  const rootDraft = `${original} This is an unsent original draft.`;
  await page.getByLabel("Your answer", { exact: true }).fill(rootDraft);
  await page.getByRole("button", { name: "Answer follow-up", exact: true }).click();
  await page.getByLabel("Your answer", { exact: true }).fill("A separate focused draft before recording.");
  await record(page); await transcribe(page);
  await page.getByLabel("Review and edit demo transcript before applying").fill(confirmed);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Use confirmed transcript", exact: true }).click();
  await page.getByRole("button", { name: "Return to original question", exact: true }).click();
  await expect(page.getByLabel("Your answer", { exact: true })).toHaveValue(rootDraft);
  await page.getByRole("button", { name: "Answer follow-up", exact: true }).click();
  await expect(page.getByLabel("Your answer", { exact: true })).toHaveValue(confirmed);
  const focusedResponse = page.waitForResponse((r) => r.url().endsWith("/api/practice/evaluate") && r.request().method() === "POST");
  await page.getByRole("button", { name: "Get feedback", exact: true }).click();
  const child = (await (await focusedResponse).json()).attempt;
  expect(child.questionId).toBe(`followup:${root.id}`);
  expect(child.followUpOfAttemptId).toBe(root.id);
  expect(child.previousAttemptId).toBeUndefined();
  expect(child.answer).toBe(confirmed);
});

test("microphone denial keeps the typed draft and navigation usable", async ({ page }) => {
  await instrument(page, "denied"); await open(page);
  await page.getByLabel("Your answer", { exact: true }).fill(original);
  await page.getByRole("button", { name: "Record answer", exact: true }).click();
  await expect(page.getByRole("region", { name: "Voice answer capture" }).getByRole("alert")).toContainText("Microphone access was denied");
  await expect(page.getByLabel("Your answer", { exact: true })).toHaveValue(original);
  await expect(page.getByRole("button", { name: "Get feedback", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Software engineering", exact: true }).click();
  await expect(page.getByRole("button", { name: "Software engineering", exact: true })).toHaveAttribute("aria-pressed", "true");
});

test("late microphone permission is disposed after cancellation and target change", async ({ page }) => {
  await instrument(page, "late"); await open(page);
  await page.getByRole("button", { name: "Record answer", exact: true }).click();
  await expect(page.getByText(/Requesting microphone access/)).toBeVisible();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "Software engineering", exact: true }).click();
  await page.evaluate(() => (window as VoiceWindow).voiceTest.release?.());
  await expect.poll(() => page.evaluate(() => {
    const streams = (window as VoiceWindow).voiceTest.streams;
    return streams.length === 1 && streams.every((s) => s.getTracks().every((t) => t.readyState === "ended"));
  })).toBe(true);
  await expect(page.getByRole("button", { name: "Stop recording", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Record answer", exact: true })).toBeVisible();
});

test("recording and transcription lock navigation; stopped audio needs explicit discard", async ({ page }) => {
  await instrument(page); await open(page);
  await page.getByLabel("Your answer", { exact: true }).fill(original);
  await page.getByRole("button", { name: "Record answer", exact: true }).click();
  await expect(page.getByText(/Recording:.*0:01/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Software engineering", exact: true })).toBeDisabled();
  const home = page.getByRole("link", { name: "Home", exact: true });
  await expect(home).toHaveAttribute("aria-disabled", "true");
  await home.focus(); await page.keyboard.press("Enter"); await expect(page).toHaveURL(/\/practice$/);
  await page.getByRole("button", { name: "Stop recording", exact: true }).click();
  await expect(page.getByRole("button", { name: "Transcribe (demo)", exact: true })).toBeVisible();
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "Software engineering", exact: true }).click();
  await expect(page.getByRole("button", { name: "Behavioral", exact: true })).toHaveAttribute("aria-pressed", "true");
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/practice/transcriptions", async (route) => {
    await gate;
    await route.fulfill({ json: { transcription: { id: route.request().headers()["idempotency-key"], text: confirmed, mode: "demo", model: "demo-transcription-v1", expiresAt: new Date(Date.now() + 600000).toISOString() } } });
  });
  await page.getByRole("button", { name: "Transcribe (demo)", exact: true }).click();
  try {
    await expect(page.getByText(/Transcribing audio \(demo fixture\)/)).toBeVisible();
    await expect(home).toHaveAttribute("aria-disabled", "true");
    await expect(page.getByRole("button", { name: "Get feedback", exact: true })).toBeDisabled();
  } finally { release(); }
  await expect(page.getByLabel("Review and edit demo transcript before applying")).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Software engineering", exact: true }).click();
  await expect(page.getByRole("button", { name: "Software engineering", exact: true })).toHaveAttribute("aria-pressed", "true");
});

for (const status of [502, 503]) {
  test(`uncertain upstream ${status} recovers the same completed request, never starts another`, async ({ page }) => {
    await instrument(page); await open(page); await record(page);
    const requests: { id: string; intent: string }[] = [];
    await page.route("**/api/practice/transcriptions", async (route) => {
      const headers = route.request().headers();
      requests.push({ id: headers["idempotency-key"], intent: headers["x-transcription-intent"] });
      if (requests.length === 1) {
        const generated = await route.fetch(); expect(generated.status()).toBe(200);
        return route.fulfill({ status, json: { error: "Synthetic lost upstream response" } });
      }
      return route.continue();
    });
    await page.getByRole("button", { name: "Transcribe (demo)", exact: true }).click();
    await expect(page.getByRole("button", { name: "Recover transcript", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Recover transcript", exact: true }).click();
    await expect(page.getByLabel("Review and edit demo transcript before applying")).toBeVisible();
    expect(requests).toHaveLength(2);
    expect(requests[1]).toEqual({ id: requests[0].id, intent: "recover" });
    expect(requests[0].intent).toBe("start");
  });
}

test("empty and short demo recognition cannot silently replace a draft or evaluate", async ({ page }) => {
  await instrument(page); await open(page); await record(page);
  await page.route("**/api/practice/transcriptions", (route) => route.fulfill({ json: { transcription: { id: route.request().headers()["idempotency-key"], text: "", mode: "demo", model: "demo-transcription-v1", expiresAt: new Date().toISOString() } } }));
  await transcribe(page);
  await expect(page.getByRole("button", { name: "Use confirmed transcript", exact: true })).toBeDisabled();
  await page.getByLabel("Review and edit demo transcript before applying").fill("short");
  await page.getByRole("button", { name: "Use confirmed transcript", exact: true }).click();
  await expect(page.getByLabel("Your answer", { exact: true })).toHaveValue("short");
  await expect(page.getByRole("button", { name: "Get feedback", exact: true })).toBeDisabled();
});

test("queued old stop cannot detach or orphan a newer recording", async ({ page }) => {
  await instrument(page); await open(page);
  await page.getByRole("button", { name: "Record answer", exact: true }).click();
  await expect(page.getByText(/Recording:.*0:01/)).toBeVisible();
  await page.evaluate(() => {
    const recorder = window.voiceTest.recorder!;
    const onstop = recorder.onstop;
    recorder.onstop = (event) => { window.voiceTest.staleStop = () => onstop?.call(recorder, event); };
  });
  await page.getByRole("button", { name: "Stop recording", exact: true }).click();
  await expect.poll(() => page.evaluate(() => !!window.voiceTest.staleStop)).toBe(true);
  await page.getByRole("button", { name: "Discard", exact: true }).click();
  await page.getByRole("button", { name: "Record answer", exact: true }).click();
  await expect(page.getByRole("button", { name: "Stop recording", exact: true })).toBeVisible();
  await page.evaluate(() => window.voiceTest.staleStop?.());
  await page.getByRole("button", { name: "Discard", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.voiceTest.streams.length === 2 && window.voiceTest.streams.every((s) => s.getTracks().every((t) => t.readyState === "ended")))).toBe(true);
});

test("feedback selection confirms discarding voice and preserves the baseline when declined", async ({ page }) => {
  await instrument(page); await open(page);
  for (const [answer, label] of [[original, "Get feedback"], [confirmed, "Evaluate my retry"]]) {
    await page.getByLabel("Your answer", { exact: true }).fill(answer);
    const response = page.waitForResponse((r) => r.url().endsWith("/api/practice/evaluate") && r.request().method() === "POST");
    await page.getByRole("button", { name: label, exact: true }).click(); await response;
  }
  await record(page);
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "View feedback for attempt 1", exact: true }).click();
  await expect(page.getByRole("button", { name: "View feedback for attempt 1", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Transcribe (demo)", exact: true })).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "View feedback for attempt 1", exact: true }).click();
  await expect(page.getByRole("button", { name: "Transcribe (demo)", exact: true })).toHaveCount(0);
  await page.getByText("Earlier attempts (1)", { exact: true }).click();
  await expect(page.getByRole("button", { name: "View feedback for attempt 2", exact: true })).toBeVisible();
});

for (const kind of ["root", "followup"]) {
  test(`active ${kind} sidebar cannot reset an older baseline while retaining voice`, async ({ page }) => {
    await instrument(page); await open(page);
    if (kind === "followup") {
      await page.getByLabel("Your answer", { exact: true }).fill(original);
      const response = page.waitForResponse((r) => r.url().endsWith("/api/practice/evaluate") && r.request().method() === "POST");
      await page.getByRole("button", { name: "Get feedback", exact: true }).click(); await response;
      await page.getByRole("button", { name: "Answer follow-up", exact: true }).click();
    }
    for (const [answer, label] of [[original, "Get feedback"], [confirmed, "Evaluate my retry"]]) {
      await page.getByLabel("Your answer", { exact: true }).fill(answer);
      const response = page.waitForResponse((r) => r.url().endsWith("/api/practice/evaluate") && r.request().method() === "POST");
      await page.getByRole("button", { name: label, exact: true }).click(); await response;
    }
    await page.getByRole("button", { name: "View feedback for attempt 1", exact: true }).click();
    await page.getByText("Earlier attempts (1)", { exact: true }).click();
    await expect(page.getByRole("button", { name: "View feedback for attempt 2", exact: true })).toBeVisible();
    await record(page);
    page.once("dialog", (dialog) => dialog.dismiss());
    const entry = kind === "root" ? page.getByRole("button", { name: /^Ownership and impact/ }) : page.getByRole("button", { name: /^Open saved follow-up 1:/ });
    await entry.click();
    await expect(page.getByRole("button", { name: "View feedback for attempt 2", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Transcribe (demo)", exact: true })).toBeVisible();
  });
}

test("oversized encoded capture stops all tracks without replacing typed evidence", async ({ page }) => {
  await instrument(page); await open(page);
  await page.getByLabel("Your answer", { exact: true }).fill(original);
  await page.getByRole("button", { name: "Record answer", exact: true }).click();
  await expect(page.getByRole("button", { name: "Stop recording", exact: true })).toBeVisible();
  await page.evaluate(() => window.voiceTest.recorder?.dispatchEvent(new BlobEvent("dataavailable", { data: new Blob([new Uint8Array(10 * 1024 * 1024 + 1)]) })));
  await expect(page.getByRole("region", { name: "Voice answer capture" }).getByRole("alert")).toContainText("10 MiB");
  await expect(page.getByLabel("Your answer", { exact: true })).toHaveValue(original);
  expect(await page.evaluate(() => window.voiceTest.streams.every((s) => s.getTracks().every((t) => t.readyState === "ended")))).toBe(true);
});

test("maximum-duration timer stops the microphone without waiting for user action", async ({ page }) => {
  await instrument(page); await page.clock.install(); await open(page);
  await page.getByRole("button", { name: "Record answer", exact: true }).click();
  await expect(page.getByRole("button", { name: "Stop recording", exact: true })).toBeVisible();
  await page.clock.fastForward(120001); // Control-path test only; B1a measured real 120s audio.
  await expect.poll(() => page.evaluate(() => window.voiceTest.streams.length === 1 && window.voiceTest.streams.every((s) => s.getTracks().every((t) => t.readyState === "ended")))).toBe(true);
  await expect(page.getByRole("button", { name: "Stop recording", exact: true })).toHaveCount(0);
});

test("unsupported capture APIs keep the typed workflow usable", async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(window, "MediaRecorder", { value: undefined, configurable: true }));
  await open(page);
  await page.getByLabel("Your answer", { exact: true }).fill(original);
  await page.getByRole("button", { name: "Record answer", exact: true }).click();
  await expect(page.getByRole("region", { name: "Voice answer capture" }).getByRole("alert")).toContainText("not supported");
  await expect(page.getByLabel("Your answer", { exact: true })).toHaveValue(original);
  await expect(page.getByRole("button", { name: "Get feedback", exact: true })).toBeEnabled();
});

test("recorder error followed by stop cannot resurrect a failed recording", async ({ page }) => {
  await instrument(page); await open(page);
  await page.getByRole("button", { name: "Record answer", exact: true }).click();
  await expect(page.getByText(/Recording:.*0:01/)).toBeVisible();
  await page.evaluate(() => (window as VoiceWindow).voiceTest.recorder?.dispatchEvent(new Event("error")));
  await expect(page.getByRole("region", { name: "Voice answer capture" }).getByRole("alert")).toContainText(/media error/);
  await page.evaluate(() => (window as VoiceWindow).voiceTest.recorder?.dispatchEvent(new Event("stop")));
  await expect(page.getByRole("button", { name: "Transcribe (demo)", exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => (window as VoiceWindow).voiceTest.streams.every((s) => s.getTracks().every((t) => t.readyState === "ended")))).toBe(true);
});
