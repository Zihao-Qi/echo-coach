import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import type {
  DemoAudioAsset,
  DemoAudioKind,
} from "../src/content/questions/demo-audio";
import {
  sampleContent,
  type SampleQuestionContent,
  type SampleQuestionId,
} from "../src/content/questions/sample-content";
import { starterQuestions } from "../src/content/questions/starter-bank";

export const MODEL = "gemini-3.8-flash-tts";
const VOICE = { question: "Kore", answer: "Sulafat" } as const;
const REQUEST_LIMIT = 30;
const SECOND_LIMIT = 15 * 60;
const COST_LIMIT = 0.5;
const SAMPLE_RATE = 24_000;
const TIMEOUT_MS = 60_000;
export const MANIFEST_FILE = "src/content/questions/audio-manifest.json";

export interface SpeechJob {
  id: SampleQuestionId;
  kind: DemoAudioKind;
  text: string;
  textSha256: string;
  estimatedSeconds: number;
  voice: string;
}
interface SpeechResponse {
  bytes: Buffer;
  mimeType: string;
}
interface SpeechPcm {
  bytes: Buffer;
  sampleRate: number;
  durationSeconds: number;
}
export const sha256 = (value: Buffer | string) =>
  createHash("sha256").update(value).digest("hex");
export const estimateCost = (seconds: number) => (seconds * 25 * 9) / 1_000_000;

export function speechJobs(): SpeechJob[] {
  return starterQuestions.flatMap(({ id, prompt }) => {
    const key = id as SampleQuestionId;
    const sample: SampleQuestionContent = sampleContent[key];
    const job = (kind: DemoAudioKind, text: string): SpeechJob => ({
      kind,
      id: key,
      text,
      textSha256: sha256(text),
      voice: VOICE[kind],
      estimatedSeconds: text.trim().split(/\s+/).length / 2.5,
    });
    return [
      job("question", prompt),
      ...(sample.polishedAnswer
        ? [job("answer", sample.polishedAnswer.join("\n\n"))]
        : []),
    ];
  });
}

export function planSpeech(
  all: readonly SpeechJob[],
  existing: readonly DemoAudioAsset[],
  only?: string,
) {
  if (only && !all.some((job) => `${job.kind}:${job.id}` === only))
    throw new Error(
      "Unknown --only item. Use question:<id> or answer:<technical-id>.",
    );
  const jobs = all.filter((job) =>
    only
      ? `${job.kind}:${job.id}` === only
      : !existing.some(
          (asset) =>
            asset.kind === job.kind &&
            asset.id === job.id &&
            asset.textSha256 === job.textSha256,
        ),
  );
  const estimatedSeconds = jobs.reduce(
    (sum, job) => sum + job.estimatedSeconds,
    0,
  );
  if (estimatedSeconds > SECOND_LIMIT)
    throw new Error("Planned audio exceeds fifteen minutes. No requests made.");
  return { jobs, estimatedSeconds };
}

export function executionKey(
  env: Readonly<Record<string, string | undefined>>,
  hasFfmpeg: () => boolean,
) {
  if (env.CI !== undefined) throw new Error("Execution is disabled in CI.");
  if (
    env.ECHO_PUBLIC_DEMO === "true" ||
    env.NEXT_PUBLIC_ECHO_PUBLIC_DEMO === "true"
  )
    throw new Error("Execution is disabled for the public demo profile.");
  if (!env.GEMINI_API_KEY?.trim())
    throw new Error("GEMINI_API_KEY is required for execution.");
  if (!hasFfmpeg()) throw new Error("ffmpeg is required for execution.");
  return env.GEMINI_API_KEY;
}

function unexpectedFormat(): never {
  throw new Error(
    "Unexpected speech format; expected 16-bit mono PCM in a 16–48 kHz WAV or raw 24 kHz PCM.",
  );
}

function parseWave(bytes: Buffer): SpeechPcm {
  if (
    bytes.length < 12 ||
    bytes.toString("latin1", 0, 4) !== "RIFF" ||
    bytes.readUInt32LE(4) !== bytes.length - 8 ||
    bytes.toString("latin1", 8, 12) !== "WAVE"
  ) {
    unexpectedFormat();
  }
  let sampleRate: number | undefined;
  let data: Buffer | undefined;
  for (let offset = 12; offset < bytes.length; ) {
    if (bytes.length - offset < 8) unexpectedFormat();
    const tag = bytes.toString("latin1", offset, offset + 4);
    const size = bytes.readUInt32LE(offset + 4);
    const start = offset + 8;
    const end = start + size;
    const next = end + (size % 2); // RIFF pads odd chunk sizes to a word boundary.
    if (next > bytes.length) unexpectedFormat();
    if (tag === "fmt ") {
      if (sampleRate !== undefined || size < 16) unexpectedFormat();
      const rate = bytes.readUInt32LE(start + 4);
      if (
        bytes.readUInt16LE(start) !== 1 ||
        bytes.readUInt16LE(start + 2) !== 1 ||
        rate < 16_000 ||
        rate > 48_000 ||
        bytes.readUInt32LE(start + 8) !== rate * 2 ||
        bytes.readUInt16LE(start + 12) !== 2 ||
        bytes.readUInt16LE(start + 14) !== 16
      ) {
        unexpectedFormat();
      }
      sampleRate = rate;
    } else if (tag === "data") {
      if (data || size === 0 || size % 2 !== 0) unexpectedFormat();
      data = bytes.subarray(start, end);
    }
    offset = next;
  }
  if (sampleRate === undefined || !data) unexpectedFormat();
  return {
    bytes: data,
    sampleRate,
    durationSeconds: data.length / (2 * sampleRate),
  };
}

export function decodeSpeechAudio({
  bytes,
  mimeType,
}: SpeechResponse): SpeechPcm {
  const [type, ...options] = mimeType
    .toLowerCase()
    .split(";")
    .map((option) => option.trim());
  if (type === "audio/wav" || type === "audio/x-wav") return parseWave(bytes);
  // Preserve the provider's existing raw PCM contract; omitted channels means mono.
  const parameters = new Map(
    options.map((option) => option.split("=", 2) as [string, string]),
  );
  if (
    type !== "audio/l16" ||
    parameters.get("codec") !== "pcm" ||
    parameters.get("rate") !== String(SAMPLE_RATE) ||
    (parameters.has("channels") && parameters.get("channels") !== "1") ||
    !bytes.length ||
    bytes.length % 2 !== 0
  ) {
    unexpectedFormat();
  }
  return {
    bytes,
    sampleRate: SAMPLE_RATE,
    durationSeconds: bytes.length / (2 * SAMPLE_RATE),
  };
}

export async function generateSpeech(
  jobs: readonly SpeechJob[],
  deps: {
    generate: (job: SpeechJob, signal: AbortSignal) => Promise<SpeechResponse>;
    save: (job: SpeechJob, audio: SpeechPcm) => void;
    log: (text: string) => void;
  },
) {
  let requests = 0;
  let seconds = 0;
  let stopped: "request" | "duration" | "cost" | undefined;
  for (const job of jobs) {
    if (requests >= REQUEST_LIMIT) {
      stopped = "request";
      break;
    }
    requests++;
    deps.log(`Request ${requests}: ${job.kind}:${job.id}`);
    try {
      const pcm = decodeSpeechAudio(
        await deps.generate(job, AbortSignal.timeout(TIMEOUT_MS)),
      );
      seconds += pcm.durationSeconds;
      if (estimateCost(seconds) > COST_LIMIT) {
        stopped = "cost";
        break;
      }
      if (seconds > SECOND_LIMIT) {
        stopped = "duration";
        break;
      }
      deps.save(job, pcm);
    } catch {
      // Never print SDK errors, URLs, headers, response bodies or keys.
      throw new Error(
        `Stopped on request ${requests}; ${seconds.toFixed(2)} seconds of valid PCM counted ($${estimateCost(seconds).toFixed(4)} est.). No retries.`,
      );
    }
  }
  return { requests, seconds, estimatedCost: estimateCost(seconds), stopped };
}

export function saveAudio(
  root: string,
  manifest: DemoAudioAsset[],
  job: SpeechJob,
  { bytes, sampleRate, durationSeconds }: SpeechPcm,
  model = MODEL,
) {
  const manifestFile = join(root, MANIFEST_FILE);
  const outputDir = join(root, "public", "audio", `${job.kind}s`);
  mkdirSync(outputDir, { recursive: true });
  const temporary = mkdtempSync(join(outputDir, ".encode-"));
  try {
    const encoded = join(temporary, "speech.m4a");
    const conversion = spawnSync(
      "ffmpeg",
      [
        "-nostdin",
        "-v",
        "error",
        "-f",
        "s16le",
        "-ar",
        String(sampleRate),
        "-ac",
        "1",
        "-i",
        "pipe:0",
        "-ac",
        "1",
        "-c:a",
        "aac",
        "-b:a",
        "64k",
        "-movflags",
        "+faststart",
        encoded,
      ],
      { input: bytes, timeout: TIMEOUT_MS },
    );
    if (conversion.status !== 0) throw new Error("AAC encoding failed.");
    const file = readFileSync(encoded);
    const fileSha256 = sha256(file);
    const path = `/audio/${job.kind}s/${job.id}.${fileSha256.slice(0, 8)}.m4a`;
    const previous = manifest.find(
      (asset) => asset.id === job.id && asset.kind === job.kind,
    );
    // Delete only the old file belonging to this exact job and hash.
    if (previous && !/^[a-f0-9]{64}$/.test(previous.fileSha256))
      throw new Error("Invalid old file hash.");
    if (
      previous &&
      previous.path !==
        `/audio/${job.kind}s/${job.id}.${previous.fileSha256.slice(0, 8)}.m4a`
    )
      throw new Error("Invalid old file path.");
    renameSync(encoded, join(root, "public", path));
    const asset: DemoAudioAsset = {
      id: job.id,
      kind: job.kind,
      path,
      textSha256: job.textSha256,
      fileSha256,
      size: file.length,
      durationSeconds,
      model,
      voice: job.voice,
    };
    const next = [
      ...manifest.filter((entry) => entry !== previous),
      asset,
    ].sort((a, b) => a.path.localeCompare(b.path));
    mkdirSync(dirname(manifestFile), { recursive: true });
    const tempManifest = `${manifestFile}.tmp`;
    writeFileSync(tempManifest, `${JSON.stringify(next, null, 2)}\n`);
    renameSync(tempManifest, manifestFile);
    manifest.splice(0, manifest.length, ...next);
    if (previous && previous.path !== path)
      rmSync(join(root, "public", previous.path), { force: true });
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

async function main(args: string[]) {
  let execute = false,
    only: string | undefined;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--execute" && !execute) execute = true;
    else if (
      args[i] === "--only" &&
      !only &&
      args[i + 1] &&
      !args[i + 1].startsWith("--")
    )
      only = args[++i];
    else
      throw new Error(
        "Usage: npx tsx scripts/generate-demo-audio.ts [--only question:<id>|answer:<id>] [--execute]",
      );
  }
  const root = resolve(__dirname, "..");
  const file = join(root, MANIFEST_FILE);
  const manifest: DemoAudioAsset[] = existsSync(file)
    ? JSON.parse(readFileSync(file, "utf8"))
    : [];
  const { jobs, estimatedSeconds } = planSpeech(speechJobs(), manifest, only);
  for (const job of jobs)
    console.log(
      `public/audio/${job.kind}s/${job.id}.<hash8>.m4a · ${job.text.length} characters · ${job.estimatedSeconds.toFixed(1)} seconds · $${estimateCost(job.estimatedSeconds).toFixed(4)} est.`,
    );
  console.log(
    `Plan: ${jobs.length} files · ${estimatedSeconds.toFixed(1)} seconds · $${estimateCost(estimatedSeconds).toFixed(4)} est.`,
  );
  if (!execute) {
    console.log("Plan only. No network requests made.");
    return;
  }
  const apiKey = executionKey(
    process.env,
    () =>
      spawnSync("ffmpeg", ["-version"], { stdio: "ignore", timeout: 5000 })
        .status === 0,
  );
  if (jobs.length === 0) return;
  const { GoogleGenAI, Modality } = await import("@google/genai");
  const client = new GoogleGenAI({
    apiKey,
    vertexai: false,
    httpOptions: {
      baseUrl: "https://generativelanguage.googleapis.com",
      apiVersion: "v1beta",
      retryOptions: { attempts: 1 },
      timeout: TIMEOUT_MS,
    },
  });
  const result = await generateSpeech(jobs, {
    generate: async (job, abortSignal) => {
      const response = await client.models.generateContent({
        model: MODEL,
        contents: `Read the text below verbatim in clear, natural English. Do not introduce it or add words.\n\n${job.text}`,
        config: {
          abortSignal,
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: job.voice } },
          },
        },
      });
      const parts =
        response.candidates?.[0]?.content?.parts?.filter(
          (part) => part.inlineData?.data,
        ) ?? [];
      if (parts.length !== 1)
        throw new Error("Expected exactly one audio part.");
      const { data, mimeType } = parts[0].inlineData!;
      if (!data || !mimeType) throw new Error("Missing audio data.");
      return { mimeType, bytes: Buffer.from(data, "base64") };
    },
    save: (job, audio) => saveAudio(root, manifest, job, audio),
    log: console.log,
  });
  console.log(
    `${result.requests} requests · ${result.seconds.toFixed(2)} generated seconds · $${result.estimatedCost.toFixed(4)} est.`,
  );
  if (result.stopped) {
    console.error(`Stopped at the ${result.stopped} limit.`);
    process.exitCode = 1;
  }
}

if (require.main === module)
  void main(process.argv.slice(2)).catch((error) => {
    // Only display locally constructed errors. A malformed manifest or SDK error
    // must not dump raw data or credentials.
    const message =
      error instanceof Error ? error.message : "Audio generation failed.";
    console.error(
      /^(Usage:|Unknown --only|Planned audio|Execution is disabled|GEMINI_API_KEY|ffmpeg is required|Stopped on request)/.test(
        message,
      )
        ? message
        : "Audio generation failed. No raw error printed.",
    );
    process.exitCode = 1;
  });
