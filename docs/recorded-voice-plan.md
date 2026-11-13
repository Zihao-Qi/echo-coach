# Next-stage plan: validated coaching → recorded voice → durable history

Status: architecture reviewed and approved by Cursor / Claude Opus 5.5 300K High after three discussion rounds in Herdr pane `w3:p8`. User authorized implementation; **B1a and B1b are complete and independently reviewed**. Real-provider validation is next. Paid coaching/transcription benchmarks, credential changes, cloud writes, and deployment remain separately approval-gated.

## Baseline, roles, and boundaries

- Worktree: `/Users/Zihaoqi/Documents/echo-coach`, branch `reconstruction`, HEAD `94339f0799df4472f83e3c2a645bfa7041b7caba`. Extensive reconstruction work is uncommitted/untracked; assess current files, not HEAD alone. Preserve existing work.
- Implemented: typed coaching, immutable attempts, same-question retry comparison, one-depth follow-ups. Last observed checkpoint: 53 unit/API, 3 integration, 22 browser tests, lint/build/audit clean. New coaching prompt/schema still lacks real-provider validation.
- Local development stays login-free and memory-only, with bounded loopback Gemini access. Coaching remains Gemini 3.8 Flash / LOW. Existing Auth.js/Firestore integration needs real-user/cloud validation.
- Lead owns planning, integration, critical review, tests, and evidence. **Opus 5.5 in Cursor owns plan/architecture review.** Gemini designs/implements UI. **GPT-6.1-Sol / high independently reviews every implementation stage**; fix actionable findings and rerun affected checks before advancing.
- Preserve the original Cloud Run service and Firestore database. No IAM, billing, index/TTL configuration, deployment, or credential mutation without specific approval. Do not share `.env.local`, credential downloads, real answer history, or private recordings with reviewers.

## Goal and non-goals

Record an interview answer → editable verbatim transcript → explicitly use confirmed text in the current draft → separately submit for existing feedback/retry/follow-up. Text remains the authoritative coaching input. Recording/transcription never automatically evaluates.

Exclude Live/streaming interviews, TTS, accent/emotion/pronunciation grading, voice biometrics, arbitrary audio-file uploads, retained audio history, cloud deployment, and multi-round adaptation. Do not reuse legacy `/api/session/analyze`: it couples transcription, rewriting, images, and legacy persistence with inappropriate cost/ownership boundaries.

## Sequence and gates

1. **A preparation + B1a:** prepare the coaching validation manifest while testing audio normalization/validation without paid calls. No UI commitment before the transport spike.
2. **A execution:** only after new explicit spending/case authorization. A genuinely broken evaluator blocks relying on it; optional proposal-quality issues may instead be disclosed/disabled while mock-backed voice work continues.
3. **B1b:** mock-backed recording UI and safe transcription contract; independent GPT review.
4. **B2:** verify/select the real transcriber, explicitly approved audio benchmark and physical-microphone acceptance; independent GPT review.
5. **C:** separately verify Google login and existing Firestore; design durable hosted transcription controls. No hosted enablement/deployment as part of the local voice slice.

A spending approval is not needed for synthetic local tests, but is required before new real coaching or transcription calls. The completed ten-call coaching benchmark is not reusable authorization.

## Stage A — bounded real-coaching validation

Prepare a dry-run manifest against `question-aware-v5-follow-ups`, not the original benchmark unchanged. Proposed maximum: eight provider attempts, single concurrency, no SDK retries or hidden fallback. Recheck model metadata/pricing and obtain explicit case/call/budget approval before execution; request/output limits are not a billing hard cap.

Proposed chains:

1. Deliberately mistaken technical root → corrected root retry → answer to the first root's focused follow-up → retry that exact focused question (up to four calls).
2. Thin behavioral root containing natural disfluencies → focused follow-up answer (up to two calls). Review clarity, not transcription punctuation, fillers alone, or inferred vocal traits.
3. Unchanged-answer retry and instruction-injection probe (up to two calls).

Use synthetic, predeclared inputs and technical reference expectations. Check real structured-schema acceptance, quotations, personal-fact preservation, source/baseline separation, no claimed gains for unchanged text, optional proposal behavior, and no nested proposals.

If a root returns no proposal, **skip its dependent real-chain steps and leave their calls unspent**. Never inject a fixture into the real chain: `submitPracticeAttempt` requires the saved root's actual proposal. Synthetic child fixtures belong in separate deterministic tests, not evidence of organic follow-up generation.

Gate: inspect every result and record failures/usage. Eight cases do not establish broad accuracy. Any fix needs regression tests and independent GPT review.

## Stage B1a — transport/validation feasibility first, no spending

**Completed:** actual 120-second synthetic Chrome capture, three conversions in 178–205 ms, 104.86 MiB conservative sampled positive per-process RSS growth, strict HTTP validation, waveform/downmix checks, and failure/late-acquisition cleanup tests. Final independent GPT-6.1-Sol/high review found no remaining actionable findings. Current checkpoint: 64 unit/API, 3 integration, and 22 browser tests passed. Details and limits: [recorded-voice-feasibility.md](recorded-voice-feasibility.md). No app recording UI or transcription endpoint is enabled yet; Stage A's paid-validation manifest/execution remains pending.

Exercise synthetic audio through real Chrome MediaRecorder → Web Audio decode/resample → canonical WAV → strict server validator. Extend the existing Playwright fake-media setup with a synthetic audio file, including a 120-second capture. Spy on `getUserMedia` to prove no request on mount; pre-granted permission alone cannot prove that.

**Preferred candidate:** browser capture, then canonical mono 16 kHz, 16-bit PCM WAV. This bounds server parsing without prematurely adding FFmpeg/codec infrastructure. It trades client decode/memory/latency for a small server contract. Safari/mobile support is not assumed.

Measure normalization latency separately from recording time, buffer sizes, and browser-process memory delta against an isolated idle baseline; JS heap alone omits native audio memory. Sample OS-level memory during normalization, not just at completion; name the counted processes (at minimum the renderer and audio service), report the sampling method, and disclose whether shared/GPU/browser-process overhead is included. Provisional desktop-Chrome ceilings: normalization within 5 seconds and incremental peak browser memory within 256 MiB for the 120-second case. These are design gates, **not measured results**. Document measurement scope; if they cannot be met or credibly measured, stop for architecture review rather than silently relaxing them.

If the spike fails, compare AudioWorklet PCM capture (less decode memory, more custom audio code) against a bounded server decoder. Neither becomes an automatic fallback.

### Proposed upload contract

`POST /api/practice/transcriptions`: raw `audio/wav` body, UUID idempotency header, and explicit `start` versus lookup-only `recover` intent. No JSON/base64 or multipart at this boundary.

- Bound stream consumption before allocation/parsing: 4 MiB including header.
- Accept only canonical RIFF/WAVE PCM: mono, 16 kHz, 16-bit, aligned actual data length; validate chunk/header lengths and byte rate against the actual body.
- Compute duration from actual PCM bytes, maximum 120 seconds (3,840,000 sample bytes). Do not trust client duration, Content-Length, extension, MIME alone, or compressed-container metadata.
- Reject malformed/truncated/unsupported bodies, zero-length data, and exactly all-zero PCM before a provider call. No amplitude threshold or arbitrary one-second minimum that could exclude quiet/short meaningful speech.

## Stage B1b — user flow and application boundaries

**Completed, demo only:** recording/confirmation UI, strict owner/origin-protected WAV endpoint, bounded same-ID replay cache, legacy-route bypass closure, and failure/resource/navigation tests. Gemini authored UI; final independent GPT-6.1-Sol/high review is clear. Current checkpoint: 71 unit/API, 3 integration, 38 browser tests, lint/build/audit passed. See [recorded-voice-ui.md](recorded-voice-ui.md). No real transcription adapter is enabled. Shared paid-budget/capability-specific loopback extensions remain mandatory before B2 introduces one; serving demo fixtures did not broaden current paid evaluation access.

### User flow and resource ownership

- Record is explicit: requesting microphone → recording → stopped → transcribing → review/error. Show elapsed time, the maximum, Stop/Discard, and typed fallback. No permission request on mount.
- Keep the existing typed draft until **Use confirmed transcript**. Existing text requires explicit replacement; confirmation changes only the draft. **Get feedback** remains a separate paid action.
- Bind each recording job to its effective root/follow-up target ID and generation token. Never apply stale permission/transcription results to another question or newer recording.
- One recording/transcription at a time. Hard-lock app navigation during permission acquisition, recording, and transcription. After Stop, navigation may proceed through explicit discard confirmation, or apply the transcript first. Do not silently erase typed text.
- Stop microphone tracks on Stop/Discard/unmount, including streams returned after stale permission requests. Revoke object URLs and release buffers. Handle denied permission, missing/device-lost microphone, unsupported APIs, empty audio, decode failure, timeout, cancellation and quotas.
- Disclose before real upload that audio goes to Google; recording alone does not upload. Keep transcription verbatim, including disfluencies, rather than silently rewriting it. Demo text is visibly a fixture, not recognition of the recording.
- Empty recognition and transcripts below the existing 20-character submission minimum have edit/re-record states and never overwrite the typed draft automatically. Transcript maximum is 10,000 characters.
- Browser/tab closure cannot be fully prevented; drafts/audio are not durable. Do not claim physical-microphone support from fake media tests.

### Transcriber boundary

Add a small `AudioTranscriber` port, transcription workflow, demo adapter, and later selected Gemini adapter. Return `{text, model, usage}` from the call, not mutable evaluator-style instance usage. Do not change `AnswerEvaluator` or evaluation submission fields.

Transcription receives audio, not prior answers/rubrics/history. No rewriting, grading, tools, search, automatic evaluation, or provider fallback. It creates no `AnswerAttempt` before confirmed text exists. Do not add client-asserted “verified voice provenance” to saved attempts.

### Local replay cache, not a request-ledger framework

Adopt one bounded process-memory cache, keyed by owner + request UUID with audio SHA-256. No repository interface, durable leases, promise coalescing, or background job service. Each entry corresponds to an admitted attempt; entry capacity cannot exceed the process attempt ceiling. Use the same contract in demo mode for free tests.

- `running`: return 409, no new call.
- `completed`: return cached text/model/usage, no new charge.
- `ended`: after any provider error, return a terminal explanation; do not regenerate under that retained ID. The app cannot reliably know whether a failed provider request was billed.
- Same retained ID with different audio: conflict. Both `start` and `recover` carry the canonical bytes and pass the full bounded WAV validator before hash comparison. Starting an already retained ID follows the same running/completed/ended replay behavior, without reserving or charging again. The client never intentionally reuses an old UUID for a new start; after expiry the server cannot distinguish an old evicted UUID from a genuinely fresh one.
- Result TTL: 10 minutes; no audio stored in the cache. Clear expired payloads on access/admission and bounded expiry timers; no cryptographic memory-erasure claim.
- **Recover is lookup-only.** Expired/missing entries return 410 without a provider call, including after restart. This avoids silently charging an old-ID recovery when the cache is gone. A new paid attempt requires an explicit action, fresh UUID, and `start` intent. No automatic retry/polling or exactly-once claims across crashes.
- Do not pass client aborts through to an already started provider call. Use a server-owned deadline (proposed 45 seconds, verify SDK behavior), permitting a lost response to finish into the cache. Client wait deadline is longer (proposed 60 seconds). Server teardown can still lose work; this is not a durable background worker.
- Keep UUID + canonical audio bytes in browser memory until Apply/Discard. Recover resends the same identity/bytes only through explicit user action. Reload loses those resources, so no recovery across reload is promised.

Do not persist raw audio. Final edited text saves through the existing workflow. Logs must exclude audio, transcript/cache contents, and raw provider errors.

### Independent modes and access

Proposed local matrix: all rows use demo auth, memory storage, canonical loopback `AUTH_URL`, and a localhost-bound server. These are not changes made to `.env.local`.

| Coaching | Transcription | `USE_MOCK` | `ALLOW_LOCAL_GEMINI` | `PRACTICE_TRANSCRIPTION_MODE` | `ALLOW_LOCAL_TRANSCRIPTION` |
| --- | --- | --- | --- | --- | --- |
| Mock | Demo fixture | `true` | `false` | `demo` | `false` |
| Real | Demo fixture | `false` | `true` | `demo` | `false` |
| Mock | Real | `true` | `false` | `gemini` | `true` |
| Real | Real | `false` | `true` | `gemini` | `true` |

Real coaching retains its explicit model/key requirements. Real transcription requires separate `GEMINI_TRANSCRIPTION_MODEL` and a private key. Unset transcription mode defaults to demo. Invalid modes, real mode without its opt-in/model, or transcription opt-in with demo mode fail closed. An audio-only benchmark uses row three, so it does not spend coaching calls.

- Owner checks and strict canonical same-origin validation apply to **every** transcription write, including demo-cookie requests. Existing `requirePracticeWriteOrigin` skips demo and otherwise requires Google configuration; it is not sufficient. Use a narrow origin check independent of Google credentials, while retaining the stronger Google write policy. Parameterize local loopback checks by capability instead of invoking the existing helper hard-wired to `ALLOW_LOCAL_GEMINI`. Preserve evaluation's existing negative tests.
- **Legacy bypass closure:** update `src/proxy.ts` and tests to block legacy real routes whenever either local paid opt-in is set, or an explicitly supplied transcription mode is anything other than `demo` (including invalid values). Production stays blocked. The current proxy only recognizes the coaching flag; transcription-only mode must not reopen uncapped legacy Chirp/fallback/rewrite/image calls. Test `NEXT_PUBLIC_USE_MOCK` legacy precedence too.

### Budget and hosted gate

Use one atomic aggregate/per-feature reservation for actual calls across cookies/tabs/endpoints: reserve only when `start` admits an ID absent from the cache; `recover` never reserves. Check concurrency, cooldown, aggregate capacity, and feature capacity before incrementing anything. Quota denials do not consume reservations; provider errors do; replays do not. Keep the aggregate process ceiling at the existing ten attempts. Feature caps are constants bounded by that ceiling; choose the initial transcription cap after model/pricing approval. No counter framework/config explosion. Feature-specific errors must not tell an audio-only user “your answer is saved.”

Hosted real transcription returns a **hard-coded 503 in B1/B2 regardless of flags**. Later enablement requires a separately reviewed code change with authenticated durable dedupe/quota/leases, not a configuration flip. Memory guards are not multi-instance controls.

Gate: Gemini supplies UI; lead checks design, draft/focus/keyboard behavior, resource cleanup, mock-backed API/browser tests, and typed/root/follow-up regressions. Independent GPT review before B2.

## Stage B2 — choose and validate the real transcriber

**Research/proposal complete, execution not approved:** current official docs and read-only model metadata were checked; Opus 5.5 reviewed and approved the [bounded transcription pilot plan](transcription-benchmark-plan.md). It proposes six paired synthetic fixtures, at most twelve requests, and up to $0.75 allowance (ordinary usage estimated around $0.03). User-authorized offline preparation and deterministic review/dry run are now complete: [preparation checkpoint and listening links](transcription-pilot-preparation.md). Six WAVs were generated locally, with human audit still pending. The runner is intentionally offline-only and refuses `--execute`; a live executor/journal must be implemented and reviewed separately. The user's auditory reference audit must precede final frozen-manifest paid approval. No audio was uploaded, no inference was called, and the app's real-transcription disable remains unchanged.

Gemini 3.5 Transcribe is a **candidate, not a chosen/implemented winner**. Inspect current official API/SDK/model docs and account availability first. Verify WAV support, limits, latency, pricing, verbatim behavior, deadlines, and data handling. Do not retain Chirp 3 or general-model fallback automatically.

Prepare a small explicitly approved audio benchmark with synthetic or consented gold transcripts: technical identifiers/numbers, behavioral speech, disfluencies, silence/noise, and spoken instruction-like content. Measure word/term errors, hallucinated words, latency and usage. No calibrated confidence, accent, or device claims without evidence.

Transport feasibility belongs to B1a; B2 adds provider and physical-device evidence. Bound adapter deadline, output, retries (none), concurrency and spend before a paid request. Manual acceptance: actual microphone → recognition → user correction/confirmation → unchanged final saved text → feedback → original/focused retry. Requires user participation and consent; mocks do not prove recognition or microphone quality.

## Stage C — verify private durable history, separately

Does not block local development. Verify Google OAuth with mock evaluation + memory first; the current owner helper still requires `GOOGLE_CLOUD_PROJECT`. Then, with authorization, use ADC/Firestore test writes in an isolated documented namespace in the existing database. Do not rewrite the private environment wholesale or turn login on for everyday development without agreement.

Check saved-before-generation failure/recovery, owner/source/baseline isolation, pagination, restart persistence, allowlist revocation and two-device access. Before future hosted voice, design/test durable transactional request claims and quotas plus explicit expiry/deletion behavior; do not assume a TTL policy exists. No IAM/index/TTL mutation, original prototype data changes, paid infrastructure, or deployment without approval. Cloud release is a separate decision.

## Retained acceptance evidence

- Parser/API: strict byte/duration/zero rules; all four modes and invalid flags/models; legacy blocking per capability; identity/hash conflicts; running 409; completed replay; ended/no regeneration; expired/restarted lookup-only recovery 410; owner/origin isolation; atomic budgets/no charge on denial; no sensitive logging.
- Browser: no microphone call on mount; fake-audio capture/normalization measurements; permission denial/device loss; stale stream/result cleanup; maximum duration/oversize; isolated root/follow-up drafts; explicit replace/discard; empty/short text handling; no automatic evaluation; keyboard navigation locks; client abort not aborting a started mock-provider call followed by recovery; unmount cleanup, mobile overflow and typed fallback.
- Preserve the 53-unit/3-integration/22-browser baseline and add tests rather than replace/weaken it. After each implementation stage: lint/build, relevant/full tests, independent GPT-6.1-Sol/high review, fixes and rechecks.
- Stop for unsupported model/transport, unacceptable or unmeasurable memory/latency, ambiguous spending authorization, microphone/consent/ADC/IAM gaps, or required cloud changes. Finish independent work and report the precise blocker, not a mock-based success claim.

## Architecture discussion record

Opus reviewed the draft and relevant live code in existing Cursor pane `w3:p8`; the pane visibly reports **Claude Opus 5.5 300K High**. Review was planning/read-only; no implementation or tests were run by Opus.

- Round one: conditional approval; identified legacy-route bypass and undefined independent modes, origin-helper coupling, an oversized local ledger abstraction, late normalization testing, disfluency handling, and conditional-chain budgeting.
- Lead inspected the referenced proxy/runtime/access/evaluate paths and confirmed the code-level gaps. Accepted mode/origin/proxy fixes, normalization-first sequence, verbatim/disfluency tests, conditional skips, and atomic counters.
- Lead challenged removing recovery entirely: single-flight/cooldown cannot recover a completed transcription after a lost response. Proposed a bounded map rather than a repository/lease abstraction.
- Round two: Opus accepted the map, subject to an independent server deadline, longer client deadline, explicit retained identity/bytes, and terminal provider-error handling. Also accepted exact-zero-only silence rejection rather than a volume/minimum-duration heuristic.
- Additional lead refinement for final review: recovery is explicitly lookup-only so expiry/restart never silently turns recovery into a newly charged generation. Fresh paid work is a separate explicit start.

- Round three: Opus reread the revised document and stated: “I approve the plan as written; nothing blocks it.” It accepted lookup-only recovery and requested four nonblocking clarifications: replay behavior for an existing start ID, full validation of recovery bytes, start-only budget reservation, and named OS-level renderer/audio memory sampling. Those are incorporated above.

Final disposition: architecture approved, with no remaining blocking review findings. Following user go-ahead, B1a feasibility and B1b's mock-backed recording/confirmation UI and protected transcription contract completed; independent GPT-6.1-Sol/high reviews are clear. Next is explicitly authorized real-provider validation (A/B2), with physical-microphone acceptance and paid safeguards before any real transcription enablement. Stage A paid execution separately requires approved cases, call limit, and spending allowance; no paid coaching/transcription benchmark has run.
