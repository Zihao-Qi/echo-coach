import { execFileSync } from "node:child_process";
import { expect, test, type Page, type Route } from "@playwright/test";
import { encodeCanonicalWav } from "../../src/domain/audio/canonical-wav";
import type { AnswerEvaluation, InterviewQuestion } from "../../src/domain/interview/practice";
import { KEY_SLOT } from "../../src/features/practice/key/key-store";
import { HISTORY_SLOT } from "../../src/features/practice/key/history";

const sentinel = "SYNTHETIC_BYOK_HEADER_ONLY_MARKER";
const google = "https://generativelanguage.googleapis.com";
const draft = "I compared two fictional designs, then documented the trade-offs of using a hash table.";
const suggested = "Use a hash table for expected constant-time lookup, or a sorted array when order matters.";
const button = (page: Page, name: string) => page.getByRole("button", { name, exact: true });
const answer = (page: Page) => page.getByRole("textbox", { name: "Your answer", exact: true });
const candidate = (parts: object[], finishReason = "STOP") => ({ candidates: [{ finishReason, content: { parts } }] });
const provider = (status: number, reason?: string) => [status, { error: { message: `Never render ${sentinel}`, details: reason ? [{ reason }] : [] } }] as const;

function deferred() {
  let release!: () => void;
  const wait = new Promise<void>(resolve => { release = resolve; });
  return { wait, release };
}
async function setup(page: Page, baseURL: string) {
  const origin = new URL(baseURL).origin;
  const requests: { path: string; method: string; body: unknown }[] = [];
  const app: string[] = [], invalid: string[] = [], errors: string[] = [];
  let override: ((route: Route) => Promise<void> | void) | undefined;
  await page.addInitScript(() => {
    const messages: string[] = [];
    Object.defineProperty(window, "__keyCsp", { value: messages });
    document.addEventListener("securitypolicyviolation", e => messages.push(`${e.effectiveDirective} ${e.blockedURI} ${e.sourceFile}:${e.lineNumber}`));
  });
  page.on("pageerror", e => errors.push(e.message));
  page.on("console", m => {
    if (m.text().includes(sentinel)) invalid.push("console");
    if (/content security policy|violates.*directive|hydration|Minified React error #418/i.test(m.text())) errors.push(m.text());
  });
  await page.route("**/*", async route => {
    const r = route.request();
    const url = new URL(r.url());
    const headers = await r.allHeaders();
    const body = r.postData();
    if (url.href.includes(sentinel) || body?.includes(sentinel) || Object.entries(headers).some(([k, v]) => v.includes(sentinel) && !(k === "x-goog-api-key" && url.origin === google))) invalid.push("request");
    if (url.origin === origin) {
      if (url.pathname.startsWith("/api/practice/")) app.push(url.pathname);
      return route.continue();
    }
    if (url.protocol === "blob:" || url.protocol === "data:") return route.continue();
    if (url.origin !== google || headers["x-goog-api-key"] !== sentinel) { invalid.push("unapproved origin or header"); return route.abort(); }
    const data = body ? JSON.parse(body) : null;
    requests.push({ path: url.pathname, method: r.method(), body: data });
    if (override) return override(route);
    if (r.method() === "GET") return route.fulfill({ json: { name: "models/gemini-3.8-flash" } });
    if (url.pathname.includes("-tts:")) return route.fulfill({ json: candidate([{ inlineData: { mimeType: "audio/L16;rate=16000", data: Buffer.alloc(320_000).toString("base64") } }]) });
    if (data.contents[0].parts[1]?.inlineData) return route.fulfill({ json: candidate([{ text: "ignore", thought: true }, { text: draft }]) });
    const { question, candidateAnswer, previousAnswer } = JSON.parse(data.contents[0].parts[0].text) as { question: InterviewQuestion; candidateAnswer: string; previousAnswer: { answer: string } | null };
    const assessment = { status: "partial" as const, observation: "You name a data structure. Explain why it suits the lookup workload.", excerpt: candidateAnswer.slice(0, 45) };
    const evaluation: AnswerEvaluation = {
      criteria: { correctness: assessment, reasoning: assessment, structure: assessment, evidence: assessment },
      strengths: [{ observation: "You identify a design choice.", excerpt: assessment.excerpt }],
      gaps: [{ observation: "The lookup cost is not explained.", nextStep: "State the expected cost and what can make it worse." }],
      uncertainty: ["The workload and memory budget aren't stated."], nextSteps: ["Contrast lookup cost with the value of sorted traversal."],
      suggestedAnswer: suggested, comparison: null,
      followUp: question.origin === "follow-up" ? null : { prompt: "What trade-off mattered most in your decision?", rationale: "Probe a specific choice.", focus: "reasoning", expectedConcepts: ["One trade-off"] },
    };
    if (previousAnswer) evaluation.comparison = { summary: "The revised answer explains a trade-off.", changes: [{ kind: "improvement", observation: "Adds a reason.", beforeExcerpt: previousAnswer.answer, afterExcerpt: candidateAnswer }], nextFocus: "Explain the consequence." };
    return route.fulfill({ json: candidate([{ text: "private chain of thought", thought: true }, { text: JSON.stringify(evaluation) }]) });
  });
  return { requests, app, setOverride(fn?: typeof override) { override = fn; }, async clean(remember = false) {
    expect(errors).toEqual([]); expect(invalid).toEqual([]);
    expect(await page.evaluate(() => Reflect.get(window, "__keyCsp"))).toEqual([]);
    expect(JSON.stringify(await page.context().cookies())).not.toContain(sentinel);
    await expect(page.getByText(sentinel, { exact: false })).toHaveCount(0);
    expect(await page.evaluate(() => JSON.stringify(sessionStorage))).not.toContain(sentinel);
    const key = await page.evaluate(() => { try { return JSON.stringify(localStorage); } catch { return ""; } });
    if (remember) expect(key).toContain(sentinel); else expect(key).not.toContain(sentinel);
  } };
}
async function openKey(page: Page, remember = false) {
  await button(page, "Use your Gemini key").click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByLabel("Gemini API key")).toBeFocused();
  await page.getByLabel("Gemini API key").fill(` ${sentinel} `);
  if (remember) await page.getByLabel("Remember in this browser").check();
}
async function activate(page: Page, remember = false) {
  await openKey(page, remember); await button(page, "Use key").click();
  await expect(button(page, "Remove key")).toBeFocused();
}
async function technicalFeedback(page: Page) {
  await button(page, "Software engineering").click();
  await answer(page).fill(draft); await button(page, "Get feedback").click();
  await expect(page.getByText("Gemini · gemini-3.8-flash · your key", { exact: true })).toBeVisible();
  await page.getByText("Optional suggested answer · try improving yours first", { exact: true }).click();
  await expect(page.getByText(suggested, { exact: true })).toBeVisible();
}
async function shot(page: Page, name: string, section?: ReturnType<Page["locator"]>) {
  if (!process.env.BYOK_SHOTS) return;
  if (section) await section.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${process.env.BYOK_SHOTS}/${name}-${page.viewportSize()?.width}.png` });
}

test.beforeAll(async ({ request }) => {
  execFileSync("docker", ["restart", "echo-public-demo"], { stdio: "pipe" });
  await expect.poll(async () => (await request.get("/", { failOnStatusCode: false }).catch(() => null))?.status()).toBe(200);
});

test("key mode uses only Gemini for feedback, retries, follow-ups, audio and local recap", async ({ page, baseURL }) => {
  const seen = await setup(page, baseURL!);
  await page.goto("/practice"); await activate(page);
  const checkpoint = seen.app.length;
  await technicalFeedback(page);
  const suggestion = page.locator("details").filter({ hasText: "Optional suggested answer" });
  await shot(page, "byok-feedback", suggestion);
  await shot(page, "byok-header", page.getByRole("banner"));
  await expect(page.getByRole("region", { name: "Sample polished answer" })).toHaveCount(0);
  await expect(page.getByRole("progressbar", { name: "Suggested answer audio progress" })).toHaveCount(0);
  await button(page, "Play").click();
  await expect(button(page, "Pause")).toBeVisible();
  await button(page, "Edit answer").click();
  await button(page, "Listen to the question").click();
  await expect(button(page, "Play")).toBeVisible();
  await page.getByText("Optional suggested answer · try improving yours first", { exact: true }).click();
  await page.getByText("Optional suggested answer · try improving yours first", { exact: true }).click();
  await button(page, "Play").click();
  await expect(button(page, "Pause")).toBeVisible();
  await expect(button(page, "Listen to the question")).toBeVisible();
  expect(seen.requests.filter(r => r.path.includes("-tts:")).length).toBe(1);
  expect((seen.requests.find(r => r.path.includes("-tts:"))?.body)).toMatchObject({ contents: [{ parts: [{ text: suggested }] }] });
  await answer(page).fill(`${draft} I also weighed ordered traversal.`);
  await button(page, "Evaluate my retry").click();
  await expect(page.getByText("The revised answer explains a trade-off.")).toBeVisible();
  await button(page, "Answer follow-up").click();
  await expect(page.getByRole("region", { name: "Voice answer capture" })).toHaveCount(0);
  await answer(page).fill(draft); await button(page, "Get feedback").click();
  await expect(page.getByRole("heading", { name: "Feedback", exact: true })).toBeVisible();
  await expect(button(page, "Answer follow-up")).toHaveCount(0);
  await button(page, "Session recap").click();
  await expect(page.getByRole("heading", { name: "Session recap" })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Software engineering · 2 attempts/ })).toBeVisible();
  expect(seen.app.slice(checkpoint)).toEqual([]);
  await seen.clean();
  await button(page, "Remove key").click();
  await expect(button(page, "Use your Gemini key")).toBeFocused();
  await expect(answer(page)).toHaveValue(`${draft} I also weighed ordered traversal.`);
});

test("dialog cancellation, rejection, timeout and successful tab-only use", async ({ page, baseURL }) => {
  const seen = await setup(page, baseURL!); await page.goto("/practice");
  const gate = deferred(), pending = deferred();
  seen.setOverride(async route => { pending.release(); await gate.wait; await route.fulfill({ json: { name: "models/gemini-3.8-flash" } }).catch(() => {}); });
  await openKey(page); await button(page, "Use key").click(); await pending.wait;
  await page.keyboard.press("Escape"); await expect(button(page, "Use your Gemini key")).toBeFocused();
  gate.release(); seen.setOverride();
  await openKey(page); await shot(page, "byok-dialog");
  for (const [code, reason, copy] of [[400, "API_KEY_INVALID", /didn't accept/], [403, "API_KEY_HTTP_REFERRER_BLOCKED", /restrictions block/]] as const) {
    const [status, json] = provider(code, reason);
    seen.setOverride(route => route.fulfill({ status, json }));
    await button(page, "Use key").click(); await expect(page.getByRole("dialog").getByRole("alert")).toHaveText(copy);
  }
  const hold = deferred(); const started = deferred();
  seen.setOverride(async route => { started.release(); await hold.wait; await route.abort().catch(() => {}); });
  await page.clock.install(); await button(page, "Use key").click(); await started.wait;
  await page.clock.fastForward(15_001);
  await expect(page.getByRole("dialog").getByRole("alert")).toHaveText("Couldn't reach Google. Try again.");
  hold.release(); seen.setOverride();
  await button(page, "Use key").click(); await expect(button(page, "Remove key")).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(seen.requests.every(r => r.method === "GET" && r.body === null)).toBeTruthy();
  await seen.clean();
  await page.reload(); await expect(button(page, "Use your Gemini key")).toBeVisible();
});

test("remembered startup is local and cross-tab removal cancels work", async ({ page, baseURL }) => {
  const seen = await setup(page, baseURL!); await page.goto("/practice"); await activate(page, true);
  await answer(page).fill(draft); await button(page, "Get feedback").click();
  await expect(page.getByRole("heading", { name: "Structure outline" })).toBeVisible();
  await expect(button(page, "Play")).toHaveCount(0);
  await seen.clean(true);
  const checkpoint = seen.app.length, calls = seen.requests.length;
  await page.reload(); await expect(page.getByRole("heading", { name: "Structure outline" })).toBeVisible();
  expect(seen.app.length).toBe(checkpoint); expect(seen.requests.length).toBe(calls);
  await button(page, "Answer follow-up").click();
  await answer(page).fill(draft); const started = deferred(); const hold = deferred();
  seen.setOverride(async route => { started.release(); await hold.wait; await route.fulfill({ json: candidate([{ text: "{}" }]) }).catch(() => {}); });
  await button(page, "Get feedback").click(); await started.wait;
  await expect(button(page, "Remove key")).toBeDisabled();
  const second = await page.context().newPage(); const secondSeen = await setup(second, baseURL!);
  await second.goto("/practice"); await button(second, "Remove key").click();
  await expect(button(page, "Use your Gemini key")).toBeVisible(); hold.release();
  await expect(page.getByText("What trade-off mattered most in your decision?", { exact: true })).toHaveCount(0);
  expect(await page.evaluate(slot => JSON.parse(sessionStorage.getItem(slot) ?? "[]").length, HISTORY_SLOT)).toBe(1);
  expect(secondSeen.requests).toEqual([]);
  await seen.clean(); await second.close();
});

test("removing key mode from a saved follow-up returns to its own starter with its draft", async ({ page, baseURL }) => {
  const seen = await setup(page, baseURL!); await page.goto("/practice"); await activate(page);
  const root = await page.getByRole("heading", { level: 1 }).textContent();
  await answer(page).fill(draft); await button(page, "Get feedback").click();
  await button(page, "Answer follow-up").click(); await answer(page).fill(draft);
  await button(page, "Get feedback").click();
  await expect(page.getByRole("heading", { name: "Feedback", exact: true })).toBeVisible();
  await button(page, "Software engineering").click();
  await page.getByText("Saved follow-ups (1)", { exact: true }).click();
  await page.getByRole("button", { name: /^Open saved follow-up/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: /What trade-off mattered most in your decision\?/ })).toBeVisible();
  await button(page, "Remove key").click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(root!);
  await expect(answer(page)).toHaveValue(draft);
  await seen.clean();
});

test("provider failures keep the draft without retries or sample fallback", async ({ page, baseURL }) => {
  const seen = await setup(page, baseURL!); await page.goto("/practice"); await activate(page);
  await answer(page).fill(draft);
  const cases = [
    [...provider(400, "API_KEY_INVALID"), /didn't accept/], [...provider(403, "API_KEY_SERVICE_BLOCKED"), /restrictions block/],
    [...provider(403), /denied access/], [...provider(429), /quota or rate limit/], [...provider(502), /temporarily unavailable/],
    [...provider(404), /can't use gemini-3.8-flash/], [...provider(400, "FAILED_PRECONDITION"), /refused this request/],
    [200, { promptFeedback: { blockReason: "SAFETY" } }, /didn't return a usable answer/], [200, candidate([{ text: "not JSON" }]), /couldn't be used/],
  ] as const;
  for (const [status, json, copy] of cases) {
    const n = seen.requests.length; seen.setOverride(route => route.fulfill({ status, json }));
    await button(page, "Get feedback").click(); await expect(page.getByRole("alert").filter({ hasText: copy })).toBeVisible();
    await expect(answer(page)).toHaveValue(draft);
    const contextual = page.getByRole("alert").filter({ hasText: copy }).getByRole("button", { name: "Remove key", exact: true });
    await expect(contextual).toHaveCount(copy.source === "didn't accept" || copy.source === "denied access" ? 1 : 0);
    expect(seen.requests.length).toBe(n + 1);
  }
  await expect(page.getByRole("heading", { name: "Sample feedback" })).toHaveCount(0); await seen.clean();
});

test("invalid and quota-limited audio can be retried; a WAV plays", async ({ page, baseURL }) => {
  const seen = await setup(page, baseURL!); await page.goto("/practice"); await activate(page); await technicalFeedback(page);
  const hold = deferred();
  seen.setOverride(async route => { await hold.wait; await route.fulfill({ json: candidate([{ inlineData: { mimeType: "audio/ogg", data: "AA==" } }]) }); });
  await button(page, "Play").click();
  await expect(button(page, "Generating audio…")).toBeDisabled(); await expect(button(page, "Remove key")).toBeDisabled(); await shot(page, "byok-generating", button(page, "Generating audio…"));
  hold.release(); await expect(button(page, "Try again")).toBeVisible(); await shot(page, "byok-audio-error", button(page, "Try again"));
  seen.setOverride(route => route.fulfill({ status: 429, json: {} })); await button(page, "Try again").click();
  await expect(page.getByText(/Audio isn't available with this key/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Feedback", exact: true })).toBeVisible();
  seen.setOverride(route => route.fulfill({ status: 403, json: {} })); await button(page, "Try again").click();
  await expect(page.getByText(/Audio isn't available with this key/)).toBeVisible();
  const wav = Buffer.from(encodeCanonicalWav(new Float32Array(16000 * 8).fill(0.01))).toString("base64");
  seen.setOverride(route => route.fulfill({ json: candidate([{ inlineData: { mimeType: "audio/wav", data: wav } }]) }));
  await button(page, "Try again").click(); await expect(button(page, "Pause")).toBeVisible(); await seen.clean();
});

async function toneMicrophone(page: Page) {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      const audio = new AudioContext();
      const destination = audio.createMediaStreamDestination();
      const tone = audio.createOscillator();
      tone.connect(destination); tone.start(); await audio.resume();
      const track = destination.stream.getAudioTracks()[0];
      Reflect.set(window, "testMicrophoneTrack", track);
      const stop = track.stop.bind(track);
      track.stop = () => { stop(); if (audio.state !== "closed") void audio.close(); };
      return destination.stream;
    };
  });
}

test("collapsing a suggestion aborts audio generation without replaying or caching the late response", async ({ page, baseURL }) => {
  const seen = await setup(page, baseURL!);
  await page.goto("/practice"); await activate(page); await technicalFeedback(page);
  const began = deferred(); const release = deferred();
  seen.setOverride(async route => {
    began.release(); await release.wait;
    await route.fulfill({ json: candidate([{ inlineData: { mimeType: "audio/L16;rate=16000", data: Buffer.alloc(320_000).toString("base64") } }]) }).catch(() => {});
  });
  const aborted = page.waitForEvent("requestfailed", request => request.url().includes("-tts:"));
  await button(page, "Play").click(); await began.wait;
  const summary = page.getByText("Optional suggested answer · try improving yours first", { exact: true });
  await summary.click(); await aborted; release.release(); seen.setOverride();
  await summary.click(); await expect(button(page, "Play")).toBeEnabled();
  await button(page, "Play").click(); await expect(button(page, "Pause")).toBeVisible();
  expect(seen.requests.filter(r => r.path.includes("-tts:"))).toHaveLength(2);
  await seen.clean();
});

test("recording sends one WAV to Google and a retry reuses it without another recording", async ({ page, baseURL }) => {
  await toneMicrophone(page);
  const seen = await setup(page, baseURL!); await page.goto("/practice"); await activate(page);
  const checkpoint = seen.app.length;
  seen.setOverride(route => route.fulfill({ status: 503, json: {} }));
  await button(page, "Record answer").click(); await expect(button(page, "Stop recording")).toBeVisible();
  await shot(page, "byok-recording", button(page, "Stop recording"));
  await expect(button(page, "Remove key")).toBeDisabled();
  await page.waitForTimeout(350);
  await button(page, "Stop recording").click(); await expect(button(page, "Try transcription again")).toBeVisible();
  seen.setOverride(); await button(page, "Try transcription again").click();
  await expect(page.getByRole("textbox", { name: "Your transcript" })).toHaveValue(draft);
  await button(page, "Use in answer draft").click(); await expect(answer(page)).toHaveValue(draft);
  const audio = seen.requests.filter(r => r.method === "POST"); expect(audio).toHaveLength(2); expect(audio[0].body).toEqual(audio[1].body);
  expect(audio[0].body).toMatchObject({ generationConfig: { maxOutputTokens: 2048, thinkingConfig: { thinkingLevel: "MINIMAL" } } });
  expect(seen.app.slice(checkpoint)).toEqual([]); await seen.clean();
});

test("adding a key asks before checking it and does not discard a transcript on failure", async ({ page, baseURL }) => {
  await page.addInitScript(() => {
    for (const key of ["SpeechRecognition", "webkitSpeechRecognition"]) Object.defineProperty(window, key, { value: undefined, configurable: true });
  });
  const seen = await setup(page, baseURL!); await page.goto("/practice");
  await button(page, "Record answer").click(); await button(page, "Stop recording").click();
  const transcript = page.getByRole("textbox", { name: "Sample transcript" });
  await expect(transcript).toBeVisible();
  await openKey(page);
  page.once("dialog", dialog => dialog.dismiss()); await button(page, "Use key").click();
  expect(seen.requests).toHaveLength(0);
  seen.setOverride(route => route.fulfill({ status: 401, json: {} }));
  page.once("dialog", dialog => dialog.accept()); await button(page, "Use key").click();
  await expect(page.getByRole("dialog").getByRole("alert")).toHaveText("Google didn't accept this key.");
  await page.keyboard.press("Escape"); await expect(transcript).toBeVisible();
  seen.setOverride(); await openKey(page);
  page.once("dialog", dialog => dialog.accept()); await button(page, "Use key").click();
  await expect(button(page, "Remove key")).toBeVisible(); await expect(transcript).toHaveCount(0);
  await seen.clean();
});

test("cross-tab removal stops the microphone and discards a retained WAV", async ({ page, baseURL }) => {
  await toneMicrophone(page); const seen = await setup(page, baseURL!); await page.goto("/practice");
  const second = await page.context().newPage(); await setup(second, baseURL!);
  for (const retainAudio of [false, true]) {
    await activate(page, true); await second.goto("/practice");
    await button(page, "Record answer").click(); await expect(button(page, "Stop recording")).toBeVisible();
    if (retainAudio) {
      seen.setOverride(route => route.fulfill({ status: 503, json: {} }));
      await page.waitForTimeout(350); await button(page, "Stop recording").click();
      await expect(button(page, "Try transcription again")).toBeVisible();
    }
    const calls = seen.requests.length;
    await button(second, "Remove key").click(); await expect(button(page, "Use your Gemini key")).toBeVisible();
    await expect.poll(() => page.evaluate(() => Reflect.get(window, "testMicrophoneTrack")?.readyState)).toBe("ended");
    await expect(button(page, "Try transcription again")).toHaveCount(0);
    expect(seen.requests.length).toBe(calls); seen.setOverride(); await seen.clean();
  }
  await second.close();
});

test("a tab-only key survives navigation but only its history survives reload", async ({ page, baseURL }) => {
  const seen = await setup(page, baseURL!); await page.goto("/practice"); await activate(page);
  await answer(page).fill(draft); await button(page, "Get feedback").click();
  await expect(page.getByRole("heading", { name: "Structure outline" })).toBeVisible();
  const count = seen.app.length;
  const nav = page.getByRole("navigation", { name: "Main navigation" });
  await nav.getByRole("link", { name: "Mock interview" }).click();
  await expect(page).toHaveURL(/\/mock-interview$/);
  await nav.getByRole("link", { name: "Practice" }).click();
  await expect(button(page, "Remove key")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Structure outline" })).toBeVisible();
  expect(seen.app.length).toBe(count);
  await page.reload(); await expect(button(page, "Use your Gemini key")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Structure outline" })).toHaveCount(0);
  await activate(page);
  await expect(page.getByRole("heading", { name: "Structure outline" })).toBeVisible();
  expect(seen.requests.map(r => r.method)).toEqual(["GET", "POST", "GET"]);
  await seen.clean();
});

test("throwing storage preserves practice in memory and corrupt history is reported", async ({ page, baseURL }) => {
  await page.addInitScript(({ slot, history }) => {
    if (!sessionStorage.getItem(history)) sessionStorage.setItem(history, "not valid JSON");
    const { getItem, setItem } = Storage.prototype;
    Storage.prototype.getItem = function (k) { if (this === localStorage && k === slot) throw Error("unavailable"); return getItem.call(this, k); };
    Storage.prototype.setItem = function (k, v) { if (k === slot || k === history) throw Error("unavailable"); return setItem.call(this, k, v); };
  }, { slot: KEY_SLOT, history: HISTORY_SLOT });
  const seen = await setup(page, baseURL!); await page.goto("/practice"); await activate(page, true);
  await expect(page.getByText("Couldn't remember the key in this browser.")).toBeVisible();
  await expect(page.getByText(/Saved key-mode history couldn't be loaded/)).toBeVisible();
  await button(page, "Reload history").click();
  await expect(page.getByText(/Saved key-mode history couldn't be loaded/)).toHaveCount(0);
  await answer(page).fill(draft); await button(page, "Get feedback").click();
  await expect(page.getByText("This attempt can't be saved for a refresh.")).toBeVisible();
  await button(page, "Session recap").click(); await expect(page.getByRole("heading", { name: /Behavioral · 1 attempt/ })).toBeVisible(); await seen.clean();
});
