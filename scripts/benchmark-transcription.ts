import { resolve } from "node:path";
import { writeFile } from "node:fs/promises";
import { loadCorpus } from "../benchmarks/transcription/corpus";
import { buildInteractionRequest } from "../benchmarks/transcription/protocol";
import { ALLOWANCE_NANO_USD, MAX_CALLS, PRICE_DATE, PRICE_EXPIRES_BEFORE, REQUESTED_OUTPUT_TOKENS,
  callPlan, estimateNanoUsd, formatUsd, reservationNanoUsd } from "../benchmarks/transcription/spec";

// OFFLINE ONLY. No provider SDK, environment loader, API key, fetch, or app import.
// A paid executor with approval-ID journal requires a later reviewed implementation.
async function main() {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg === "--execute" || arg.startsWith("--approval"))) {
    throw new Error("Paid execution is not implemented in this offline preparation runner. No credentials were loaded and no request was sent.");
  }
  if (args.length !== 1 || !args[0].startsWith("--manifest=")) throw new Error("Usage: npm run benchmark:transcription -- --manifest=benchmark-results/.../manifest.json (offline only)");
  const manifestPath = resolve(args[0].slice("--manifest=".length));
  const corpus = await loadCorpus(manifestPath);
  const calls = callPlan(corpus.manifest).map(({ fixture, model }, index) => {
    const request = buildInteractionRequest(model, corpus.audio.get(fixture.id)!);
    return { ordinal: index + 1, fixtureId: fixture.id, model, audioSha256: fixture.sha256, seconds: fixture.frames / 16000,
      inputBytes: corpus.audio.get(fixture.id)!.length, requestJsonBytes: Buffer.byteLength(JSON.stringify(request.body)),
      method: request.method, endpoint: request.url, store: request.body.store, background: request.body.background, stream: request.body.stream,
      generationConfig: request.body.generation_config, redirect: request.redirect, automaticRetries: request.automaticRetries,
      deadlineMs: request.deadlineMs, metadataMaximumReservationUsd: formatUsd(reservationNanoUsd(model, fixture.frames)),
      ifRequestedCapHonoredUsd: formatUsd(estimateNanoUsd(model, fixture.frames, REQUESTED_OUTPUT_TOKENS)),
    };
  });
  if (calls.length !== MAX_CALLS) throw new Error("The frozen pilot must contain twelve planned cells, not extra canaries.");
  const capTotalNano = callPlan(corpus.manifest).reduce((sum, { model, fixture }) => sum + estimateNanoUsd(model, fixture.frames, REQUESTED_OUTPUT_TOKENS), 0);
  const report = { mode: "OFFLINE DRY RUN", providerCalls: 0, executionImplemented: false,
    manifestPath, manifestSha256: corpus.manifestSha256, humanAudit: corpus.manifest.humanAudit,
    paidApproval: "NOT GRANTED", pricingDate: PRICE_DATE, pricingExpired: new Date().toISOString().slice(0, 10) >= PRICE_EXPIRES_BEFORE,
    proposedCalls: calls.length, proposedAllowanceUsd: formatUsd(ALLOWANCE_NANO_USD),
    estimateIfRequestedCapsHonoredUsd: formatUsd(capTotalNano),
    note: "Estimate only; not a bill/dollar cap. No live cost journal or paid executor exists here. Human auditory audit, frozen-manifest approval, and reviewed execution safeguards are still required.", calls,
  };
  // Separate file; never mutate the manifest or mark its human audit verified.
  const reportPath = `${manifestPath}.dry-run.json`;
  await writeFile(reportPath, JSON.stringify(report, null, 2), { mode: 0o600 });
  console.log(JSON.stringify({ ...report, calls: undefined, reportPath }, null, 2));
}
main().catch((error) => { console.error(error instanceof Error ? error.message : "Offline transcription dry run failed."); process.exitCode = 1; });
