import { test } from "node:test";
import assert from "node:assert/strict";
import { GenerateContentResponse } from "@google/genai";
import { evaluationRequest, evaluationResult, responseText } from "../../src/application/workflows/gemini-evaluation";
import { evaluateAttempt } from "../../src/application/workflows/evaluate-attempt";
import { starterQuestions } from "../../src/content/questions/starter-bank";
import { DemoPracticeEvaluator } from "../../src/infrastructure/ai/demo/practice-evaluator";
import { GeminiPracticeEvaluator } from "../../src/infrastructure/ai/gemini/practice-evaluator";
import { decodeVoice } from "../../src/features/practice/key/voice-format";
import { createKeyHistory, HISTORY_SLOT } from "../../src/features/practice/key/history";
import { providerError } from "../../src/features/practice/key/transport";
import { activateKey, credential, initializeKey, KEY_SLOT, keySnapshot, removeKey } from "../../src/features/practice/key/key-store";

const answer = "The hash table uses more space and usually offers constant-time lookup.";
const question = starterQuestions.find(q => q.track === "swe")!;
const earlier = { id: "6873a9a0-b59e-4215-89a8-6e1e5225a931", questionId: question.id, answer };

test("SDK and REST use the same question, schema, instruction, generation settings and parser", async () => {
  const expected = evaluationRequest(question, answer, earlier);
  const { generationConfig, systemInstruction, contents } = expected;
  const fixture = await new DemoPracticeEvaluator().evaluate(question, answer);
  const body = Object.assign(new GenerateContentResponse(), {
    candidates: [{ finishReason: "STOP", content: { parts: [{ thought: true, text: "not feedback" }, { text: JSON.stringify(fixture) }] } }],
    usageMetadata: { promptTokenCount: 13, candidatesTokenCount: 9, thoughtsTokenCount: 8, totalTokenCount: 30 },
  });
  const server = new GeminiPracticeEvaluator("test-model", "unused", async request => {
    assert.deepEqual(request.config, { ...generationConfig, systemInstruction: systemInstruction.parts[0].text });
    assert.equal(request.contents, contents[0].parts[0].text);
    assert.equal("$schema" in generationConfig.responseJsonSchema, false);
    return body;
  });
  const browser = evaluationResult(JSON.parse(JSON.stringify(body)));
  assert.deepEqual(await server.evaluate(question, answer, earlier), browser.evaluation);
  assert.deepEqual(server.usage, browser.usage);
});

test("REST ignores thought text and rejects blocked, missing, incomplete and malformed replies", () => {
  assert.equal(responseText({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: "Think", thought: true }, { text: "Your " }, { text: "words" }] } }] }), "Your words");
  assert.equal(responseText({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: "" }] } }] }), "");
  assert.equal(responseText({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: "ignore", thought: true }] } }] }, true), "");
  assert.equal(responseText({ candidates: [{ finishReason: "STOP" }] }, true), "");
  for (const body of [{}, { promptFeedback: { blockReason: "SAFETY" } }]) assert.throws(() => responseText(body), /didn't return a usable answer/);
  assert.throws(() => responseText({ candidates: [{ finishReason: "MAX_TOKENS" }] }), /couldn't be used/);
  assert.throws(() => evaluationResult({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: "{}" }] } }] }), /couldn't be used/);
});

test("the shared guard rejects invented quotes and neutralizes identical retries and behavioral rewrites", async () => {
  const behavioral = starterQuestions.find(q => q.track === "behavioral")!;
  const fixture = await new DemoPracticeEvaluator().evaluate(behavioral, answer);
  fixture.comparison = { summary: "Improved", changes: [], nextFocus: "More detail" };
  fixture.suggestedAnswer = "Invented story";
  const parsed = evaluationResult({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify(fixture) }] } }] });
  const prior = { ...earlier, questionId: behavioral.id };
  const evaluate = () => evaluateAttempt(behavioral, { questionId: behavioral.id, answer, previousAttemptId: prior.id }, { mode: "gemini", model: "test", async evaluate() { return parsed.evaluation; } }, prior);
  const attempt = await evaluate();
  assert.equal(attempt.evaluation.comparison, null);
  assert.equal(attempt.evaluation.criteria!.correctness.status, "not-assessable");
  assert.doesNotMatch(attempt.evaluation.suggestedAnswer, /Invented story/);
  parsed.evaluation.strengths.push({ observation: "Fake", excerpt: "never said this" });
  await assert.rejects(evaluate(), /not present/);
});

test("raw PCM wraps as WAV, and WAV parsing respects padded RIFF chunks and data bounds", async () => {
  const pcm = new Uint8Array(32000).fill(2);
  const wrapped = decodeVoice(pcm, "audio/L16;codec=pcm;rate=16000");
  const raw = new Uint8Array(await wrapped.blob.arrayBuffer());
  assert.equal(wrapped.duration, 1);
  assert.equal(new TextDecoder().decode(raw.subarray(0, 4)), "RIFF");
  const withJunk = new Uint8Array(raw.length + 10);
  withJunk.set(raw.subarray(0, 12));
  withJunk.set([74, 85, 78, 75, 1, 0, 0, 0, 17, 0], 12);
  withJunk.set(raw.subarray(12), 22);
  new DataView(withJunk.buffer).setUint32(4, withJunk.length - 8, true);
  const wav = decodeVoice(withJunk, "audio/wav");
  assert.deepEqual(new Uint8Array(await wav.blob.arrayBuffer()), withJunk);
  for (const [bytes, mime] of [[new Uint8Array(0), "audio/L16;rate=16000"], [new Uint8Array(3), "audio/L16;rate=16000"], [pcm, "audio/L16;rate=8000"], [pcm, "audio/L16;rate=48001"], [pcm, "audio/L16;rate=16000;channels=2"], [pcm, "audio/ogg"], [raw.slice(0, -1), "audio/wav"], [raw, "audio/ogg"]] as const) {
    assert.throws(() => decodeVoice(bytes, mime), /Unsupported/);
  }
  for (const [offset, value] of [[20, 3], [22, 2], [34, 32], [40, 65535]]) {
    const wrong = raw.slice(); new DataView(wrong.buffer).setUint16(offset, value, true);
    assert.throws(() => decodeVoice(wrong, "audio/wav"), /Unsupported/);
  }
});

test("provider error copy never echoes an error body", () => {
  for (const [http, status, reason, message] of [
    [401, "", "", /didn't accept/], [403, "", "API_KEY_HTTP_REFERRER_BLOCKED", /restrictions block/],
    [404, "", "", /can't use gemini-3.8-flash/], [400, "FAILED_PRECONDITION", "", /refused/], [500, "", "", /temporarily unavailable/],
    [400, "RESOURCE_EXHAUSTED", "", /quota/],
  ] as const) {
    const { message: copy } = providerError(http, { error: { status, details: [{ reason }] } }, "gemini-3.8-flash");
    assert.match(copy, message);
  }
});

test("key-mode history ignores corrupt data once and keeps unsaved attempts in memory", async () => {
  const entries = new Map([[HISTORY_SLOT, "malformed JSON"], ["sample-history", "untouched"]]);
  let failWrite = true;
  const store = () => ({ getItem: (k: string) => entries.get(k) ?? null,
    setItem: (k: string, v: string) => { if (failWrite) throw new Error("storage full"); entries.set(k, v); } });
  const local = createKeyHistory(store);
  assert.deepEqual(local.localHistory(), []);
  assert.match(local.historyNotice(), /couldn't be loaded/);
  assert.equal(local.historyNotice(), "");
  const demo = new DemoPracticeEvaluator();
  const attempt = await evaluateAttempt(question, { questionId: question.id, answer }, { mode: "gemini", model: "test", thinkingLevel: "low", evaluate: demo.evaluate.bind(demo) });
  local.saveAttempt(attempt);
  assert.equal(local.localHistory()[0].id, attempt.id);
  assert.match(local.historyNotice(), /can't be saved/);
  failWrite = false;
  local.saveAttempt({ ...attempt, id: crypto.randomUUID() });
  assert.deepEqual(createKeyHistory(store).localHistory().map(item => item.id), local.localHistory().map(item => item.id));
  assert.equal(entries.get("sample-history"), "untouched");
});

test("the browser key is memory-only by default, and storage events cannot add it", t => {
  const storage = new Map<string, string>();
  const events = new EventTarget();
  const previous = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage: { getItem: (k: string) => storage.get(k), setItem: (k: string, v: string) => storage.set(k, v), removeItem: (k: string) => storage.delete(k) }, addEventListener: events.addEventListener.bind(events) } });
  t.after(() => { if (previous) Object.defineProperty(globalThis, "window", previous); else Reflect.deleteProperty(globalThis, "window"); });
  const event = (value: string | null) => events.dispatchEvent(Object.assign(new Event("storage"), { key: KEY_SLOT, newValue: value }));
  initializeKey();
  assert.equal(keySnapshot(), false);
  event("synthetic-key-other-tab");
  assert.equal(keySnapshot(), false);
  activateKey("synthetic-tab-only", false);
  assert.equal(storage.has(KEY_SLOT), false);
  const original = credential()!;
  activateKey("synthetic-remembered", true);
  assert.ok(original.signal.aborted);
  assert.equal(storage.get(KEY_SLOT), "synthetic-remembered");
  removeKey();
  assert.equal(storage.has(KEY_SLOT), false);
  activateKey("synthetic-tab-only", false);
  const removed = credential()!;
  event(null);
  assert.equal(keySnapshot(), false);
  assert.ok(removed.signal.aborted);
});
