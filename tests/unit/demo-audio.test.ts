import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { demoAudioAssets } from "../../src/content/questions/demo-audio";
import {
  DEMO_TRANSCRIPT_TEXT,
  transcriptForStarter,
} from "../../src/content/questions/demo-transcription";
import {
  estimateCost,
  executionKey,
  generateSpeech,
  pcmDuration,
  planSpeech,
  sha256,
  speechJobs,
  type SpeechJob,
} from "../../scripts/generate-demo-audio";
import { isPublicDemoPathAllowed } from "../../src/infrastructure/http/public-demo-paths";

const jobs = speechJobs();
const raw = (seconds: number, mimeType = "audio/L16;codec=pcm;rate=24000") => ({
  bytes: Buffer.alloc(seconds * 48_000),
  mimeType,
});

test("manifest is either deliberately empty or exactly matches all current starter question and polished texts", () => {
  assert.equal(jobs.filter((job) => job.kind === "question").length, 9);
  assert.equal(jobs.filter((job) => job.kind === "answer").length, 6);
  if (demoAudioAssets.length) assert.equal(demoAudioAssets.length, jobs.length);
  const root = "public/audio";
  const files = existsSync(root)
    ? readdirSync(root, { recursive: true, withFileTypes: true })
        .filter((entry) => !entry.isDirectory())
        .map(
          (entry) =>
            `/${join(entry.parentPath, entry.name).slice("public/".length)}`,
        )
    : [];
  assert.deepEqual(
    files.sort(),
    demoAudioAssets.map((asset) => asset.path).sort(),
  );
  const seen = new Set<string>();
  for (const asset of demoAudioAssets) {
    const key = `${asset.kind}:${asset.id}`;
    assert.equal(seen.has(key), false);
    seen.add(key);
    const job = jobs.find(
      (item) => item.id === asset.id && item.kind === asset.kind,
    );
    assert.ok(job, key);
    assert.equal(asset.textSha256, sha256(job.text), key);
    assert.match(asset.fileSha256, /^[a-f0-9]{64}$/);
    assert.equal(
      asset.path,
      `/audio/${job.kind}s/${job.id}.${asset.fileSha256.slice(0, 8)}.m4a`,
    );
    const encoded = readFileSync(`public${asset.path}`);
    assert.equal(asset.fileSha256, sha256(encoded), key);
    assert.equal(asset.size, encoded.length, key);
    assert.ok(
      Number.isFinite(asset.durationSeconds) && asset.durationSeconds > 0,
    );
    assert.ok(asset.model && asset.voice);
  }
});

test("proxy admits only manifest audio paths and the mock interview in public mode", () => {
  const path = "/audio/questions/example.12345678.m4a";
  const sample = new Set([path]);
  assert.ok(isPublicDemoPathAllowed(path, sample));
  assert.equal(isPublicDemoPathAllowed(path, new Set()), false);
  for (const asset of demoAudioAssets)
    assert.ok(isPublicDemoPathAllowed(asset.path));
  for (const unknown of [
    "/audio/missing.m4a",
    path.replace("/audio/", "/audio/nested/"),
    path.replace("/audio/", "/audio/../"),
    path.replace("/audio/", "/audio/%2e%2e/"),
    path.replace(".m4a", "%2em4a"),
    "/legacy",
    "/api/practice/transcriptions",
  ]) {
    assert.equal(isPublicDemoPathAllowed(unknown, sample), false, unknown);
  }
  for (const mock of ["/mock-interview", "/mock-interview/"])
    assert.ok(isPublicDemoPathAllowed(mock));
});

test("only the unmodified default demo fixture is substituted on a starter", () => {
  assert.equal(
    transcriptForStarter(DEMO_TRANSCRIPT_TEXT, "demo", "Starter sample"),
    "Starter sample",
  );
  assert.equal(
    transcriptForStarter(DEMO_TRANSCRIPT_TEXT, "demo"),
    DEMO_TRANSCRIPT_TEXT,
  );
  assert.equal(
    transcriptForStarter(DEMO_TRANSCRIPT_TEXT, "other", "Starter sample"),
    DEMO_TRANSCRIPT_TEXT,
  );
  for (const text of ["", "short", ` ${DEMO_TRANSCRIPT_TEXT}`])
    assert.equal(transcriptForStarter(text, "demo", "Starter sample"), text);
});

test("plan uses exact text hashes, skips current files, and accepts only valid --only jobs", () => {
  const job = jobs[0];
  const current = [
    {
      id: job.id,
      kind: job.kind,
      textSha256: job.textSha256,
      size: 1,
      path: "/unused",
      fileSha256: "unused",
      durationSeconds: 1,
      model: "mock",
      voice: job.voice,
    },
  ];
  assert.equal(planSpeech(jobs, current).jobs.length, 14);
  assert.deepEqual(planSpeech(jobs, current, `question:${job.id}`).jobs, [job]);
  assert.equal(planSpeech(jobs, [], "answer:swe-hash-map").jobs.length, 1);
  for (const only of [
    "question:missing",
    "answer:behavioral-project",
    `both:${job.id}`,
  ])
    assert.throws(() => planSpeech(jobs, [], only), /Unknown --only/);
  assert.throws(
    () => planSpeech([{ ...job, estimatedSeconds: 901 }], []),
    /exceeds fifteen minutes/,
  );
  assert.equal(estimateCost(10), 0.00225);
});

test("plan CLI works with networking blocked; execution rejects CI, public mode, missing key and missing encoder", () => {
  // Block HTTP without blocking tsx's local Unix compilation socket.
  const guard = `import http from 'node:http'; import https from 'node:https';
    function deny() { console.error('UNEXPECTED_OUTBOUND'); throw Error('network denied'); }
    globalThis.fetch = deny; http.request = http.get = https.request = https.get = deny;`;
  const run = (
    args: string[],
    env: Readonly<Record<string, string | undefined>>,
  ) =>
    spawnSync(
      process.execPath,
      [
        "--import",
        `data:text/javascript,${encodeURIComponent(guard)}`,
        "--import",
        "tsx",
        "scripts/generate-demo-audio.ts",
        ...args,
      ],
      {
        encoding: "utf8",
        timeout: 10_000,
        env: { NODE_ENV: "test", PATH: "", ...env },
      },
    );
  const plan = run(["--only", "question:swe-hash-map"], { CI: "true" });
  assert.equal(plan.status, 0, plan.stderr);
  assert.match(plan.stdout, /Plan: 1 files/);
  assert.match(plan.stdout, /Plan only/);
  assert.doesNotMatch(plan.stdout + plan.stderr, /UNEXPECTED_OUTBOUND/);
  const fake = "not-a-real-key-do-not-print";
  for (const [env, expected] of [
    [{ CI: "", GEMINI_API_KEY: fake }, /disabled in CI/],
    [
      { ECHO_PUBLIC_DEMO: "true", GEMINI_API_KEY: fake },
      /disabled for the public demo/,
    ],
    [{}, /GEMINI_API_KEY is required/],
    [{ GEMINI_API_KEY: fake }, /ffmpeg is required/],
    [
      { NEXT_PUBLIC_ECHO_PUBLIC_DEMO: "true", GEMINI_API_KEY: fake },
      /disabled for the public demo/,
    ],
  ] as const) {
    assert.throws(() => executionKey(env, () => false), expected);
  }
  assert.equal(
    executionKey({ GEMINI_API_KEY: fake }, () => true),
    fake,
  );
});

test("generation counts mock requests, rejects invalid PCM, and stops at the request and output limits", async () => {
  for (const bad of [
    raw(1, "audio/wav"),
    raw(1, "audio/L16;codec=pcm;rate=16000"),
    raw(1, "audio/L16;codec=pcm;rate=24000;channels=2"),
    raw(0),
    { ...raw(0), bytes: Buffer.alloc(1) },
  ])
    assert.throws(() => pcmDuration(bad), /Unexpected speech format/);
  const fakePlan: SpeechJob[] = Array.from({ length: 31 }, () => jobs[0]);
  let uploads = 0,
    files = 0;
  const tiny = raw(1);
  const limits = await generateSpeech(fakePlan, {
    generate: async (_job, signal) => {
      assert.ok(signal instanceof AbortSignal);
      uploads++;
      return tiny;
    },
    save: () => {
      files++;
    },
    log: () => {},
  });
  assert.deepEqual([uploads, files, limits.stopped], [30, 30, "request"]);
  uploads = 0;
  files = 0;
  const long = raw(301);
  const duration = await generateSpeech(fakePlan, {
    generate: async () => {
      uploads++;
      return long;
    },
    save: () => {
      files++;
    },
    log: () => {},
  });
  assert.deepEqual(
    [uploads, files, duration.seconds, duration.stopped],
    [3, 2, 903, "duration"],
  );
  // Mock the byte count of an unexpectedly expensive response without allocating it.
  const expensive = {
    ...tiny,
    bytes: Object.defineProperty(Buffer.alloc(0), "length", {
      value: 2_300 * 48_000,
    }),
  };
  const cost = await generateSpeech(fakePlan, {
    generate: async () => expensive,
    save: () => assert.fail("saved an over-budget response"),
    log: () => {},
  });
  assert.equal(cost.requests, 1);
  assert.ok(cost.estimatedCost > 0.5);
  assert.equal(cost.stopped, "cost");
  await assert.rejects(
    generateSpeech(jobs, {
      generate: async () => {
        throw new Error("secret from provider");
      },
      save: () => assert.fail("saved a failed request"),
      log: () => {},
    }),
    /^Error: Stopped on request 1;.*No retries/,
  );
});
