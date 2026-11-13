# Echo Coach: current implementation review

## Scope and evidence

Repository: https://github.com/Zihao-Qi/echo-coach
Reviewed commit: `94339f0799df4472f83e3c2a645bfa7041b7caba`.
Review checkout: `/tmp/echo-coach-review.W3kxVL`.

Read the complete coaching provider, Gemini and mock adapters, all API routes, persistence and cache helpers, interview configuration/types, application pages, browser tests, and deployment configuration. No application source was changed. Dependencies were installed only in the temporary checkout.

Checks:
- `npm ci`: completed.
- `npm run lint`: passed.
- `npm run build`: passed, including TypeScript checking.
- `npm run test:e2e`: blocked before test execution by missing Playwright Chromium. Two browser installation attempts timed out after download progress reached 100%; browser assertions remain unverified.
- `npm audit`: reported 15 dependency vulnerabilities (1 low, 3 moderate, 9 high, 2 critical). These are registry advisory results, not proof that every issue is exploitable here. Next.js is a direct dependency flagged critical; updates require compatibility checks, not a blind force fix.

No credentialed Gemini, Chirp, Imagen, Firestore, Cloud Run, or physical-device checks were run. The README's prior real-mode smoke-test claim is not independently verified by this review. Current model availability and pricing were not researched.

## What the product actually does

1. Home requires microphone permission, even in mock mode.
2. `POST /api/session` returns a mock bootstrap or a one-use Gemini Live credential.
3. A browser adapter creates a timestamp-based session ID. The provider submits session metadata to the backend asynchronously.
4. Real mode opens Gemini Live, but asks questions using the separate `/api/session/speak` TTS endpoint.
5. Answers are recorded with MediaRecorder and sent as base64 audio to `/api/session/analyze` after clicking the coaching button.
6. Analysis transcribes through Chirp when a Google Cloud project is configured; otherwise, or on failure, it uses Gemini audio transcription.
7. Two parallel Gemini calls produce a rewrite and an encouragement-card specification. The server also starts image generation in the background.
8. The client preloads rewritten-answer speech, a follow-up question, and its speech. Sessions are capped at three questions.
9. Ending produces a recap centered on the latest coached answer. The image can come from the first coached answer. Local storage is updated immediately; server recap persistence happens later in a detached client task.
10. Home merges backend history with local snapshots. Recaps can reload; active sessions cannot be restored after refresh.

### Live conversation versus Live connectivity

`src/lib/gemini-coach.ts` opens a Live session, handles incoming audio, and has a text-based `promptAgent` method. However:
- No microphone audio is streamed to Gemini Live; there is no `sendRealtimeInput` call.
- The real-mode provider uses HTTP TTS instead of `promptAgent` for questions.
- The Live instruction explicitly tells the model to stay silent unless instructed.
- Incoming Live audio is buffered until generation/turn completion rather than played as a continuous stream.

Therefore, the current user-facing path is turn-based recorded-answer coaching with a mostly unused Live connection, not an end-to-end live conversational interviewer. Live setup is nonetheless a useful starting point, including short-lived credentials.

## Strengths worth preserving

- Working Next.js/TypeScript application foundation with a successful production build.
- A clear question → answer → coaching → playback → recap interaction.
- Mock mode and browser-flow tests that avoid cloud dependencies.
- Short-lived browser credentials rather than exposure of the permanent Gemini key.
- Microphone permission messaging, audio interruption, cancellation/run guards, prefetching, TTS quota fallback, and image fallback.
- Existing history/recap UX and containerized deployment.

These are reasons to migrate incrementally rather than discard everything.

## Findings, in priority order

### P0: hosted access needs protection

All API routes lack application authentication, ownership checks, and application-level rate limiting. `/api/history` lists a shared session collection; recap GET/POST accepts a caller-supplied session ID. Model endpoints can be called independently of a legitimate session. IDs use `Date.now()` rather than an opaque random identifier.

Before exposing a real-mode presentation deployment: add sign-in, owner-scoped data access, runtime request schemas, payload limits, and budget/rate controls. Cloud service-account authentication protects backend-to-Google calls; it does not authenticate app users.

### P1: the coach is a rewrite engine, not yet an interview evaluator

In `src/app/api/session/analyze/route.ts`, `analyzeRewrite` receives only the transcript, not the interview question. There are no technical correctness rubrics, competency criteria, evidence references, or uncertainty handling. The prompt does not explicitly prohibit invented experience. The model can also replace the field labeled original transcript.

Even a stronger model cannot compensate for missing task context. Preserve the source transcript and evaluate with the question, target role, competency, rubric, and relevant context. Separate evaluation from optional rewriting.

### P1: Firestore recap updates replace session metadata

`src/lib/server/session-store.ts` sends document PATCH requests without an `updateMask`. `persistRecapRecord` writes a partial session summary through that same helper. Firestore's unmasked update replaces document fields, so original metadata such as `startedAt`, `scenario`, and `createdAt` can be removed. The history mapper's defaults conceal some consequences.

Fix through explicit field updates or transactional repository methods. This is a code/API-semantics finding; it was not reproduced against a credentialed Firestore database.

### P1: durability is best-effort and split across browser/server

Session creation is fire-and-forget and does not check HTTP status. Analysis persistence errors are logged while success is returned. Recap persistence is delayed until the image workflow completes and runs in a detached browser task; closing the page can prevent completion. Missing `GOOGLE_CLOUD_PROJECT` silently selects an in-memory store even in real mode.

Make durable session and attempt writes authoritative. Save the learning recap before optional assets. Distinguish demo storage explicitly from durable production storage. Move noncritical background work to a durable mechanism if needed.

### P1: retries are not first-class attempts

Client history replaces previous turns with the same question index, whereas backend persistence appends timestamp-named turns. Mock analysis returns before persisting a coaching turn. Thus local UI, mock storage, and real storage have different semantics. Firestore loads only 12 turns, without pagination.

Introduce stable question and attempt IDs. Keep attempts immutable and associate evaluations with them. This enables retry comparison and trustworthy progress.

### P2: browser orchestration has too many responsibilities

`src/providers/CoachProvider.tsx` has 1,277 lines covering recording, playback, API calls, caches, session transitions, cancellation, and persistence. Session/status state is duplicated in React and adapters. Root provider mount preloads TTS even before starting practice.

Extract media capture/playback hooks, typed API clients, and a session reducer/controller. Keep interview decisions server-side and independent of React or Google SDKs. A large provider is a maintenance issue, not sufficient justification for microservices.

### P2: error and lifecycle gaps

The session page does not consume/render the context's detailed error object, so useful analysis/recording/TTS errors can be invisible. Provider cleanup stops recording and practice audio but does not close the Live connection or abort analysis. Late asynchronous recap/prefetch tasks can update state after a new session starts because not all work is guarded by session identity.

Audio snapshots depend on `requestData()` plus a fixed 150 ms wait. Stop clears the data callback immediately, risking loss of late chunks; independent repeated WebM segments need browser validation. Browser speech fallback forcibly cancels after at most five seconds, potentially truncating longer answers.

Add event-driven recording finalization, session-scoped cancellation, explicit resource disposal, and visible recoverable errors. Validate Safari/iOS and Android rather than infer support from desktop mocks.

### P2: optional imagery affects critical-path reliability

Analysis waits for both the rewrite and image-spec extraction; image-spec failure therefore fails answer coaching. The global card cache is unbounded and returns an existing session's card even when request content changes. In-memory caches are process-local and cannot deduplicate across Cloud Run instances. Server-side detached image prewarming is not a durable job.

Make encouragement imagery optional, bounded, and isolated from coaching success. Store generated assets outside database documents when appropriate.

### P2: tests validate a narrow demo

The suite contains three mock-flow tests and one screenshot-capture test. The screenshot test does not compare against a visual baseline. No unit, API, persistence-contract, real media, authenticated-access, or coaching-quality evaluation tests are present. Local storage lets the refresh test succeed without proving cross-device persistence.

Keep the flow tests; add rubric fixtures, provider contracts, persistence/update tests, access-control tests, failure-path tests, and browser/device coverage.

## Revised architecture recommendation

Retain Next.js and use a modular monolith:

- **Interview domain:** question, competency, rubric, attempt, evaluation, interview session.
- **Application workflows:** start practice, submit attempt, evaluate answer, retry, choose follow-up, complete interview.
- **Ports/adapters:** Gemini reasoning, Gemini Live, transcription, speech, repositories, future knowledge retrieval.
- **Web layer:** thin validated API handlers and focused React features.

Structured practice and live interviewing should share this domain. Treat workflow steps as typed, testable capabilities; there is no demonstrated need for a multi-agent framework yet.

Do not require a database migration merely to improve code boundaries. Firestore is viable for a small personal app once update/durability issues are fixed. Postgres is attractive for richer attempt/competency analytics and source relationships, but adopting it is a separate infrastructure decision with migration cost.

## Proposed sequence, pending approval

1. Confirm existing deployment/data, target seniority, and features to preserve.
2. Bring the repository into the working directory on a reconstruction branch.
3. Add regression tests around persistence and lifecycle risks; address hosted security and dependency updates before real deployment.
4. Extract application/domain boundaries while preserving the current flow.
5. Add SWE/AI-ML questions, question-aware evaluation, immutable retries, and text submission alongside recorded voice.
6. Benchmark currently available Gemini reasoning/transcription/speech models on representative answers.
7. Add genuine live conversation with streamed input, transcript capture, interruption handling, and post-interview evaluation.
8. Add sourced knowledge ingestion and personalized preparation workflows.

## Decisions to confirm

- Is there an existing Google Cloud deployment and Firestore history that must be retained?
- What seniority should initial questions and rubrics target?
- Should the current visual design and Momentum Card remain, or may imagery become optional while coaching becomes the focus?
- Prefer keeping/fixing Firestore initially, or deliberately migrating to managed Postgres for longer-term analytics?
