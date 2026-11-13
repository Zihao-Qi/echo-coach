# Recorded voice: B1a feasibility checkpoint

## Result

**B1a passed for synthetic desktop Chrome capture on this machine.** At this historical B1a checkpoint it was transport groundwork, not an enabled recording/transcription feature. B1b has since added a [mock-backed recording UI](recorded-voice-ui.md); real recognition remains disabled. No coaching/transcription provider calls, physical microphone, private recordings, credentials, cloud writes, or deployment were used.

Approved architecture: [recorded-voice-plan.md](recorded-voice-plan.md). The subsequent B1b stage (Gemini-designed mock-backed recording/confirmation UI and protected transcription contract) is now complete; see [its checkpoint](recorded-voice-ui.md). Real provider selection/benchmarks still require separate authorization.

## Observed workload and results

Authoritative full-size artifact: ignored `benchmark-results/recording-1793283629574.json`.

- Apple M3 / macOS arm64, Node v26.8.1, installed Chrome 156.0.8078.73.
- One actual 120-second synthetic 440 Hz fake-microphone capture using Chrome MediaRecorder, not a fast-forwarded clock or injected finished recorder blob. Chrome reported 44.1 kHz, two-channel input; Opus/WebM capture was approximately 1.94 MB.
- Three normalizations of that same captured blob: **205.4 / 198.6 / 177.9 ms**, below the provisional 5-second gate. Includes browser decode/resample, stereo downmix, PCM encoding, and local canonical validation; excludes recording time, waveform probes, and HTTP round-trip.
- Each output: mono 16 kHz, 16-bit PCM, exactly 1,920,000 frames / 120 seconds / 3,840,044 bytes. The bounded Node HTTP reader independently validated the bytes.
- Beginning/middle/end windows retained 440 Hz and nonzero expected signal energy. An additional asymmetric stereo fixture checks independently expected mono sample values, rather than accepting selection of one channel.
- **104.86 MiB sampled positive per-process RSS growth**, below the 256 MiB gate. Counted the isolated Chrome browser, renderers, audio service, GPU, and other descendants. OS samples wholly inside the actual normalization work: **5 / 6 / 5**; maximum normalization-region sample gap approximately **76 ms**.

### Measurement interpretation

The gate sums positive per-PID growth against three idle per-PID median samples; new processes count in full. Exited spare renderers and shrinking processes cannot offset another process's growth. A simple net aggregate difference was rejected after a run showed spare-process exit masking allocation growth. Regression tests preserve the corrected calculation.

Requested sampling is 100 ms during capture and 20 ms around normalization; OS command overhead affects actual intervals. Samples record start/end wall-clock times and must fit inside browser-reported normalization-only windows. Before/after samples alone cannot pass the full-size gate. RSS sums double-count shared pages, exclude detached crash handlers, and are **not unique physical memory or a guaranteed instantaneous peak**. No claim of zero allocations when aggregate RSS shrinks.

This is one capture with three repeated normalizations, including allocator/cache effects, not an architecture comparison or population/device benchmark. Full application regression checks were running concurrently during this final measured capture; the report records system load. Results establish this bounded workload under those observed conditions, not universal latency/memory limits. Mobile, Safari, actual microphones, speech quality, and Google API acceptance remain unverified.

## Implementation boundaries

- `src/domain/audio/canonical-wav.ts`: shared limits, exact canonical-header/sample-length checks, digital-zero rejection, and PCM encoding. Quiet nonzero PCM is valid; no inferred speech/volume threshold.
- `src/features/practice/audio/normalize-recording.ts`: browser-only-at-call-time offline decoding to 16 kHz, two-channel maximum/downmix, bounded encoded capture size, and fixed output ceiling. Only a controlled capture source is supported; this is not a safe arbitrary-file decoding service. Up to 250 ms of final codec padding is allowed and clipped at the 120-second output limit.
- `src/infrastructure/http/read-audio.ts`: bounded streaming read, independent byte validation, active abort handling, nonblocking cancellation. It intentionally performs no auth or provider call; a future app route must supply those boundaries.
- `tests/audio/*` and `scripts/benchmark-recording.ts`: fixed test-module allowlist on an isolated ephemeral loopback server, synthetic audio only, blocked off-origin page requests, owned Chrome process sampling/cleanup. Nothing is mounted in Next.js or the practice UI.

## Review and failure evidence

Independent read-only reviews used explicit **GPT-6.1-Sol / high** Pi subprocesses. The final review session metadata confirms provider `openai-codex`, model `gpt-6.1-sol`, thinking `high`.

Review findings were addressed before completion:

1. Pending stream reads and uncooperative cancellation could hang. Both were reproduced as failing unit assertions, then fixed with active abort cancellation, no awaited source-cancel promise, listener/reader release, and regression tests.
2. Browser setup/processing could stall outside cleanup. Added per-operation and outer workflow deadlines, bounded shutdown and owned-process kill fallback.
3. A browser launch finishing after the outer deadline could escape cleanup. Late-acquisition guards now dispose the browser/connection immediately; a sampler stopped during startup cannot restart its loop later.
4. Before/after-only memory samples and a one-second waveform island could produce weak evidence. Added in-work coverage, multiple waveform windows, asymmetric downmix tests, and conservative per-process growth.

Fault injection on actual isolated Chrome verified both an unwrapped never-settling browser RPC and a browser acquired after the deadline: commands failed at the intended deadline, owned Chrome PIDs were gone, and temporary fixtures were removed. Final static review: **“No remaining concrete, actionable findings in the reviewed B1a scope.”** Reviewers did not execute tests; the lead owns the runtime evidence.

## Reproduce without model calls

```sh
npm run benchmark:recording -- --smoke  # 2 seconds; functional only, not the feasibility gate
npm run benchmark:recording             # actual 120-second capture and full gate
npm run test:unit
```

The harness defaults to installed Chrome; `PLAYWRIGHT_CHANNEL` may explicitly choose another installed Playwright channel. It does not load `.env.local`, ADC, provider SDKs, or application API routes. Generated tone fixtures are temporary and cleaned up; JSON reports remain under ignored `benchmark-results/`.

`--smoke --test-stall` and `--smoke --test-late-launch` intentionally exit nonzero to test outer-deadline cleanup. A short smoke can correctly report `sampledCredibly: false` and `feasibilityPassed: false`: millisecond work is too short for OS samples, and smoke is never accepted as a 120-second measurement.

Checkpoint checks: 64 unit/API tests passed; lint/TypeScript, production build, 3 HTTP integration tests, and 22 serial browser tests passed. No dependencies were added. Real recording UI, transcription endpoint/auth/budgets/replay, real-model quality, and durable voice history are not implemented by B1a.
