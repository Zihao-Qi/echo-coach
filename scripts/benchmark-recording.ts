import assert from "node:assert/strict";
import { createServer } from "node:http";
import { Readable } from "node:stream";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir, platform, release, arch, cpus, loadavg } from "node:os";
import path from "node:path";
import { chromium } from "@playwright/test";
import ts from "typescript";
import { readCanonicalAudio } from "../src/infrastructure/http/read-audio";
import { BrowserMemorySampler, positiveProcessGrowth } from "../tests/audio/process-memory";
import { acquireOrDispose, withDeadline } from "../tests/audio/deadline";

async function main() {
// This script does not load .env.local, provider SDKs, app routes, or ADC.
// The HTTP server serves only a fixed test-module allowlist and byte validation.
const smoke = process.argv.includes("--smoke");
const testStall = process.argv.includes("--test-stall");
const testLateLaunch = process.argv.includes("--test-late-launch");
if (process.argv.slice(2).some((arg) => !["--smoke", "--test-stall", "--test-late-launch"].includes(arg))) throw new Error("Unsupported recording benchmark argument.");
const seconds = smoke ? 2 : 120;
const channel = process.env.PLAYWRIGHT_CHANNEL || "chrome";
const temporary = await mkdtemp(path.join(tmpdir(), "echo-audio-spike-"));
let browserServer: Awaited<ReturnType<typeof chromium.launchServer>> | undefined;
let browser: Awaited<ReturnType<typeof chromium.connect>> | undefined;
let memory: BrowserMemorySampler | undefined;
let ownedServer: ReturnType<typeof createServer> | undefined;
let workflowExpired = false;
try {
const fixturePath = path.join(temporary, "synthetic-440hz.wav");
const fixture = Buffer.alloc(44 + 48000 * seconds * 2);
fixture.write("RIFF", 0); fixture.writeUInt32LE(fixture.length - 8, 4); fixture.write("WAVEfmt ", 8);
fixture.writeUInt32LE(16, 16); fixture.writeUInt16LE(1, 20); fixture.writeUInt16LE(1, 22);
fixture.writeUInt32LE(48000, 24); fixture.writeUInt32LE(96000, 28);
fixture.writeUInt16LE(2, 32); fixture.writeUInt16LE(16, 34); fixture.write("data", 36);
fixture.writeUInt32LE(fixture.length - 44, 40);
for (let i = 0; i < 48000 * seconds; i++) fixture.writeInt16LE(Math.round(0.15 * 32767 * Math.sin(2 * Math.PI * 440 * i / 48000)), 44 + i * 2);
await writeFile(fixturePath, fixture);

const modules = new Map<string, string>();
for (const [url, source] of [
  ["/harness", "tests/audio/browser-harness.ts"],
  ["/src/features/practice/audio/normalize-recording", "src/features/practice/audio/normalize-recording.ts"],
  ["/src/domain/audio/canonical-wav", "src/domain/audio/canonical-wav.ts"],
] as const) {
  modules.set(url, ts.transpileModule(await readFile(source, "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText);
}
// Resolve the harness's relative imports from /tests/audio/, as in the source tree.
modules.set("/tests/audio/browser-harness", modules.get("/harness")!);
let origin = "";
let validations = 0;
const server = createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url === "/") {
      res.setHeader("Content-Type", "text/html");
      res.setHeader("Content-Security-Policy", "default-src 'none'; script-src 'self'; connect-src 'self'");
      res.end('<!doctype html><title>Isolated synthetic audio spike</title><script type="module" src="/tests/audio/browser-harness"></script>');
    } else if (req.method === "GET" && modules.has(req.url || "")) {
      res.setHeader("Content-Type", "text/javascript"); res.end(modules.get(req.url!));
    } else if (req.method === "POST" && req.url === "/validate" && req.headers.origin === origin) {
      const request = new Request(`${origin}/validate`, {
        method: "POST", headers: { "content-type": req.headers["content-type"] || "", ...(req.headers["content-length"] ? { "content-length": req.headers["content-length"] } : {}) },
        body: Readable.toWeb(req) as ReadableStream<Uint8Array>, duplex: "half",
      } as RequestInit);
      const { info } = await readCanonicalAudio(request);
      validations++; res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(info));
    } else { res.statusCode = 404; res.end(); }
  } catch { res.statusCode = 400; res.end("Invalid canonical audio."); }
});
ownedServer = server;
  // Covers setup and every browser RPC, including calls without per-operation limits.
  await withDeadline("isolated recording workflow", testStall || testLateLaunch ? 4000 : seconds * 1000 + 45000, async () => {
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No isolated server address.");
  origin = `http://127.0.0.1:${address.port}`;
  if (workflowExpired) throw new Error("Workflow expired before browser launch.");
  browserServer = await acquireOrDispose(async () => {
    const created = await chromium.launchServer({ channel, headless: true, timeout: 15000, args: [
      "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-audio-capture=${fixturePath}`,
    ] });
    if (testLateLaunch) {
      console.log(`Testing late acquisition cleanup for isolated Chrome PID ${created.process().pid}.`);
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
    return created;
  }, () => workflowExpired, async (late) => {
    await withDeadline("late browser cleanup", 3000, () => late.kill()).catch(() => { late.process().kill("SIGKILL"); });
  });
  browser = await acquireOrDispose(() => chromium.connect(browserServer!.wsEndpoint(), { timeout: 10000 }),
    () => workflowExpired, (late) => withDeadline("late connection cleanup", 3000, () => late.close()));
  const context = await browser.newContext({ permissions: ["microphone"] });
  await context.route("**/*", (route) => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  const page = await context.newPage();
  await page.goto(origin, { timeout: 10000 });
  await page.waitForFunction(() => !!window.audioSpike, undefined, { timeout: 10000 });
  if (testStall) {
    console.log(`Testing host deadline and cleanup for isolated Chrome PID ${browserServer.process().pid}.`);
    // Deliberately unwrapped: the OUTER workflow deadline must reach cleanup.
    await page.evaluate(() => new Promise(() => {}));
    throw new Error("Injected stall unexpectedly completed.");
  }
  assert.equal(await page.evaluate(() => window.audioSpike.microphoneCalls()), 0);
  await withDeadline("invalid-input probes", 5000, () => page.evaluate(() => window.audioSpike.invalidInputs()));
  await withDeadline("stereo fixture", 5000, () => page.evaluate(() => window.audioSpike.downmixFixture()));
  assert.equal(await page.evaluate(() => window.audioSpike.microphoneCalls()), 0);
  const pid = browserServer.process().pid;
  if (!pid) throw new Error("No isolated browser PID.");
  memory = new BrowserMemorySampler(pid);
  await memory.start(); await memory.phase("idle"); await memory.phase("idle");
  const idle = memory.samples.filter((s) => s.phase === "idle").map((s) => s.totalRssMiB).sort((a, b) => a - b);
  const baselineRssMiB = idle[Math.floor(idle.length / 2)];
  const idleSamples = memory.samples.filter((s) => s.phase === "idle");
  const idlePids = [...new Set(idleSamples.flatMap((sample) => Object.keys(sample.byProcessMiB)))];
  const baselineByProcessMiB = Object.fromEntries(idlePids.map((pid) => {
    const values = idleSamples.map((sample) => sample.byProcessMiB[pid] || 0).sort((a, b) => a - b);
    return [pid, values[Math.floor(values.length / 2)]];
  }));
  const loadBefore = loadavg();
  await memory.phase("capture", 100);
  console.log(`Capturing ${seconds}s of synthetic 440Hz audio; no provider calls.`);
  const capture = await withDeadline("capture", seconds * 1000 + 15000, () => page.evaluate((ms) => window.audioSpike.capture(ms), seconds * 1000));
  const trials = [];
  for (let index = 0; index < 3; index++) {
    await memory.phase(`normalize-${index + 1}`, 20);
    const result = await withDeadline("normalization and validation", 10000, () => page.evaluate(() => window.audioSpike.normalize()));
    await memory.phase(`normalize-${index + 1}`, 20);
    assert.equal(result.sampleRate, 16000); assert.equal(result.channels, 1);
    assert.ok(Math.abs(result.durationSeconds - seconds) <= 0.25);
    assert.ok(Math.abs(result.observedFrequencyHz - 440) < 5, "Captured source frequency must survive codec/resampling.");
    trials.push(result);
  }
  assert.equal(await page.evaluate(() => window.audioSpike.microphoneCalls()), 1);
  await withDeadline("discard", 3000, () => page.evaluate(() => window.audioSpike.discard()));
  await memory.stop();
  const normalSamples = memory.samples.filter((s) => s.phase.startsWith("normalize-"));
  const roles = [...new Set(memory.processes.values())];
  const peakRssMiB = Math.max(...normalSamples.map((s) => s.totalRssMiB));
  const peakDeltaMiB = Math.max(...normalSamples.map((sample) => positiveProcessGrowth(baselineByProcessMiB, sample.byProcessMiB)));
  const gapMs = Math.max(...normalSamples.slice(1).map((s, i) => s.elapsedMs - normalSamples[i].elapsedMs));
  const inWorkSamples = trials.map((trial) => normalSamples.filter((sample) =>
    sample.sampleStartedAt >= trial.normalizationStartedAt && sample.sampleEndedAt <= trial.normalizationEndedAt).length);
  const gate = {
    latency: trials.every((t) => t.normalizationMs <= 5000), memory: peakDeltaMiB <= 256,
    processCoverage: roles.includes("renderer") && roles.includes("audio-service"),
    sampledCredibly: inWorkSamples.every((count) => count > 0) && gapMs <= 150,
    correctWork: validations === 3,
  };
  const report = {
    stage: "B1a", workload: "Synthetic 440Hz PCM -> fake microphone -> real MediaRecorder -> browser decode/resample/mix -> WAV -> bounded Node HTTP validator",
    smoke, captureCount: 1, normalizationTrials: 3, capture, trials, gate,
    feasibilityPassed: !smoke && Object.values(gate).every(Boolean),
    environment: { node: process.version, browser: browser.version(), channel, platform: platform(), release: release(), arch: arch(), cpu: cpus()[0]?.model, loadBefore, loadAfter: loadavg() },
    memory: { method: "ps RSS for isolated Chrome browser + descendants, including renderer/audio/GPU/helpers; gate sums POSITIVE per-PID growth against idle medians, counting new processes in full. Exited/shrinking helpers cannot offset another process. Shared pages double-counted; detached crash handlers excluded",
      baselineByProcessMiB, baselineRssMiB, sampledNormalizationPeakRssMiB: peakRssMiB, sampledNormalizationPeakDeltaMiB: peakDeltaMiB,
      capturePeakRssMiB: Math.max(...memory.samples.filter((s) => s.phase === "capture").map((s) => s.totalRssMiB)),
      targetSamplingMs: { capture: 100, normalization: 20 }, maximumNormalizationSampleGapMs: gapMs,
      samplesFullyInsideNormalization: inWorkSamples,
      processes: [...memory.processes].map(([pid, role]) => ({ pid, role })), samples: memory.samples },
    limits: ["One synthetic capture, three normalizations of the same encoded blob (cold/warm allocator effects); not a comparative benchmark.",
      "Sampled positive per-process RSS growth is conservative, not unique memory or a guaranteed instantaneous peak; native/JS allocations are included at process level.",
      "No physical microphone, speech recognition, mobile/Safari, authentication, cloud, or provider quality validation.",
      "The harness is not an application page or production endpoint; production voice is not enabled."],
  };
  await mkdir("benchmark-results", { recursive: true });
  const output = `benchmark-results/recording-${Date.now()}.json`;
  await writeFile(output, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ output, gate, feasibilityPassed: report.feasibilityPassed, normalizationMs: trials.map((t) => t.normalizationMs), peakDeltaMiB, maximumSampleGapMs: gapMs }, null, 2));
  assert.ok(smoke ? gate.correctWork && gate.processCoverage && gate.latency : Object.values(gate).every(Boolean),
    "Feasibility gate failed; stop for investigation/architecture review.");
  });
} finally {
  workflowExpired = true;
  try { await withDeadline("sampler stop", 4000, async () => { await memory?.stop(); }); }
  finally {
    try {
      await withDeadline("browser disconnect", 3000, async () => { await browser?.close(); }).catch(() => {});
      await withDeadline("browser shutdown", 3000, async () => { await browserServer?.close(); }).catch(async () => {
        await withDeadline("browser force kill", 3000, async () => { await browserServer?.kill(); }).catch(() => {
          browserServer?.process().kill("SIGKILL");
        });
      });
    } finally {
      try {
        ownedServer?.closeAllConnections();
        if (ownedServer) await withDeadline("fixture server shutdown", 3000, () => new Promise<void>((resolve) => ownedServer!.close(() => resolve())));
      } finally { await rm(temporary, { recursive: true, force: true }); }
    }
  }
}
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
