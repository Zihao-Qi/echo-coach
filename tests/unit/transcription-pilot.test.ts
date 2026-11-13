import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm, unlink, symlink, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { encodeCanonicalWav, validateCanonicalWav } from "../../src/domain/audio/canonical-wav";
import { SCRIPTS, CRITICAL, seededNoise, addNoiseAtSnr, pcmSamples, padLongClip } from "../../benchmarks/transcription/fixtures";
import { DEFAULT_ALIASES, FIXTURE_IDS, MAX_SECONDS, MODELS, canonicalJson, manifestSchema, policyHash, sha256, callPlan, estimateNanoUsd, reservationNanoUsd } from "../../benchmarks/transcription/spec";
import { buildInteractionRequest, inspectInteraction, PilotContractError } from "../../benchmarks/transcription/protocol";
import { lexicalTokens, normalizedTokens, wordErrors, scoreTranscript, pooledCleanWer } from "../../benchmarks/transcription/scoring";
import { loadCorpus } from "../../benchmarks/transcription/corpus";
const exec = promisify(execFile);

function makeCorpus() {
  const audio = new Map<string, Uint8Array>();
  const fixtures = FIXTURE_IDS.map((id) => {
    const frames = id === "STT-06" ? 1920000 : 16000;
    const bytes = encodeCanonicalWav(new Float32Array(frames).fill(0.25)); audio.set(id, bytes);
    const reference = id === "STT-04" ? "" : id === "STT-05" ? SCRIPTS["STT-01"] : SCRIPTS[id];
    return { id, file: `${id}.wav`, sha256: sha256(bytes), frames, sourceText: reference, reference,
      criticalPhrases: [...CRITICAL[id]], provenance: { kind: "offline-tts" as const,
        ...(id === "STT-05" ? { sourceSha256: sha256(audio.get("STT-01")!) } : {}) },
      ...(id === "STT-06" ? { tailPhrase: "My final check was a failed write." } : {}),
    };
  });
  const manifest = manifestSchema.parse({ version: "transcription-pilot-v1", createdAt: "2026-10-30T00:00:00Z", policySha256: policyHash(),
    voice: { name: "test-only", wordsPerMinute: 160, source: "installed macOS say; no downloads" }, aliases: DEFAULT_ALIASES,
    humanAudit: { status: "pending", reviewer: null, reviewedAt: null, changes: [] }, fixtures });
  return { manifest, audio };
}
async function writeCorpus(dir: string, corpus: ReturnType<typeof makeCorpus>) {
  for (const fixture of corpus.manifest.fixtures) await writeFile(join(dir, fixture.file), corpus.audio.get(fixture.id)!);
  const file = join(dir, "manifest.json"); await writeFile(file, JSON.stringify(corpus.manifest)); return file;
}

test("canonical manifest hash is stable, rejects invalid JSON values, and reflects reference edits", () => {
  assert.equal(canonicalJson({ b: [2, 1], a: { z: true, omitted: undefined } }), canonicalJson({ a: { z: true }, b: [2, 1] }));
  assert.throws(() => canonicalJson(NaN));
  const { manifest } = makeCorpus(); const before = sha256(canonicalJson(manifest));
  manifest.fixtures[0].reference += " audited correction";
  assert.notEqual(sha256(canonicalJson(manifest)), before);
  assert.throws(() => manifestSchema.parse({ ...manifest, policySha256: "0".repeat(64) }));
  assert.throws(() => manifestSchema.parse({ ...manifest, humanAudit: { ...manifest.humanAudit, status: "verified" } }));
});

test("manifest fixes case identity/order/ceilings and generates exactly twelve predeclared cells", () => {
  const { manifest } = makeCorpus(); const plan = callPlan(manifest);
  assert.equal(plan.length, 12);
  assert.deepEqual(plan.slice(0, 4).map((x) => x.model), [MODELS[0], MODELS[1], MODELS[1], MODELS[0]]);
  assert.equal(plan[0].fixture.sha256, plan[1].fixture.sha256);
  for (const changed of [
    { ...manifest.fixtures[0], file: "../.env.local" },
    { ...manifest.fixtures[0], frames: MAX_SECONDS[0] * 16000 + 1 },
    { ...manifest.fixtures[0], id: "STT-02" },
  ]) assert.throws(() => manifestSchema.parse({ ...manifest, fixtures: [changed, ...manifest.fixtures.slice(1)] }));
});

test("cost reservations use full metadata output maximum and account for thinking once", () => {
  assert.equal(reservationNanoUsd(MODELS[0], 1920000), 401264000);
  assert.equal(reservationNanoUsd(MODELS[1], 1920000), 249408000);
  assert.equal(MAX_SECONDS.reduce((sum, seconds) => sum + estimateNanoUsd(MODELS[0], seconds * 16000, 2048), 0), 170494000);
  assert.equal(MAX_SECONDS.reduce((sum, seconds) => sum + estimateNanoUsd(MODELS[1], seconds * 16000, 2048), 0), 55848000);
  assert.throws(() => reservationNanoUsd(MODELS[0], 1920001));
});

test("seeded noise, paired SNR, and long padding preserve actual bounded PCM", () => {
  assert.deepEqual(seededNoise(100, 123, 0.01), seededNoise(100, 123, 0.01));
  const clean = Float32Array.from({ length: 16000 }, (_, i) => 0.2 * Math.sin(2 * Math.PI * 440 * i / 16000));
  const mixed = addNoiseAtSnr(clean, 5005, 10); const output = pcmSamples(mixed.bytes);
  let signal = 0; let noise = 0;
  for (let i = 0; i < output.length; i++) { signal += (clean[i] * mixed.scale) ** 2; noise += (output[i] - clean[i] * mixed.scale) ** 2; }
  assert.ok(Math.abs(10 * Math.log10(signal / noise) - 10) < 0.02);
  const padded = padLongClip(clean);
  assert.equal(validateCanonicalWav(padded).frames, 1920000);
  assert.equal(pcmSamples(padded)[100], pcmSamples(encodeCanonicalWav(clean))[100]);
  assert.throws(() => padLongClip(new Float32Array(1920001)), /never truncate/);
  assert.throws(() => padLongClip(new Float32Array(1920000).fill(0.1)), /never truncate/);
  assert.throws(() => validateCanonicalWav(new Uint8Array(44)));
});

function response(model = MODELS[1] as string, output = 5, thoughts = 3) {
  return { model, status: "completed", usage: { total_input_tokens: 10, total_output_tokens: output, total_thought_tokens: thoughts, total_tokens: 10 + output + thoughts },
    steps: [{ type: "thought", content: [{ type: "text", text: "PRIVATE THOUGHT" }] }, { type: "model_output", content: [{ type: "text", text: "Actual transcript" }] }] };
}
test("request descriptors use fixed inline/stateless/verbatim/LOW policy without keys or retries", () => {
  const audio = encodeCanonicalWav(Float32Array.of(0.1));
  for (const model of MODELS) {
    const r = buildInteractionRequest(model, audio);
    assert.equal(r.url, "https://generativelanguage.googleapis.com/v1beta/interactions");
    assert.equal(r.automaticRetries, 0); assert.equal(r.redirect, "error"); assert.equal(r.body.store, false);
    assert.equal(r.body.background, false); assert.equal(r.body.stream, false); assert.equal(r.deadlineMs, 45000);
    assert.deepEqual(Buffer.from(r.body.input[0].data, "base64"), Buffer.from(audio));
    assert.equal(r.body.generation_config.max_output_tokens, 2048);
    assert.deepEqual(r.body.generation_config, model === MODELS[0]
      ? { max_output_tokens: 2048, transcription_config: { language_codes: ["en-US"], mode: { type: "verbatim" } } }
      : { max_output_tokens: 2048, thinking_level: "low", thinking_summaries: "none" });
    assert.equal("tools" in r.body, false); assert.equal("headers" in r, false);
  }
});
test("current steps parsing excludes thoughts and prices generated thought/output tokens exactly once", () => {
  const r = inspectInteraction(MODELS[1], response(), 16000);
  assert.equal(r.status, "completed");
  if (r.status === "completed") { assert.equal(r.text, "Actual transcript"); assert.equal(r.costNanoUsd, 10 * 750 + 8 * 3750); }
  assert.doesNotMatch(JSON.stringify(r), /PRIVATE/);
  const empty = response(MODELS[0], 0, 0); empty.steps = [];
  assert.equal(inspectInteraction(MODELS[0], empty, 16000).status, "completed");
});
test("contract/usage/cap failures are classified without raw provider errors or retries", () => {
  const fail = (raw: unknown, code: string) => assert.throws(() => inspectInteraction(MODELS[1], raw, 16000), (e: unknown) => e instanceof PilotContractError && e.scope === "batch" && e.code === code);
  fail({ ...response(), model: "other-model" }, "model-or-envelope");
  fail({ ...response(), usage: undefined }, "missing-or-invalid-usage");
  fail(response(MODELS[1], 1500, 1000), "output-cap-overrun");
  fail({ ...response(), steps: [{ type: "function_call", content: "PRIVATE RAW ERROR" }] }, "unexpected-step");
  const incomplete = inspectInteraction(MODELS[1], { ...response(), status: "incomplete" }, 16000);
  assert.equal(incomplete.status, "candidate-failed");
  const noThinking = response(); delete (noThinking.usage as Partial<typeof noThinking.usage>).total_thought_tokens;
  fail(noThinking, "missing-thinking-usage");
});

test("WER keeps edit counts, zero-reference noise has no fake WER, and aliases are explicit", () => {
  assert.deepEqual(wordErrors(["a", "b", "c"], ["a", "x", "c", "d"]), { substitutions: 1, deletions: 0, insertions: 1, errors: 2, referenceWords: 3, hypothesisWords: 4, wer: 2 / 3 });
  assert.equal(wordErrors(["a", "b"], ["a"]).deletions, 1);
  assert.equal(wordErrors([], ["invented"]).wer, null);
  assert.deepEqual(normalizedTokens("H T T P four zero nine", DEFAULT_ALIASES), ["http", "409"]);
  assert.deepEqual(lexicalTokens("Um, I did not."), ["um", "i", "did", "not"]);
  const { manifest } = makeCorpus(); const f = manifest.fixtures[0];
  const bad = scoreTranscript(f, f.reference.replace("not ", ""), manifest.aliases);
  assert.ok(bad.missingCriticalPhrases.includes("did not cache errors")); assert.equal(bad.manualReview, "pending");
  assert.equal(scoreTranscript(manifest.fixtures[3], "thanks for watching", manifest.aliases).hallucinatedWords, 3);
  assert.equal(scoreTranscript(manifest.fixtures[3], "[noise]", manifest.aliases).hallucinatedWords, 0);
  const rows = manifest.fixtures.map((fixture) => scoreTranscript(fixture, fixture.reference, manifest.aliases));
  assert.equal(pooledCleanWer(rows).completeCoverage, true);
  assert.equal(pooledCleanWer(rows.slice(0, 1)).completeCoverage, false);
  assert.throws(() => pooledCleanWer([...rows, rows[0]]), /one model/);
});

test("corpus loading rejects byte tampering and symlink fixtures before any request exists", async () => {
  const dir = await mkdtemp(join(tmpdir(), "echo-pilot-corpus-"));
  try {
    const corpus = makeCorpus(); const manifestPath = await writeCorpus(dir, corpus);
    assert.equal((await loadCorpus(manifestPath)).audio.size, 6);
    const file = join(dir, "STT-01.wav"); const changed = new Uint8Array(corpus.audio.get("STT-01")!); changed[44] ^= 1;
    await writeFile(file, changed); await assert.rejects(loadCorpus(manifestPath), /bytes changed/);
    await unlink(file); await symlink(join(dir, "STT-02.wav"), file);
    await assert.rejects(loadCorpus(manifestPath), /regular WAV/);
    await assert.rejects(loadCorpus(join(dir, ".env.local")), /explicit manifest.json/);
    await writeFile(manifestPath, "PRIVATE_SENTINEL_NOT_VALID_JSON");
    await assert.rejects(loadCorpus(manifestPath), (e: unknown) => {
      assert.ok(e instanceof Error); assert.match(e.message, /Invalid manifest JSON/); assert.doesNotMatch(e.message, /PRIVATE_SENTINEL/); return true;
    });
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("CLI dry run stays offline with a key present and leaves audit untouched; --execute is rejected", async () => {
  const dir = await mkdtemp(join(tmpdir(), "echo-pilot-cli-"));
  try {
    const manifestPath = await writeCorpus(dir, makeCorpus());
    const before = await readFile(manifestPath, "utf8"); const marker = join(dir, "unexpected-fetch"); const blocker = join(dir, "no-network.mjs");
    await writeFile(blocker, `import {writeFileSync} from 'node:fs';globalThis.fetch=()=>{writeFileSync(${JSON.stringify(marker)},'called');throw new Error('OFFLINE TEST');};`);
    const args = ["--import", blocker, resolve("node_modules/tsx/dist/cli.mjs"), "scripts/benchmark-transcription.ts"];
    const options = { timeout: 15000, env: { ...process.env, GEMINI_API_KEY: "synthetic-key-do-not-use" } };
    const dry = await exec(process.execPath, [...args, `--manifest=${manifestPath}`], options);
    const report = JSON.parse(dry.stdout);
    assert.equal(report.providerCalls, 0); assert.equal(report.executionImplemented, false); assert.equal(report.humanAudit.status, "pending");
    assert.equal(report.proposedCalls, 12); assert.equal(await readFile(manifestPath, "utf8"), before);
    await assert.rejects(access(marker));
    const saved = await readFile(`${manifestPath}.dry-run.json`, "utf8");
    assert.doesNotMatch(saved, /synthetic-key|PRIVATE THOUGHT|BASE64/);
    await assert.rejects(exec(process.execPath, [...args, "--execute", `--manifest=${manifestPath}`], options), (e: unknown) => {
      assert.match((e as { stderr: string }).stderr, /not implemented/); return true;
    });
    await assert.rejects(access(marker));
  } finally { await rm(dir, { recursive: true, force: true }); }
});
