# Recorded answers: B1b demo checkpoint

## What works

At `/practice`, the optional recording panel supports:

1. Explicit Record → Stop, with a 120-second/10 MiB capture ceiling and typed fallback.
2. Browser conversion to bounded canonical mono 16 kHz PCM WAV.
3. **Transcribe (demo)**: sends WAV to this app for validation and returns a fixed example, **not recognition of the recording**. Audio is not sent to Google.
4. Editable review, then explicit **Use confirmed transcript**; replacing a nonempty draft requires confirmation.
5. Separate **Get feedback**. Neither recording, transcription, nor applying text automatically evaluates.

Root/follow-up drafts and retry/source lineage remain separate. Permission/capture/conversion/transcription lock navigation and evaluation; retained voice state requires explicit discard before changing context. Clicking an already-active sidebar entry is a no-op, so historical feedback/baselines are not silently reset. Empty/short recognition states remain editable without overwriting typed text.

**This stage does not implement speech recognition, Live interviews, or voice-quality assessment.** Real transcription is hard-disabled in every environment, including with opt-in flags. Existing local coaching may independently use Gemini only on explicit answer submission, according to its existing guard.

## Responsibility and review

Gemini 4 Argon / LOW designed and implemented the UI through Cursor in Herdr pane `w3:p9` (`echo-voice-gemini`). The lead approved the design with corrections, implemented backend/tests, inspected source and desktop/mobile captures, and retained ownership of integration. Opus 5.5's prior architectural plan remains the design basis.

Independent GPT-6.1-Sol / high reviewed the bounded B1b implementation and subsequent fixes. Pi session metadata records `openai-codex`, `gpt-6.1-sol`, `high`. The first review exceeded the harness wait limit while reading; it resumed the same session rather than being misrepresented as a completed review. Final report: **“No remaining actionable findings in this bounded static review.”** Reviews were read-only/static; runtime checks belonged to the lead.

Review was consequential, not an approval-only pass:

- Lead caught a generic-503 path that discarded the request ID while exposing a Recover button; uncertain 502/503 responses now preserve identity and recover cached work.
- Recorder error followed by Stop cannot resurrect failed capture state.
- GPT found a queued old Stop callback could clear a newer capture's refs/timers and orphan its microphone. A controlled browser test reproduced the failure before Gemini added generation/target/recorder-ownership checks before shared mutations and detached handlers even for inactive recorders.
- GPT found direct feedback selection, then same-target sidebar actions, could change the retry baseline with retained voice state. Root and saved-follow-up regressions failed before fixes; navigation is now guarded and active entries are true no-ops.
- Lead corrected privacy copy: WAV goes to this app for validation; the UI no longer claims that no upload occurs.

## Server boundary and privacy

`POST /api/practice/transcriptions` requires an owner session and canonical Origin even in demo mode. It accepts raw canonical WAV, UUID `Idempotency-Key`, and explicit `X-Transcription-Intent: start | recover`. Strict B1a byte/duration validation applies before adapter work. No prompts, rubrics, root answers, or history are sent to transcription.

A bounded process-memory cache retains at most ten receipts globally for ten minutes, not raw audio. Capacity errors do not start adapter work. Same owner/UUID/hash replays completed results, returns 409 while running, or returns a terminal ended response; changed bytes conflict. **Recover is lookup-only**: absent/expired/restarted receipts return 410 and never generate. New work needs an explicit fresh-ID start. The demo cache does not consume the real coaching provider-attempt budget.

A server-owned 45-second deadline bounds admitted work; client wait is 60 seconds. Client abort does not cancel admitted server work, and completed work remains recoverable until expiry. This is not durable/exactly-once processing across crashes. Browser reload loses voice buffers/identity; only explicitly submitted final text enters attempt history. No raw audio is stored persistently. Audio/transcript contents and raw adapter failures are excluded from logs.

The route has only a demo adapter. Selecting `gemini`, invalid configuration, or inconsistent flags returns disabled status; typed practice remains usable. The legacy proxy blocks real voice/image routes for transcription-only opt-ins/invalid selections as well as existing evaluation opt-in/production cases, closing the bypass identified by Opus.

## Actual verification

- `npm run test:unit`: **71 passed** (64 previous + 7 transcription tests).
- `npm run lint`: passed.
- `npm run test:integration`: production build/TypeScript and **3 HTTP integration tests passed**. These now also cover authenticated demo transcription independently of evaluation mode, canonical-origin rejection, and hosted real-transcription 503.
- `PLAYWRIGHT_CHANNEL=chrome CI=true npm run test:e2e -- --workers=1`: **38 passed** (22 previous + 16 voice cases).
- `npm audit`: zero vulnerabilities. `git diff --check`: passed.
- Desktop review and 390px mobile panel screenshots inspected. Local access endpoint reports demo transcription available. No inference request was used for readiness.

The 16 browser cases cover real fake-device capture, track cleanup, edit/replacement confirmation, no automatic evaluation, root/follow-up draft and payload lineage, permission denial, late permission disposal, navigation locks/discard, same-ID recovery after uncertain 502/503, empty/short text, queued stale Stop, historical feedback/sidebar guards, oversized capture, maximum-duration control path, unsupported APIs, and recorder error. The timer test advances the JS clock; actual 120-second media processing was measured separately in B1a, not inferred from that timer test.

One initial full-run test incorrectly required a button inside a collapsed historical disclosure to be visible; it now opens the disclosure before asserting the selection. Assertions about preserved baseline and voice state were retained, not relaxed.

## Configuration and remaining gates

Defaults are `PRACTICE_TRANSCRIPTION_MODE=demo`, `ALLOW_LOCAL_TRANSCRIPTION=false`; `.env.example` documents them. `AUTH_URL` must equal the actual browser origin for audio writes. Playwright explicitly configures its isolated `http://127.0.0.1:3100` origin. Private environment/credentials were not changed; login remains off for everyday local development.

Before B2 enables any real adapter, shared aggregate/per-feature **paid** reservation and capability-specific loopback checks must be integrated and independently reviewed. They were not broadened merely to serve a fixed demo fixture. The existing real-evaluation limiter is unchanged. Real transcription model/API/WAV support, pricing, latency, accuracy, physical-microphone acceptance, mobile/Safari behavior, and durable hosted quotas/dedupe still require evidence. Candidate model names are not benchmark winners.

No new paid coaching/transcription calls, cloud writes, IAM/billing changes, dependencies, commits, pushes, or deployment were made in B1b. UI coding used Gemini through Cursor; this is distinct from calling the application's Gemini coaching/transcription provider. Next: prepare authorized real-provider validation under the [plan](recorded-voice-plan.md), without treating the completed ten-call coaching benchmark as fresh authorization.
