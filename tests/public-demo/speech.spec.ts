import { execFileSync } from "node:child_process";
import { expect, test, type Page } from "@playwright/test";
import { getSampleContent } from "../../src/content/questions/demo-audio";

declare global {
  interface Window {
    speechStub: {
      last?: StubRecognition;
      instances: StubRecognition[];
      aborts: number;
      stops: number;
      throwOnStart: boolean;
      holdEnd: boolean;
    };
    __cspViolations?: string[];
  }
}

interface StubRecognition {
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onresult: ((event: { resultIndex: number; results: Array<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
}

async function installRecognizer(page: Page) {
  await page.addInitScript(() => {
    window.__cspViolations = [];
    document.addEventListener("securitypolicyviolation", (event) => {
      window.__cspViolations?.push(event.effectiveDirective);
    });
    window.speechStub = { instances: [], aborts: 0, stops: 0, throwOnStart: false, holdEnd: false };
    class Recognition {
      lang = "";
      continuous = false;
      interimResults = false;
      onstart: (() => void) | null = null;
      onend: (() => void) | null = null;
      onerror: ((event: { error?: string }) => void) | null = null;
      onresult: ((event: { resultIndex: number; results: Array<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null = null;
      start() {
        window.speechStub.instances.push(this);
        window.speechStub.last = this;
        if (window.speechStub.throwOnStart) throw new Error("start failed");
      }
      stop() {
        window.speechStub.stops += 1;
        if (!window.speechStub.holdEnd) this.onend?.();
      }
      abort() {
        window.speechStub.aborts += 1;
        this.onerror?.({ error: "aborted" });
        this.onend?.();
      }
    }
    const host = window as Window & { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
    host.SpeechRecognition = Recognition;
    host.webkitSpeechRecognition = Recognition;
  });
}

function watch(page: Page) {
  const hydration: string[] = [];
  const audio: string[] = [];
  page.on("console", (message) => {
    if (/hydration|did not match/i.test(message.text())) hydration.push(message.text());
  });
  page.on("request", (request) => {
    const type = request.headers()["content-type"] ?? "";
    if (request.url().includes("/api/practice/transcriptions") || /^audio\/|^application\/octet-stream|^multipart\//.test(type)) {
      audio.push(new URL(request.url()).pathname);
    }
  });
  return { hydration, audio };
}

async function openSpeechPractice(page: Page) {
  await page.goto("/");
  await page.getByRole("link", { name: "Start focused practice", exact: true }).click();
  await expect(page.getByText("Browser speech", { exact: true })).toBeVisible();
  await expect(page.getByText(/Your browser turns your speech into text/)).toBeVisible();
}

async function violations(page: Page) {
  return page.evaluate(() => window.__cspViolations ?? []);
}

test.beforeAll(async ({ request }) => {
  execFileSync("docker", ["restart", "echo-public-demo"], { stdio: "pipe" });
  await expect.poll(async () => (await request.get("/", { failOnStatusCode: false }).catch(() => null))?.status()).toBe(200);
});

test("live words stay unduplicated and Stop opens Your transcript", async ({ page }) => {
  const seen = watch(page);
  await installRecognizer(page);
  await openSpeechPractice(page);
  await page.getByRole("button", { name: "Record answer", exact: true }).click();
  await expect(page.getByText("Requesting microphone access…")).toBeVisible();
  await page.evaluate(() => window.speechStub.last?.onstart?.());
  await expect(page.getByRole("button", { name: "Stop recording", exact: true })).toBeVisible();
  await page.evaluate(() => {
    const recognition = window.speechStub.last!;
    recognition.onresult?.({ resultIndex: 0, results: [{ isFinal: false, 0: { transcript: "hel" } }] });
    recognition.onresult?.({ resultIndex: 0, results: [{ isFinal: false, 0: { transcript: "hello" } }] });
  });
  await expect(page.getByText("hello", { exact: true })).toBeVisible();
  await expect(page.getByText("helhello")).toHaveCount(0);
  await expect(page.getByRole("status").filter({ hasText: "Recording in progress" })).not.toHaveText(/hello/);
  await page.evaluate(() => window.speechStub.holdEnd = true);
  await page.getByRole("button", { name: "Stop recording", exact: true }).click();
  await expect(page.locator("p.text-body", { hasText: "Finishing…" })).toBeVisible();
  await page.evaluate(() => window.speechStub.last?.onend?.());
  const box = page.getByRole("textbox", { name: "Your transcript", exact: true });
  await expect(box).toBeFocused();
  await expect(box).toHaveValue("hello");
  await expect(page.getByRole("button", { name: "Use in answer draft", exact: true })).toBeVisible();
  expect(await violations(page)).toEqual([]);
  expect(seen.hydration).toEqual([]);
  expect(seen.audio).toEqual([]);
});

test("Stop without onend keeps the words after the 3-second abort", async ({ page }) => {
  await installRecognizer(page);
  await openSpeechPractice(page);
  await page.getByRole("button", { name: "Record answer", exact: true }).click();
  await page.evaluate(() => {
    window.speechStub.holdEnd = true;
    window.speechStub.last?.onstart?.();
    window.speechStub.last?.onresult?.({ resultIndex: 0, results: [{ isFinal: true, 0: { transcript: "partial " } }, { isFinal: false, 0: { transcript: "word" } }] });
  });
  await expect(page.getByText("partial word", { exact: true })).toBeVisible();
  await page.clock.install();
  await page.getByRole("button", { name: "Stop recording", exact: true }).click();
  await expect(page.locator("p.text-body", { hasText: "Finishing…" })).toBeVisible();
  await page.clock.fastForward(3_001);
  const box = page.getByRole("textbox", { name: "Your transcript", exact: true });
  await expect(box).toHaveValue("partial word");
  await expect(page.getByRole("alert").filter({ hasText: "Speech recognition failed" })).toHaveCount(0);
  expect(await page.evaluate(() => window.speechStub.aborts)).toBeGreaterThan(0);
});

test("the two-minute limit starts when recognition starts, not while permission is pending", async ({ page }) => {
  await installRecognizer(page);
  await openSpeechPractice(page);
  await page.clock.install();
  await page.getByRole("button", { name: "Record answer", exact: true }).click();
  await expect(page.getByText("Requesting microphone access…")).toBeVisible();
  await page.clock.fastForward(120_001);
  await expect(page.getByText("Requesting microphone access…")).toBeVisible();
  expect(await page.evaluate(() => window.speechStub.stops)).toBe(0);
  await page.evaluate(() => {
    const recognition = window.speechStub.last!;
    recognition.onstart?.();
    recognition.onresult?.({ resultIndex: 0, results: [{ isFinal: true, 0: { transcript: "two minutes" } }] });
  });
  await expect(page.getByRole("button", { name: "Stop recording", exact: true })).toBeVisible();
  await page.clock.fastForward(120_001);
  await expect(page.getByRole("textbox", { name: "Your transcript", exact: true })).toHaveValue("two minutes");
  expect(await page.evaluate(() => window.speechStub.stops)).toBe(1);
});

test("an early onend keeps the words so far and does not restart", async ({ page }) => {
  await installRecognizer(page);
  await openSpeechPractice(page);
  await page.getByRole("button", { name: "Record answer", exact: true }).click();
  await page.evaluate(() => {
    const recognition = window.speechStub.last!;
    recognition.onstart?.();
    recognition.onresult?.({ resultIndex: 0, results: [{ isFinal: true, 0: { transcript: "stopped early" } }] });
    recognition.onend?.();
  });
  await expect(page.getByRole("status").filter({ hasText: "Recording stopped." })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Your transcript", exact: true })).toHaveValue("stopped early");
  expect(await page.evaluate(() => window.speechStub.instances.length)).toBe(1);
});

test("onerror followed by onend keeps the error instead of an empty transcript", async ({ page }) => {
  await installRecognizer(page);
  await openSpeechPractice(page);
  await page.getByRole("button", { name: "Record answer", exact: true }).click();
  await page.evaluate(() => {
    const recognition = window.speechStub.last!;
    recognition.onerror?.({ error: "network" });
    recognition.onend?.();
  });
  await expect(page.getByRole("alert").filter({ hasText: "Speech recognition couldn't reach its service." })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Your transcript", exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Your answer", { exact: true })).toBeEnabled();
});

test("no-speech explains that nothing was heard", async ({ page }) => {
  await installRecognizer(page);
  await openSpeechPractice(page);
  await page.getByRole("button", { name: "Record answer", exact: true }).click();
  await page.evaluate(() => {
    window.speechStub.last?.onerror?.({ error: "no-speech" });
    window.speechStub.last?.onend?.();
  });
  await expect(page.getByRole("alert").filter({ hasText: "No speech was heard." })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Your transcript", exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Your answer", { exact: true })).toBeEnabled();
});

test("an empty successful result focuses an empty transcript box", async ({ page }) => {
  await installRecognizer(page);
  await openSpeechPractice(page);
  await page.getByRole("button", { name: "Record answer", exact: true }).click();
  await page.evaluate(() => {
    window.speechStub.holdEnd = true;
    window.speechStub.last?.onstart?.();
  });
  await page.getByRole("button", { name: "Stop recording", exact: true }).click();
  await page.evaluate(() => window.speechStub.last?.onend?.());
  const box = page.getByRole("textbox", { name: "Your transcript", exact: true });
  await expect(box).toBeFocused();
  await expect(box).toHaveValue("");
});

test("permission denied keeps typing available and never shows the sample transcript", async ({ page }) => {
  await installRecognizer(page);
  await openSpeechPractice(page);
  await page.getByRole("button", { name: "Record answer", exact: true }).click();
  await page.evaluate(() => {
    window.speechStub.last?.onerror?.({ error: "not-allowed" });
    window.speechStub.last?.onend?.();
  });
  await expect(page.getByRole("alert").filter({ hasText: "Microphone access was denied." })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Sample transcript", exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Your answer", { exact: true })).toBeEnabled();
});

test("an unsolicited abort while recording is an error and does not keep the words", async ({ page }) => {
  await installRecognizer(page);
  await openSpeechPractice(page);
  await page.getByRole("button", { name: "Record answer", exact: true }).click();
  await page.evaluate(() => {
    const recognition = window.speechStub.last!;
    recognition.onstart?.();
    recognition.onresult?.({ resultIndex: 0, results: [{ isFinal: false, 0: { transcript: "still talking" } }] });
    recognition.onerror?.({ error: "aborted" });
    recognition.onend?.();
  });
  await expect(page.getByRole("alert").filter({ hasText: "Speech recognition failed. You can keep typing." })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Your transcript", exact: true })).toHaveCount(0);
  await expect(page.getByText("still talking", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Your answer", { exact: true })).toBeEnabled();
});

test("a synchronous start failure stays out of the sample transcript", async ({ page }) => {
  await installRecognizer(page);
  await openSpeechPractice(page);
  await page.evaluate(() => { window.speechStub.throwOnStart = true; });
  await page.getByRole("button", { name: "Record answer", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Speech recognition couldn't start." })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Sample transcript", exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Your answer", { exact: true })).toBeEnabled();
});

test("without speech recognition the sample recorder is unchanged", async ({ page }) => {
  const seen = watch(page);
  await page.addInitScript(() => {
    for (const key of ["SpeechRecognition", "webkitSpeechRecognition"] as const) {
      Object.defineProperty(window, key, { configurable: true, writable: true, value: undefined });
    }
  });
  await page.goto("/");
  await page.getByRole("link", { name: "Start focused practice", exact: true }).click();
  await expect(page.getByText("Browser only", { exact: true })).toBeVisible();
  await expect(page.getByText(/Your audio stays in this browser/)).toBeVisible();
  await page.getByRole("button", { name: "Record answer", exact: true }).click();
  await page.getByRole("button", { name: "Stop recording", exact: true }).click();
  const sample = page.getByRole("textbox", { name: "Sample transcript", exact: true });
  await expect(sample).toHaveValue(getSampleContent("behavioral-project")!.sampleTranscript);
  expect(seen.hydration).toEqual([]);
  expect(seen.audio).toEqual([]);
});

test("Discard aborts recognition and drops the words", async ({ page }) => {
  await installRecognizer(page);
  await openSpeechPractice(page);
  await page.getByRole("button", { name: "Record answer", exact: true }).click();
  await page.evaluate(() => {
    window.speechStub.holdEnd = true;
    window.speechStub.last?.onstart?.();
    window.speechStub.last?.onresult?.({ resultIndex: 0, results: [{ isFinal: true, 0: { transcript: "drop me" } }] });
  });
  await page.getByRole("button", { name: "Discard", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Your transcript", exact: true })).toHaveCount(0);
  await expect(page.getByText("drop me", { exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => window.speechStub.aborts)).toBeGreaterThan(0);
  await expect(page.getByLabel("Your answer", { exact: true })).toBeEnabled();
});

test("Cancel before recognition starts aborts a late onstart", async ({ page }) => {
  await installRecognizer(page);
  await openSpeechPractice(page);
  await page.getByRole("button", { name: "Record answer", exact: true }).click();
  await expect(page.getByText("Requesting microphone access…")).toBeVisible();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  const afterCancel = await page.evaluate(() => window.speechStub.aborts);
  expect(afterCancel).toBeGreaterThan(0);
  await page.evaluate(() => window.speechStub.last?.onstart?.());
  expect(await page.evaluate(() => window.speechStub.aborts)).toBe(afterCancel + 1);
  await expect(page.getByRole("button", { name: "Record answer", exact: true })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Your transcript", exact: true })).toHaveCount(0);
});
