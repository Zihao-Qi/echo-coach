# Reconstruction implementation status

Branch: `reconstruction`. Firebase Management, Identity Toolkit, and Cloud Resource Manager APIs were enabled with approval, but Firebase association/pricing confirmation was not completed. User selected Auth.js instead. No new database, deployment, or IAM binding was created. The existing Gemini key was imported privately with user authorization. User subsequently approved a $1 allowance and Gemini 3.8 Flash / LOW; ten comparison calls completed with an estimated token-rate cost of $0.029198 (not an invoice).

## Implemented locally

### Experience

- Redesigned home at `/`, with track-specific entry points.
- New `/practice` workspace: six editorial starter questions across behavioral, SWE, and AI/ML new-graduate practice.
- Progressive hints, typed submission, structured feedback, optional technical suggested answers, immutable retries, and saved-answer recovery.
- Retry comparison shares the existing evaluation call: same-question owner-scoped baseline, before/after evidence, improvement/regression/neutral changes, next focus, historical feedback selection, and independent baseline retrieval across paginated history. See `retry-comparison.md` for review and limits.
- Optional targeted follow-ups share the root evaluation call. One follow-up depth, separate drafts, source-specific retry comparisons, parent context, historical snapshot reopening (including removed roots), saved failure recovery, and pending-safe navigation are implemented. Gemini 4 Argon / LOW designed and implemented the UI; lead critique and independent GPT-6.1-Sol/high reviews drove corrections. See `follow-up-design.md`.
- Original voice prototype retained at `/legacy`; existing session/recap routes retained.
- New home/practice isolated from legacy audio preloading.
- Responsive desktop/mobile layout; screenshots captured and inspected.
- Recorded-answer demo UI: explicit capture/stop, canonical WAV conversion, editable fixed demo transcript, confirmed replacement, and separate evaluation. Root/follow-up drafts and historical retry baselines are preserved; late permission/recorder callbacks and navigation are guarded. This does not recognize speech yet. Gemini authored UI; independent GPT-6.1-Sol/high review is clear. See `recorded-voice-ui.md`.

### Architecture and reliability

- Plain domain types, evaluator/repository ports, application workflows, and separate demo/Gemini/Firestore adapters.
- Submission persisted before evaluation starts. Failed evaluations preserve the original answer.
- Validated submission UUID serves as an idempotency key: repeated requests return the same attempt; conflicting evidence is rejected.
- Owner/question checks on retry references and follow-up sources. Server-owned immutable question snapshots distinguish root/source lineage from same-question retry baselines; legacy recovery initializes missing snapshots without overwriting completed history.
- Evaluation leases, transactional daily quota reservation, and partial-field Firestore updates rather than replacing submitted evidence.
- Pagination ordered by submitted timestamp plus document ID.
- Runtime request/output validation, bounded request streams, exact quotation checks, and model/prompt/rubric provenance.
- Gemini evaluator configurable via `GEMINI_EVALUATION_MODEL`; user selected Gemini 3.8 Flash / LOW. Current official model/pricing research, dry-run benchmark, and bounded ten-call smoke results are documented in `gemini-evaluation.md` and `gemini-smoke-review.md`. New retry/follow-up prompt quality remains unverified against the real provider.
- Criterion-based feedback covers accuracy, reasoning, structure, and evidence. A shared structured schema, exact quotation checks, capped output, disabled SDK retries, and token-use provenance are implemented.
- Recorded-voice B1a groundwork is complete: browser capture normalization to canonical mono 16 kHz PCM WAV, strict byte/duration validation, abort-safe bounded HTTP reading, and an isolated synthetic-audio measurement harness. An actual 120-second Chrome capture converted in 178–205 ms with 104.86 MiB conservative sampled process growth. That historical feasibility stage enabled no app endpoint. B1b now adds an owner/origin-protected demo endpoint and bounded ten-receipt/ten-minute process-memory replay cache; real transcription remains hard-disabled. See `recorded-voice-feasibility.md` and `recorded-voice-ui.md` for measurement and implementation limits.

### Access and storage

- Google sign-in integration using Auth.js, with verified-email allowlisting at sign-in and on every protected request.
- Encrypted HttpOnly session cookies, canonical-origin write protection, and eight-hour JWT sessions. Sign-out clears the cookie but does not revoke a stolen copied JWT; removing the account from the allowlist blocks practice API access immediately.
- Stable storage owner IDs use Google subject IDs. The standalone Google Cloud Firestore SDK uses ADC/IAM; Firebase association and Auth SDKs are not required.
- User-created Web OAuth credentials were imported into private ignored `.env.local`; JSON project/origin/callback and local provider callback were verified without exposing secrets. Actual Google login remains a user verification step.
- Authentication, model execution, and storage modes are independent. Current local settings: login-free local development + real Gemini 3.8 Flash / LOW + memory storage. OAuth credentials remain configured for later use; Firestore is not called. Hosted real model evaluation requires Google auth and Firestore storage. Login-free testing has a separate explicit development-only loopback exception: 10 provider attempts per process across all demo cookies, one active request, cooldown, and 4096 output tokens. This exception is now enabled locally following the user's model/budget approval. The reused key remains in private `.env.local`. Ten real smoke calls succeeded; the completed automated comparison is separate from user-initiated local submissions.
- Auth.js v5 Next.js integration is pinned to prerelease `5.0.0-beta.32`, which supports Next.js 16; changes require regression testing.
- Demo mode uses an expiring signed HttpOnly cookie and owner-scoped server memory. It survives browser refresh on the same server but is not durable/cross-device.
- Legacy real-mode API paths blocked in production because their data is not owner-scoped. They are also blocked when bounded local Gemini testing is enabled, preventing uncapped legacy voice/image generation. Local legacy real mode outside that explicit testing mode is retained.
- Real daily evaluation quota defaults to 20 provider attempts per account, capped at 100 by configuration. Failed generation consumes a reservation. This is a request budget, not a dollar-denominated billing cap.
- Dependency audit reports zero vulnerabilities at this checkpoint.

## Validation

- 81 unit/API tests passed: the previous 71 checks plus 10 offline transcription-pilot preparation tests. The earlier 7 transcription cache/API/access/deadline/mode tests remain. The earlier audio transport and measurement-lifecycle coverage remains. New coverage includes literal canonical headers, signed PCM samples, strict duration/body bounds, quiet nonzero audio, stalled-read abort, uncooperative cancellation, conservative memory accounting, host deadlines, late resource disposal, and sampler shutdown during startup.
- 38 browser tests passed serially (22 previous + 16 voice cases; detailed voice coverage in `recorded-voice-ui.md`). The previous cases include: four legacy tests plus practice/retries/criterion rendering, failure recovery, API/session isolation, redesigned home/track navigation, and mobile layout. Retry comparison tests also cover branches, recovered older attempts, equal timestamps, baseline loading/retry, and older saved records. Seven follow-up tests cover isolated drafts, first-child/retry payloads, pending navigation including header keyboard activation, failed recovery across source switches, legacy feedback, removed roots, independently fetched historical snapshots, and saved-child recovery. Follow-up desktop/mobile captures were inspected; the additional mobile overflow assertion and focused screenshot run passed. An earlier parallel run timed out in two legacy voice-start tests; serialization passed without relaxing assertions.
- ESLint, production build/TypeScript checks, and `git diff --check` passed.
- Browser tests used installed Chrome through `PLAYWRIGHT_CHANNEL=chrome`; standard Playwright Chromium installation is unavailable in this environment.
- Auth.js session handler tests validate encrypted cookies and reject expired/wrong-key cookies. Three HTTP integration tests use a real Next.js production server to exercise the actual session-reader path, allowlist, and write-origin protection with synthetic identities only, including rejection of the local Gemini exception in production.
- Local API tests intercept the Gemini network boundary: quota failures consume the shared limit, SDK does not retry a 429, duplicate completed submissions do not generate, and multiple cookies share the cap.
- Independent read-only review found no actionable findings in the bounded Gemini slice; real provider schema acceptance and coaching quality remain unverified. A subsequent user-approved benchmark made ten calls on Gemini 3.8 Flash / LOW. Initial technical/behavioral rewrite errors were found and addressed with prompt changes and deterministic behavioral guards. See `gemini-smoke-review.md` for assistant-inspected results; broad coaching accuracy is not established.
- Credentialed Gemini generation and structured output succeeded in the ten-case smoke run. The newer retry/follow-up schema and prompt have not received additional paid coaching calls; deterministic tests do not establish real-provider acceptance or coaching quality. Firestore integration, reconstructed Cloud Run deployment, cross-device durability, and physical-device voice remain unverified.
- Follow-up backend and UI stages each received independent read-only GPT-6.1-Sol/high review. Actionable snapshot/recovery/navigation findings were fixed and regressions reproduced in tests before final re-review. Final reports found no remaining concrete actionable issues in scope. The final UI review's Pi session metadata confirms `openai-codex` / `gpt-6.1-sol` and `high`; reviews were static, with execution checks owned by the lead.

- Recorded-voice B1a also received independent GPT-6.1-Sol/high review. Findings about stalled operations, cancellation, late browser acquisition, and measurement correctness were fixed, reproduced with targeted tests/fault injection, and re-reviewed. Final report found no remaining concrete actionable findings. No paid coaching/transcription calls or cloud changes were made.

## Next checkpoint and setup dependency

B1b's mock-backed recording → transcript review/confirmation → existing answer workflow is complete. Offline transcription-pilot preparation is also complete and independently GPT-6.1-Sol/high reviewed: six synthetic WAVs, provisional references, hash-validated manifest, cost/request descriptors, scoring helpers, and a dry-run runner that refuses execution. See `transcription-pilot-preparation.md` for local listening links. Next is the user's auditory reference audit, then frozen-manifest case/call/budget approval and separately reviewed live-executor safeguards before real-provider validation. Physical-microphone acceptance remains later; no paid transcription benchmark has run. Shared paid-budget/capability-specific loopback changes must precede any real transcription adapter, with hosted real voice still disabled. Gemini remains UI designer/implementer; Opus reviews architecture; GPT-6.1-Sol/high independently reviews implementation stages. See `recorded-voice-plan.md`.

Reuse verified existing Google Cloud project `echo-490312` and its Firestore database. User selected Auth.js; Codex reported no Firebase pricing/legal acceptance and released the browser task. The Google Web OAuth client, exact callback, local OAuth/session secrets, and email allowlist are configured. Local Gemini practice is available with login off. The next infrastructure checkpoint is actual Google sign-in verification and ADC/Firestore setup, without changing the original deployment. Follow `docs/cloud-setup.md`; do not provision paid infrastructure silently.

Validate the real authenticated save/evaluate/review flow across two devices before declaring the cloud release ready. Benchmark current Gemini model candidates before claiming coaching quality.

## Remaining product scope

- Real transcription behind the implemented demo recording/confirmation UI, physical-device validation, and genuine Gemini Live interviews.
- Structured practice rounds, Momentum Card redesign, project/story bank, multi-round adaptive interviewing beyond the implemented one-depth follow-up, review queue, sourced resource ingestion, and preparation plans.
- Real-model quality validation of the new retry/follow-up prompt and schema; implementation and simulated-provider checks are complete, but no additional paid coaching calls were made. Comparisons are qualitative model guidance, not calibrated progress/hiring scores. Separate user-requested Gemini 4 UI design/implementation calls are recorded in `follow-up-design.md`.
- Legacy persistence/lifecycle findings remain in the preserved prototype; production real access is disabled rather than presenting that path as secure.

Local preview: `npm run dev`, then visit `/` or `/practice`.
Checks: `npm run test:unit`, `npm run test:integration`, `npm run lint`, `npm run build`, and `PLAYWRIGHT_CHANNEL=chrome npm run test:e2e` when Chrome is installed. Otherwise install Playwright Chromium and omit the channel override.
