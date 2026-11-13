import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { encodeCanonicalWav, validateCanonicalWav } from "../src/domain/audio/canonical-wav";
import { SCRIPTS, CRITICAL, addNoiseAtSnr, padLongClip, pcmSamples, seededNoise } from "../benchmarks/transcription/fixtures";
import { DEFAULT_ALIASES, FIXTURE_IDS, MAX_SECONDS, canonicalJson, manifestSchema, policyHash, sha256, type PilotFixture } from "../benchmarks/transcription/spec";

const exec = promisify(execFile);
async function main() {
  if (process.argv.length !== 2) throw new Error("Preparation accepts no flags. It never executes provider requests.");
  if (process.platform !== "darwin") throw new Error("Offline fixture preparation currently requires installed macOS say.");
  const { stdout: voices } = await exec("/usr/bin/say", ["-v", "?"], { timeout: 10000 });
  if (!/^Samantha\s+en_US\s/m.test(voices)) throw new Error("Samantha must already be available; no voice downloads are allowed.");
  const root = resolve("benchmark-results"); await mkdir(root, { recursive: true });
  const output = await mkdtemp(join(root, "transcription-pilot-"));
  const temporary = await mkdtemp(join(output, ".source-"));
  const fixtures: PilotFixture[] = [];
  const speech = new Map<string, Uint8Array>();
  try {
    for (const id of FIXTURE_IDS) {
      const index = FIXTURE_IDS.indexOf(id);
      let bytes: Uint8Array; let sourceText = ""; let sourceFrames: number | undefined;
      let provenance: PilotFixture["provenance"];
      if (id === "STT-04") {
        bytes = encodeCanonicalWav(seededNoise(5 * 16000, 4004, 0.01));
        provenance = { kind: "seeded-noise", noiseSeed: 4004 };
      } else if (id === "STT-05") {
        sourceText = SCRIPTS["STT-01"];
        const clean = speech.get("STT-01")!;
        const mixed = addNoiseAtSnr(pcmSamples(clean), 5005, 10);
        bytes = mixed.bytes;
        provenance = { kind: "derived-noisy-speech", sourceSha256: sha256(clean), noiseSeed: 5005, snrDb: 10, scale: mixed.scale };
      } else {
        sourceText = SCRIPTS[id];
        const textFile = join(temporary, `${id}.txt`); const aiff = join(temporary, `${id}.aiff`); const pcm = join(temporary, `${id}.pcm`);
        await writeFile(textFile, sourceText, { mode: 0o600 });
        // Output to a file, never the speakers; only a listed, local OS voice.
        await exec("/usr/bin/say", ["-v", "Samantha", "-r", "160", "-f", textFile, "-o", aiff], { timeout: 45000 });
        await exec("ffmpeg", ["-nostdin", "-v", "error", "-protocol_whitelist", "file,pipe", "-i", aiff,
          "-map_metadata", "-1", "-f", "f32le", "-ac", "1", "-ar", "16000", "-y", pcm], { timeout: 45000, maxBuffer: 1000000 });
        const size = (await stat(pcm)).size;
        if (!size || size % 4 || size > MAX_SECONDS[index] * 16000 * 4) throw new Error(`${id} speech exceeds its ceiling; do not truncate words.`);
        const raw = await readFile(pcm); const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
        const samples = Float32Array.from({ length: size / 4 }, (_, i) => view.getFloat32(i * 4, true));
        sourceFrames = samples.length;
        bytes = id === "STT-06" ? padLongClip(samples) : encodeCanonicalWav(samples);
        provenance = { kind: id === "STT-06" ? "offline-tts-padded" : "offline-tts", sourceFrames,
          ...(id === "STT-06" ? { noiseSeed: 6006 } : {}) };
        speech.set(id, bytes);
      }
      const wav = validateCanonicalWav(bytes);
      const fixture = { id, file: `${id}.wav`, sha256: sha256(bytes), frames: wav.frames,
        sourceText, reference: sourceText, criticalPhrases: [...CRITICAL[id]], provenance,
        ...(id === "STT-06" ? { tailPhrase: "My final check was a failed write." } : {}),
      };
      fixtures.push(fixture);
      await writeFile(join(output, fixture.file), bytes, { mode: 0o600 });
      await writeFile(join(output, `${id}.reference.txt`), `${sourceText}\n`, { mode: 0o600 });
    }
    const manifest = manifestSchema.parse({ version: "transcription-pilot-v1", createdAt: new Date().toISOString(), policySha256: policyHash(),
      voice: { name: "Samantha", wordsPerMinute: 160, source: "installed macOS say; no downloads" }, aliases: DEFAULT_ALIASES,
      humanAudit: { status: "pending", reviewer: null, reviewedAt: null, changes: [] }, fixtures,
    });
    await writeFile(join(output, "manifest.json"), JSON.stringify(manifest, null, 2), { mode: 0o600 });
    const hash = sha256(canonicalJson(manifest));
    await writeFile(join(output, "LISTENING-CHECK.md"), [
      "# Human listening check — PENDING", "", "These are offline synthetic fixtures, not user recordings. No provider has processed them.",
      "The agent cannot hear these clips. Please compare each WAV with its .reference.txt, especially identifiers, numbers, fillers, corrections, and the final sentence.",
      "Do not mark verified merely because files/headers validate. Log any reference/alias changes in manifest.humanAudit.changes before setting reviewer/date/status.",
      "Do not approve paid execution against this draft hash. A human-audited manifest gets a new hash.", "",
      ...fixtures.map((f) => `- [ ] ${f.id}: [audio](${f.file}), ${(f.frames / 16000).toFixed(3)} seconds; [provisional reference](${f.id}.reference.txt)${f.provenance.sourceFrames ? `; source speech file ${(f.provenance.sourceFrames / 16000).toFixed(3)} seconds` : ""}`), "",
      `Draft manifest SHA-256: ${hash}`, "", "No audio was played automatically. Open the WAVs with your preferred local audio player.",
      "The current runner is offline-only and rejects --execute. Paid execution needs separate implementation review and explicit frozen-manifest/approval-ID/call/budget authorization.",
    ].join("\n"), { mode: 0o600 });
    console.log(JSON.stringify({ mode: "OFFLINE PREPARATION", output, manifestSha256: hash, humanAudit: "pending", providerCalls: 0,
      fixtures: fixtures.map((f) => ({ id: f.id, seconds: f.frames / 16000, bytes: f.frames * 2 + 44 })) }, null, 2));
  } finally { await rm(temporary, { recursive: true, force: true }); }
}
main().catch((error) => { console.error(error instanceof Error ? error.message : "Offline preparation failed."); process.exitCode = 1; });
