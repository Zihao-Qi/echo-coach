import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AUDIO_MAX_FRAMES, AUDIO_MAX_UPLOAD_BYTES, AudioValidationError,
  encodeCanonicalWav, validateCanonicalWav,
} from "../../src/domain/audio/canonical-wav";
import { readCanonicalAudio } from "../../src/infrastructure/http/read-audio";
import { acquireOrDispose, withDeadline } from "../audio/deadline";
import { BrowserMemorySampler, positiveProcessGrowth } from "../audio/process-memory";

function wav(frames = 16) {
  // Independent literal header: encoder and validator must not merely agree on a bug.
  const bytes = Buffer.alloc(44 + frames * 2);
  bytes.write("RIFF", 0); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write("WAVEfmt ", 8);
  bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(16000, 24); bytes.writeUInt32LE(32000, 28);
  bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34); bytes.write("data", 36);
  bytes.writeUInt32LE(frames * 2, 40);
  if (frames) bytes.writeInt16LE(1, 44); // The quietest nonzero PCM is valid.
  return bytes;
}
function request(bytes: Uint8Array, headers: Record<string, string> = {}) {
  return new Request("http://localhost/validate", {
    method: "POST", headers: { "content-type": "audio/wav", ...headers }, body: new Uint8Array(bytes),
  });
}

test("canonical PCM parser validates literal lengths, duration, and Buffer offsets", () => {
  const max = wav(AUDIO_MAX_FRAMES);
  assert.equal(validateCanonicalWav(max).durationSeconds, 120);
  assert.equal(validateCanonicalWav(wav(1)).frames, 1);
  const padded = Buffer.concat([Buffer.alloc(9), max, Buffer.alloc(3)]);
  assert.equal(validateCanonicalWav(padded.subarray(9, 9 + max.length)).frames, AUDIO_MAX_FRAMES);
  assert.throws(() => validateCanonicalWav(wav(AUDIO_MAX_FRAMES + 1)), AudioValidationError);
});

test("every canonical header field and actual payload length is enforced", () => {
  const fields = [0, 4, 8, 12, 16, 20, 22, 24, 28, 32, 34, 36, 40];
  for (const offset of fields) {
    const bytes = wav(); bytes[offset] ^= 1;
    assert.throws(() => validateCanonicalWav(bytes), AudioValidationError, `header byte ${offset}`);
  }
  for (const length of [0, 1, 43, 44, 45]) {
    assert.throws(() => validateCanonicalWav(wav().subarray(0, length)), AudioValidationError);
  }
  assert.throws(() => validateCanonicalWav(Buffer.concat([wav(), Buffer.of(1)])), AudioValidationError);
  assert.throws(() => validateCanonicalWav(wav(0)), AudioValidationError);
  const silence = wav(); silence.fill(0, 44);
  assert.throws(() => validateCanonicalWav(silence), /digital silence/);
});

test("PCM encoder has exact signed samples and rejects nonfinite/empty/oversized data", () => {
  const encoded = encodeCanonicalWav(Float32Array.of(-2, -1, -0.5, 0, 0.5, 1, 2));
  const view = new DataView(encoded.buffer);
  assert.deepEqual(Array.from({ length: 7 }, (_, i) => view.getInt16(44 + i * 2, true)), [-32768, -32768, -16384, 0, 16384, 32767, 32767]);
  assert.equal(view.getUint32(24, true), 16000);
  assert.equal(view.getUint32(40, true), 14);
  for (const samples of [new Float32Array(), new Float32Array(AUDIO_MAX_FRAMES + 1), Float32Array.of(NaN), Float32Array.of(Infinity), Float32Array.of(0)]) {
    assert.throws(() => encodeCanonicalWav(samples), AudioValidationError);
  }
});

test("bounded request reader accepts chunked audio, rejects MIME and declared oversize", async () => {
  assert.equal((await readCanonicalAudio(request(wav()))).info.frames, 16);
  await assert.rejects(readCanonicalAudio(request(wav(), { "content-type": "audio/webm" })), AudioValidationError);
  await assert.rejects(readCanonicalAudio(request(wav(), { "content-length": String(AUDIO_MAX_UPLOAD_BYTES + 1) })), AudioValidationError);
  const bytes = wav();
  const stream = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(bytes.subarray(0, 19)); c.enqueue(bytes.subarray(19)); c.close(); } });
  const chunked = new Request("http://localhost", { method: "POST", headers: { "content-type": "audio/wav" }, body: stream, duplex: "half" } as RequestInit);
  assert.equal((await readCanonicalAudio(chunked)).info.frames, 16);
});

test("stream limit is enforced without Content-Length and cancels unread input", async () => {
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    start(c) { c.enqueue(new Uint8Array(AUDIO_MAX_UPLOAD_BYTES)); c.enqueue(Uint8Array.of(1)); },
    cancel() { cancelled = true; },
  });
  const incoming = new Request("http://localhost", { method: "POST", headers: { "content-type": "audio/wav" }, body: stream, duplex: "half" } as RequestInit);
  await assert.rejects(readCanonicalAudio(incoming), /upload limit/);
  assert.equal(cancelled, true);
});

test("aborting a stalled read returns even if underlying cancellation never settles", async () => {
  const controller = new AbortController();
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    pull: () => new Promise(() => {}),
    cancel() { cancelled = true; return new Promise(() => {}); },
  });
  const incoming = new Request("http://localhost", { method: "POST", headers: { "content-type": "audio/wav" }, body: stream, signal: controller.signal, duplex: "half" } as RequestInit);
  const result = readCanonicalAudio(incoming);
  setTimeout(() => controller.abort(), 10);
  await assert.rejects(withDeadline("stalled read", 200, () => result), { name: "AbortError" });
  assert.equal(cancelled, true);
  assert.equal(incoming.body?.locked, false);
});

test("oversize rejection never waits for an uncooperative cancel promise", async () => {
  const stream = new ReadableStream<Uint8Array>({
    start(c) { c.enqueue(new Uint8Array(AUDIO_MAX_UPLOAD_BYTES + 1)); },
    cancel: () => new Promise(() => {}),
  });
  const incoming = new Request("http://localhost", { method: "POST", headers: { "content-type": "audio/wav" }, body: stream, duplex: "half" } as RequestInit);
  await assert.rejects(withDeadline("oversize read", 200, () => readCanonicalAudio(incoming)), /upload limit/);
  assert.equal(incoming.body?.locked, false);
});

test("memory gate cannot hide growth behind exited or shrinking Chrome helpers", () => {
  assert.equal(positiveProcessGrowth({ "1": 100, "2": 150 }, { "1": 140, "3": 50 }), 90);
  assert.equal(positiveProcessGrowth({ "1": 100 }, { "1": 80, "2": 20 }), 20);
});

test("a sampler stopped during startup cannot start a late background loop", async () => {
  const sampler = new BrowserMemorySampler(process.pid);
  let release!: () => void;
  Object.defineProperty(sampler, "sample", { value: () => new Promise<void>((resolve) => { release = resolve; }) });
  const starting = sampler.start();
  await sampler.stop();
  release();
  await assert.rejects(starting, /stopped during startup/);
  await assert.rejects(sampler.phase("late"), /stopped/);
});

test("late resources are disposed after their workflow deadline", async () => {
  let expired = false; let disposed = false;
  let release!: (value: number) => void;
  const pending = acquireOrDispose(() => new Promise<number>((resolve) => { release = resolve; }), () => expired, async () => { disposed = true; });
  try { await assert.rejects(withDeadline("late launch", 10, () => pending), /deadline/); }
  finally { expired = true; }
  release(42);
  await assert.rejects(pending, /workflow expiry/);
  assert.equal(disposed, true);
  assert.equal(await acquireOrDispose(async () => 7, () => false, async () => { throw new Error("must not dispose"); }), 7);
});

test("host deadlines reject never-settling operations but preserve values/errors", async () => {
  await assert.rejects(withDeadline("stalled browser", 10, () => new Promise(() => {})), /deadline/);
  assert.equal(await withDeadline("value", 200, async () => 42), 42);
  await assert.rejects(withDeadline("error", 200, async () => { throw new Error("original"); }), /original/);
});
