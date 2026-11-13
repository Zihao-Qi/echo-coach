# B1b implementation contract / parallel ownership

Status: B1b implementation and required GPT-6.1-Sol/high review completed; this is the archived parallel-work contract, not an active worker assignment. Current implementation/evidence: `recorded-voice-ui.md`.

Scope: mock-backed recorded answers only. Opus-approved plan: `recorded-voice-plan.md`; B1a helpers and evidence: `recorded-voice-feasibility.md`. No real transcription adapter, paid model calls, cloud mutations, new dependencies, commits, or pushes.

## Ownership

- Gemini 4 Argon / LOW in Cursor: UI design, then implementation in `src/features/practice/PracticeWorkspace.tsx`, `usePracticeSession.ts`, `usePracticeAccess.ts`, and NEW recording UI/hook files under `src/features/practice/audio/`. Existing `normalize-recording.ts` is frozen (read/reuse only). Do not edit server/application/domain files, tests, docs, dependencies, or global styles. Parent owns tests and all backend files. No concurrent shared test servers.
- Lead: backend, browser/API/unit tests, integration, critique, and validation. Independent GPT-6.1-Sol/high review after integration. Opus remains architecture reviewer.

## Stable server contract

`GET /api/practice/access` retains its existing properties and adds optional `transcription: { mode: "demo" | "disabled", available: boolean, reason?: string }`. Missing property in legacy/test fixtures must gracefully default to demo availability, not crash. This stage's valid default is demo; explicit real or invalid configuration disables recording/transcription with an explanation, while typed practice stays usable.

`POST /api/practice/transcriptions`:

- Raw canonical mono 16 kHz 16-bit PCM WAV from existing `normalizeRecording()`, maximum 120 seconds, <=4 MiB. Browser supplies `Content-Type: audio/wav`; `Idempotency-Key: <UUID>`; `X-Transcription-Intent: start | recover`. Cookie auth; await existing `access.headers()` (no provider token).
- Both intents carry identical canonical bytes. `start` admits fresh IDs; `recover` is strictly lookup-only (never generates on a missing/expired request). Existing IDs replay/coalesce by status without new work; changed bytes under an ID conflict. No prompt/rubric/root ID is submitted to this endpoint.
- Success 200: `{ transcription: { id: string, text: string, mode: "demo", model: "demo-transcription-v1", expiresAt: string } }`. Demo text is a fixed fixture, not recognition of the user's speech. Client must visibly say so.
- Failure: `{ error: string, code?: string }`. Codes/status: `running` 409; `conflict` 409; `ended` 502; `expired` 410; `limited` 429; `disabled` 503; invalid audio/headers 400; missing owner 401; origin mismatch 403. Errors never contain transcript/audio or raw provider errors.
- Client first request uses a fresh UUID/start. Following ANY uncertain failure, only explicit Recover resends SAME UUID/bytes with recover intent. Expired/ended may offer an explicit new attempt with a new UUID, never silently restart. No automatic retries/polling. Client timeout 60 seconds, server-owned 45-second operation deadline; canceling a fetch does not cancel admitted server work.

## UI behavior / non-negotiables

- Explicit Record only, no microphone call on mount. Capture -> Stop -> explicit Transcribe (demo) -> editable review -> explicit Use confirmed transcript. Applying changes only the answer draft, NEVER evaluates. Keep typed draft intact until explicit replacement; existing nonempty draft requires confirmation.
- Read/reuse B1a normalization. Capture is bounded independently to 120s /10MiB encoded; Stop/Discard/unmount/device loss must stop all tracks, including permission results that arrive late. Release buffers/object URLs. Use generation tokens and captured effective target ID to prevent stale overwrites. Permission denial, unsupported APIs, malformed/empty/silent recordings, decoder error and empty/short transcripts get usable typed fallback.
- Support root and generated follow-up targets equally. Voice context is bound to effective target ID, not just root. Preserve existing separate typed drafts, immutable attempts, source/baseline lineage, saved recovery, snapshots and paging behavior.
- Busy states include requesting permission, recording, normalization, and transcription: lock ALL app navigation/selection and evaluation, including header links/keyboard, sign-out, track/root/follow-up changes, feedback history, and saved-answer recovery. Stop/Cancel/Discard controls remain usable where appropriate. After Stop/review, navigation must explicitly confirm discarding voice state (native confirm is acceptable initially); if declined, stay on target. Applying/discarding unlocks ordinary navigation. Browser closure cannot guarantee persistence.
- Integrate navigation guarding without breaking session submit guards. Clear state ownership: recording hook owns resources/async generation, session owns answer drafts/attempts; avoid a thousand-line workspace or duplicating draft maps. Typed submission disabled while voice state could be discarded accidentally, with explanation.
- Demo disclosure BEFORE capture/upload: no Gemini recognition occurs; returned text is an example. No Google-upload disclosure suggesting this demo contacts Google. Real mode is not enabled in B1b.
- Accessible labels/status, elapsed time, focus management, keyboard-operable controls, mobile fit. Preserve visual style; no whole-page redesign.

Gemini must first propose a concise design/state integration (read-only), stop for lead critique, then implement only owned paths after approval. Lead will author tests and request fixes for demonstrated defects. Do not read `.env*`, credential/session stores, real benchmark results or private recordings; do not run commands that load them, make model calls, start servers, deploy, or mutate Git. Read AGENTS.md and relevant installed Next.js client/server docs before source edits. Report owned changed paths and limitations; do not claim tests executed by another actor.
