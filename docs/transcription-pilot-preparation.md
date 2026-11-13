# Transcription pilot: offline preparation checkpoint

## Result and next human action

**No-spend preparation is complete and independently reviewed.** Six synthetic WAV clips, provisional references, a draft manifest, request descriptors, scoring helpers, and an offline dry-run runner are ready. No audio was played automatically or uploaded, and no Gemini coaching/transcription request was made.

**Please audit the clips by ear using the [local listening checklist](../benchmark-results/transcription-pilot-5WB759/LISTENING-CHECK.md).** The agent cannot hear them. Check spoken identifiers/numbers, fillers/repetitions/corrections, the instruction-like test content (data, not instructions to follow), and the long answer's final sentence. Report any pronunciation/reference mismatch. No automated file check substitutes for this audit.

Current local corpus: `benchmark-results/transcription-pilot-5WB759/` (ignored by Git).

| Fixture | Actual duration | Audio | Provisional reference |
| --- | ---: | --- | --- |
| STT-01: terms, numbers, negation | 10.759 s | [WAV](../benchmark-results/transcription-pilot-5WB759/STT-01.wav) | [text](../benchmark-results/transcription-pilot-5WB759/STT-01.reference.txt) |
| STT-02: fillers and correction | 17.318 s | [WAV](../benchmark-results/transcription-pilot-5WB759/STT-02.wav) | [text](../benchmark-results/transcription-pilot-5WB759/STT-02.reference.txt) |
| STT-03: spoken instruction-like data | 10.782 s | [WAV](../benchmark-results/transcription-pilot-5WB759/STT-03.wav) | [text](../benchmark-results/transcription-pilot-5WB759/STT-03.reference.txt) |
| STT-04: nonzero noise, no TTS speech | 5.000 s | [WAV](../benchmark-results/transcription-pilot-5WB759/STT-04.wav) | [empty text](../benchmark-results/transcription-pilot-5WB759/STT-04.reference.txt) |
| STT-05: STT-01 with seeded 10 dB SNR noise | 10.759 s | [WAV](../benchmark-results/transcription-pilot-5WB759/STT-05.wav) | [text](../benchmark-results/transcription-pilot-5WB759/STT-05.reference.txt) |
| STT-06: long answer plus low noise padding | 120.000 s | [WAV](../benchmark-results/transcription-pilot-5WB759/STT-06.wav) | [text](../benchmark-results/transcription-pilot-5WB759/STT-06.reference.txt) |

All clips are canonical mono 16 kHz, 16-bit PCM and pass the existing app validator. Total input per model is 174.618 seconds, within the planned 215-second ceiling. Speech was generated to files with the locally listed macOS Samantha voice at requested rate 160, then converted with local FFmpeg. Noise is seeded/reproducible; the noisy pair is linked to the clean audio hash. STT-06 never truncates words: its source file ends before 120 seconds and receives low nonzero-noise padding.

Draft manifest SHA-256:

`56af78fb4a8fd464e60b5c09485fe6aedc3b2bcc6bc4d9e1b420400850433c61`

**This is not the final paid-approval hash.** `humanAudit.status` is still `pending`; recording the human review/reference edits will produce a new hash. The earlier `transcription-pilot-QaNXC5` output predates the final shared generation-policy hash and is not the current corpus.

## Scope: an offline runner, not a paid executor

The implementation intentionally narrows this stage to what the user authorized:

- `scripts/prepare-transcription.ts`: creates a new local output directory, silent file-based OS TTS, seeded noise and canonical WAVs, reference/audit sheet and pending manifest. It never downloads voices or calls a model.
- `scripts/benchmark-transcription.ts`: validates manifest/policy/file hashes/format/duration, derives the twelve-cell alternating model order, constructs stateless inline request settings in memory, and writes a redacted dry-run report. It imports no provider SDK, environment loader, key reader, or network function.
- `--execute` and approval flags are rejected unconditionally. Even a key present in the environment cannot enable spending.
- `benchmarks/transcription/`: shared frozen model/config/price/scoring policy, canonical manifest hashing, strict corpus loading, request descriptors, conservative reservations, sanitized response inspection, WER/edit counts, critical/filler/tail probes, and explicit incomplete-coverage/manual-review status.

The actual persistent approval-ID journal, exclusive live lock, fsynced admission/settlement, HTTP deadline/transport, and funded execution control are **not implemented or approved yet**. Before a paid run, they must be implemented/tested/reviewed separately under the [approved plan](transcription-benchmark-plan.md). App adapters/real-transcription flags remain disabled and unchanged.

## Observed dry run

```sh
npm run benchmark:transcription -- --manifest=benchmark-results/transcription-pilot-5WB759/manifest.json
```

Observed report: `manifest.json.dry-run.json` beside the manifest:

- `providerCalls: 0`
- `executionImplemented: false`
- `humanAudit.status: pending`
- `paidApproval: NOT GRANTED`
- 12 planned cells, no extra canaries/retries.
- Requested-cap estimate for the measured corpus: **$0.22335725**, conditional on caps being honored—not an invoice or dollar cap. The proposed total allowance remains up to $0.75, unapproved.
- No base64 audio, key, raw model error, thought content, or authorization header in the report. No human verification or manifest mutation occurs during the dry run.

Generate a new local corpus when needed:

```sh
npm run benchmark:transcription:prepare
```

This requires the installed Samantha voice, macOS `say`, and local FFmpeg. It creates a fresh directory rather than overwriting reviewed data. TTS output is not assumed bit-identical between runs; each run has fresh byte hashes and needs its own reference audit/freeze. Generated artifacts are local/ignored, so another checkout must reproduce them.

## Review and validation

Independent **GPT-6.1-Sol / high** reviewed the implementation and boundary fix. Final Pi session metadata confirms `openai-codex`, `gpt-6.1-sol`, `high`. Final report: **“No remaining actionable findings in the scoped offline preparation review.”** Static review only; runtime evidence below belongs to the lead.

The reviewer found an exact-boundary case where 120 seconds of source speech could consume all padding. The lead reproduced it with a failing nonzero-source test, then changed the helper to reject source lengths **greater than or equal to** the ceiling. The current corpus is unaffected and was not regenerated merely for that fix.

Observed checks:

- **81 unit/API tests passed**, including ten new preparation tests.
- Lint and TypeScript passed; production build and **3 HTTP integration tests passed**.
- **38 serial browser tests passed**; application code was not changed by preparation.
- Actual local preparation and dry run passed.
- Unit subprocess tests blocked `fetch`, supplied a synthetic key, observed zero fetches, verified that the manifest/audit stayed unchanged, and verified unconditional refusal of `--execute`.
- Coverage includes fixed request order/config/privacy, true model-maximum cost reservations, output/thought accounting, sanitization/contract failure scope, WAV bounds/hash tampering/symlink rejection, paired noise/SNR, exact long padding, WER counts/format aliases/noise handling, and incomplete/duplicate pooled coverage.

No recognition accuracy, real API schema acceptance, provider latency, microphone quality, accent coverage, or production reliability is claimed. All scoring remains pending real results and manual review.

## Remaining gates

1. Human auditory audit and reference/alias corrections, logged before the final manifest freeze.
2. Explicit user approval of that final hash, fixed approval ID, at most twelve calls and up to $0.75. None exists yet.
3. Implement/review the live executor and durable grant safeguards before any paid request; recheck current prices and data-handling assumptions.
4. Only after those gates, run the bounded pilot. Keep app real transcription disabled until its separate adapter/safeguard/device-validation stage is approved and reviewed.
