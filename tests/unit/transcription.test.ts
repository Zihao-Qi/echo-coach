import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { encodeCanonicalWav } from "../../src/domain/audio/canonical-wav";
import { TranscriptionReplayCache, TranscriptionError } from "../../src/application/workflows/transcribe-audio";
import type { AudioTranscriber, AudioTranscription } from "../../src/application/ports/audio-transcriber";
import { POST } from "../../src/app/api/practice/transcriptions/route";
import { newDemoSession } from "../../src/infrastructure/auth/practice-access";
import { transcriptionCapability } from "../../src/infrastructure/config/transcription-runtime";
import { proxy } from "../../src/proxy";
import { DemoAudioTranscriber } from "../../src/infrastructure/ai/demo/audio-transcriber";

const audio = () => encodeCanonicalWav(Float32Array.of(0.25, -0.25));
const result: AudioTranscription = { text: "A synthetic transcript only.", mode: "demo", model: "test" };
const failure = (status: number, code: string) => (error: unknown) => error instanceof TranscriptionError && error.status === status && error.code === code;

function setupEnv() {
  const values = { NODE_ENV: "development", USE_MOCK: "true", PRACTICE_AUTH_MODE: "demo", PRACTICE_STORAGE: "memory", AUTH_URL: "http://localhost:3000", PRACTICE_TRANSCRIPTION_MODE: "demo", ALLOW_LOCAL_TRANSCRIPTION: "false", NEXT_PUBLIC_USE_MOCK: "false", ALLOW_LOCAL_GEMINI: "false" };
  const before = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  const oldCache = globalThis.__echoTranscriptionReplay;
  Object.assign(process.env, values);
  globalThis.__echoTranscriptionReplay = new TranscriptionReplayCache();
  return () => {
    globalThis.__echoTranscriptionReplay = oldCache;
    for (const [key, value] of Object.entries(before)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  };
}

test("transcription receipts replay without duplicate work, isolate owners and audio, and cannot be mutated", async () => {
  const cache = new TranscriptionReplayCache();
  let calls = 0;
  const transcriber: AudioTranscriber = { async transcribe() { calls++; return result; } };
  const id = randomUUID();
  const first = await cache.run("A", { id, intent: "start" }, audio(), transcriber);
  first.text = "corrupted client result";
  assert.equal((await cache.run("A", { id, intent: "recover" }, audio(), transcriber)).text, result.text);
  await cache.run("A", { id, intent: "start" }, audio(), transcriber);
  await assert.rejects(cache.run("B", { id, intent: "recover" }, audio(), transcriber), failure(410, "expired"));
  await assert.rejects(cache.run("A", { id, intent: "start" }, encodeCanonicalWav(Float32Array.of(0.5)), transcriber), failure(409, "conflict"));
  assert.equal(calls, 1);
});

test("running duplicate conflicts, denial does not consume a receipt, and expiry recovery never generates", async () => {
  let now = 0; let calls = 0; let resolve!: (value: AudioTranscription) => void;
  const cache = new TranscriptionReplayCache({ now: () => now, capacity: 1 });
  const transcriber: AudioTranscriber = { transcribe() { calls++; return new Promise((done) => { resolve = done; }); } };
  const id = randomUUID();
  const pending = cache.run("A", { id, intent: "start" }, audio(), transcriber);
  await Promise.resolve();
  await assert.rejects(cache.run("A", { id, intent: "recover" }, audio(), transcriber), failure(409, "running"));
  const secondId = randomUUID();
  await assert.rejects(cache.run("B", { id: secondId, intent: "start" }, audio(), transcriber), failure(429, "limited"));
  resolve(result); await pending;
  now = 10 * 60 * 1000 + 1;
  await assert.rejects(cache.run("A", { id, intent: "recover" }, audio(), transcriber), failure(410, "expired"));
  await cache.run("B", { id: secondId, intent: "start" }, audio(), { async transcribe() { calls++; return result; } });
  assert.equal(calls, 2);
  await assert.rejects(new TranscriptionReplayCache().run("A", { id, intent: "recover" }, audio(), transcriber), failure(410, "expired"));
  assert.equal(calls, 2);
});

test("failed or timed-out requests remain terminal and do not reveal raw adapter errors", async () => {
  const cache = new TranscriptionReplayCache({ deadlineMs: 10 });
  let signal: AbortSignal | undefined; let calls = 0;
  const transcriber: AudioTranscriber = { transcribe(_bytes, deadline) { signal = deadline; calls++; return new Promise(() => {}); } };
  const id = randomUUID();
  await assert.rejects(cache.run("A", { id, intent: "start" }, audio(), transcriber), failure(502, "ended"));
  assert.equal(signal?.aborted, true);
  await assert.rejects(cache.run("A", { id, intent: "recover" }, audio(), transcriber), failure(502, "ended"));
  assert.equal(calls, 1);
  await assert.rejects(cache.run("A", { id: randomUUID(), intent: "start" }, audio(), { async transcribe() { throw new Error("PRIVATE RAW ADAPTER ERROR"); } }), (error: unknown) => {
    assert.ok(error instanceof TranscriptionError); assert.doesNotMatch(error.message, /PRIVATE/); return true;
  });
});

test("transcriber output is bounded but empty recognition remains editable", async () => {
  const cache = new TranscriptionReplayCache();
  const run = (text: string) => cache.run("A", { id: randomUUID(), intent: "start" }, audio(), { async transcribe() { return { ...result, text }; } });
  assert.equal((await run("")).text, "");
  await assert.rejects(run("x".repeat(10001)), failure(502, "ended"));
});

test("all transcription/evaluation mode combinations fail closed for real STT and protect legacy routes", () => {
  const restore = setupEnv();
  try {
    for (const mock of ["true", "false"]) for (const mode of ["demo", "gemini"]) {
      Object.assign(process.env, { USE_MOCK: mock, PRACTICE_TRANSCRIPTION_MODE: mode, ALLOW_LOCAL_TRANSCRIPTION: mode === "gemini" ? "true" : "false" });
      const capability = transcriptionCapability();
      assert.equal(capability.available, mode === "demo");
      assert.equal(proxy().status, mode === "gemini" ? 410 : 200); // Legacy NEXT_PUBLIC_USE_MOCK=false.
    }
    for (const [mode, optIn] of [["invalid", "false"], ["demo", "true"], ["", "false"], ["demo", "invalid"]]) {
      Object.assign(process.env, { PRACTICE_TRANSCRIPTION_MODE: mode, ALLOW_LOCAL_TRANSCRIPTION: optIn });
      assert.equal(transcriptionCapability().available, false);
      assert.equal(proxy().status, 410);
    }
    for (const nodeEnv of ["development", "production"]) {
      Object.assign(process.env, { NODE_ENV: nodeEnv, PRACTICE_TRANSCRIPTION_MODE: "gemini", ALLOW_LOCAL_TRANSCRIPTION: "true" });
      assert.equal(transcriptionCapability().available, false);
    }
  } finally { restore(); }
});

test("client abort after admission does not cancel server work or regenerate on recovery", async () => {
  const restore = setupEnv();
  const original = DemoAudioTranscriber.prototype.transcribe;
  let release!: (value: AudioTranscription) => void; let began!: () => void; let calls = 0;
  const admitted = new Promise<void>((resolve) => { began = resolve; });
  DemoAudioTranscriber.prototype.transcribe = () => { calls++; began(); return new Promise((resolve) => { release = resolve; }); };
  const id = randomUUID(); const session = newDemoSession(); const controller = new AbortController();
  const request = (intent: string, signal?: AbortSignal) => new Request("http://localhost:3000/api/practice/transcriptions", {
    method: "POST", headers: { Cookie: `echo-practice-demo=${session}`, Origin: "http://localhost:3000", "Content-Type": "audio/wav", "Idempotency-Key": id, "X-Transcription-Intent": intent },
    body: new Uint8Array(audio()), signal,
  });
  try {
    const pending = POST(request("start", controller.signal));
    await admitted; controller.abort(); release(result);
    assert.equal((await pending).status, 200);
    assert.equal((await POST(request("recover"))).status, 200);
    assert.equal(calls, 1);
  } finally { DemoAudioTranscriber.prototype.transcribe = original; restore(); }
});

test("audio API requires session/canonical Origin and never calls a model", async () => {
  const restore = setupEnv();
  const oldFetch = globalThis.fetch;
  let network = 0;
  globalThis.fetch = async () => { network++; throw new Error("No external network allowed"); };
  const session = newDemoSession();
  function send(options: { id?: string; intent?: string; cookie?: string; origin?: string | null; bytes?: Uint8Array; crossSite?: boolean } = {}) {
    return POST(new Request("http://localhost:3000/api/practice/transcriptions", {
      method: "POST", headers: {
        ...(options.cookie === "" ? {} : { Cookie: `echo-practice-demo=${options.cookie || session}` }),
        ...(options.origin === null ? {} : { Origin: options.origin || "http://localhost:3000" }),
        "Content-Type": "audio/wav", "Idempotency-Key": options.id || randomUUID(), "X-Transcription-Intent": options.intent || "start",
        ...(options.crossSite ? { "Sec-Fetch-Site": "cross-site" } : {}),
      }, body: new Uint8Array(options.bytes || audio()),
    }));
  }
  try {
    assert.equal((await send({ cookie: "" })).status, 401);
    assert.equal((await send({ origin: null })).status, 403);
    assert.equal((await send({ origin: "https://attacker.example" })).status, 403);
    assert.equal((await send({ crossSite: true })).status, 403);
    assert.equal((await send({ id: "invalid" })).status, 400);
    assert.equal((await send({ intent: "retry" })).status, 400);
    assert.equal((await send({ bytes: Uint8Array.of(1, 2, 3) })).status, 400);
    const id = randomUUID();
    const first = await send({ id });
    assert.equal(first.status, 200);
    const body = await first.json(); assert.equal(body.transcription.mode, "demo");
    assert.equal(first.headers.get("cache-control"), "private, no-store");
    assert.deepEqual(await (await send({ id, intent: "recover" })).json(), body);
    assert.equal((await send({ id, intent: "recover", cookie: newDemoSession() })).status, 410);
    process.env.PRACTICE_TRANSCRIPTION_MODE = "gemini"; process.env.ALLOW_LOCAL_TRANSCRIPTION = "true";
    assert.equal((await send()).status, 503);
    assert.equal(network, 0);
  } finally { globalThis.fetch = oldFetch; restore(); }
});
