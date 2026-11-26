# Land the pending practice improvements on `main`

**Status:** Implemented on the review branch based on `1b88ff9`; not merged or deployed.

## Why

The main checkout holds finished but uncommitted work by the GPT agent (Pi), written on an old base (`b1856e7`, 27 commits behind `main`). The owner chose to build the demo upgrade (visual refresh, voice and recap features with sample content) on top of this work, so the selected parts must reach `main` first. A backup of the whole change set is kept outside the repository.

## What lands

Visitors in the default (non-public) profile get:

1. **Three new starter questions**, appended after the existing entries of each track, so each track's catalog order becomes: behavioral *Ownership and impact*, *Learning and accountability*, **Clarifying requirements**; software engineering *Data structures and complexity*, *Debugging and testing*, **Stable pagination**; AI/ML *Evaluation and data leakage*, *Metrics and trade-offs*, **Investigating label quality**. The second hint of *Evaluation and data leakage* is reworded in plainer terms and ends with a "which would you check first" prompt. Every question has two staged hints and a rubric.
2. **Retry focus cue** ("Focus for this retry"), as specified in the "Retry composer cue" section of `retry-comparison.md`. When the composer is preparing a retry, it shows one saved action from the linked attempt: the comparison's next focus, else the first nonblank next step, else a gap's next step. If all are blank, there is no cue. New answers and first follow-ups have no cue; a follow-up's own retries use that follow-up thread's linked attempt. A *recovered* answer (a saved but unevaluated submission reopened after a failure) keeps its original baseline while unchanged, including no baseline; once edited it uses the currently selected attempt for a new submission. The cue text is part of the answer field's accessible description (`aria-describedby`). Displaying the cue makes no evaluation call; an off-page baseline may be read through the existing owner-scoped attempt route.
3. **"Try another question" shortcut**, as specified in `post-retry-next-question.md`. Key points: exactly one secondary button, labeled `Try another question in <track label>: <destination competency>`, for a displayed completed attempt on a curated root question that has a `previousAttemptId` (including historical retries and retries without comparison prose; never failed submissions, follow-ups and their retries, removed roots, or the mock interview). The destination is the next catalog entry in the same track, wrapping around, and never the current question. Rendering doesn't take focus. Activation uses the sidebar's selection path (heading focus, `Selected question: …` announcement), preserves drafts, and respects the existing evaluation and voice locks and the discard confirmation; `main` already has those locks (`voice.isHardLocked`, `hasUnappliedVoiceState`).
4. **Three-question typed mock interview** at `/mock-interview`, linked from the home page, as specified in `mock-interview.md`: one fixed question per track, no hints or coaching during the round, skip and end-early rules, and an optional self-review debrief that is not a grade. It makes no app API requests.
5. **Test safety:** in `playwright.config.ts`, `webServer.reuseExistingServer` becomes `false` (it was `!process.env.CI`). The suite always starts its own mock-mode server on port 3100 and fails if that port is taken, so it can't submit to a developer's paid-mode server.

## Public demo profile

Nothing is deployed in this task; the public URL is unchanged. `src/proxy.ts` is not changed.

- `/mock-interview` stays blocked in the public build by the proxy's existing allowlist (404). The home-page link to it is hidden in the public build. Whether the public demo offers the mock interview is decided in the voice and recap release spec.
- The new questions, the retry cue and the shortcut are typed practice with sample feedback, so they appear in the public build's `/practice`. The public sample-feedback notice already sits beside the composer and the feedback, so the cue needs no extra wording.

## File manifest

Every path in the uncommitted change set is listed once. **Include** takes the file's change as written (resolving conflicts with `main`). **Split** takes only the hunks named. **Exclude** means the local change is not taken; it stays local, uncommitted and unpushed. **Fresh edits** are new changes written on `main`, not taken from the backup.

Include:
- `src/content/questions/starter-bank.ts` (new questions, hint change, `nextStarterQuestion`)
- `src/features/practice/PracticeFeedback.tsx` (shortcut slot)
- `src/app/mock-interview/page.tsx`, `src/features/mock-interview/MockInterview.tsx`, `src/features/mock-interview/round.ts`
- `tests/unit/practice.test.ts`, `tests/unit/mock-interview.test.ts`
- `tests/e2e/practice.spec.ts`, `tests/e2e/follow-up.spec.ts`, `tests/e2e/retry-comparison.spec.ts`, `tests/e2e/mock-interview.spec.ts`, `tests/e2e/post-retry-next-question.spec.ts`
- `docs/mock-interview.md`, `docs/post-retry-next-question.md` (updated as described under Docs)

Split:
- `src/app/page.tsx`: the mock-interview link and the tagline change, with the link hidden when `PUBLIC_DEMO_BUILD` is set. Keep `main`'s public-demo copy.
- `src/features/practice/PracticeWorkspace.tsx`: the retry-cue and shortcut hunks only. Exclude the mock-evaluator copy change that mentions Gemini evaluation requests, and keep all of `main`'s `PUBLIC_DEMO_BUILD` gates.
- `src/features/practice/usePracticeSession.ts`: the retry-cue, submission-cache and baseline-recovery hunks (none touch voice or transcription; confirm while splitting).
- `playwright.config.ts`: the `reuseExistingServer` hunk only.
- `docs/retry-comparison.md`: the "Retry composer cue" section only.

Exclude (stays local):
- Owner's standing release exclusions: `docs/coaching-quality-checkpoint.md`, `docs/coaching-corrections-vs-enrichment.md`, `docs/coaching-rubric-evidence-probe.md`, `docs/coaching-targeted-rewrites.md`, `docs/technical-coaching-quality.md`; `benchmarks/transcription/live-pilot.ts`, `scripts/execute-transcription-pilot.ts`, `tests/unit/transcription-funded.test.ts`, `docs/transcription-pilot-results.md`, and the local edits to `benchmarks/transcription/protocol.ts`, `docs/transcription-benchmark-plan.md`, `docs/transcription-pilot-preparation.md`.
- Local-only transcription and voice: `.env.example`, `next.config.ts`, `src/app/api/practice/transcriptions/route.ts`, `src/application/workflows/transcribe-audio.ts`, `src/infrastructure/config/transcription-runtime.ts`, `src/infrastructure/ai/gemini/local-evaluation.ts`, `src/infrastructure/ai/gemini/audio-transcriber.ts`, `src/features/practice/audio/VoiceAnswerPanel.tsx`, `src/features/practice/audio/useVoiceRecording.ts`, `src/features/practice/usePracticeAccess.ts`, `scripts/smoke-recorded-answer.ts`, `tests/audio/mock-interactions.cjs` (used only by that smoke script), `tests/e2e/voice.spec.ts`, `tests/unit/transcription.test.ts`, `tests/unit/practice-recorded-answer.test.ts`, `docs/recorded-answer-integration.md`.
- Other: `AGENTS.md`, the `README.md` rewrite (a new short update is written instead), `docs/implementation-status.md`, `docs/recorded-voice-plan.md`, `docs/candidate-practice-session.md`, `tests/unit/gemini-coaching.test.ts`, and the untracked draft `docs/public-demo-readiness.md` (`main` has the newer version).

Fresh edits (on `main`, not from the backup):
- `docs/land-pending-practice-work.md` (this spec)
- `README.md` and `docs/public-demo-readiness.md` (see Docs; the local versions of both stay excluded)
- `tests/public-demo/public-demo.spec.ts` (the added public-demo checks; `tests/public-demo/run-image.sh` only if the new checks need it)

If an included hunk turns out to depend on an excluded one, stop and report it instead of pulling the excluded change in.

## Docs

- `README.md`: add the four additions (expanded starter bank, retry cue, shortcut, mock interview) to the default-profile list. Say that the next public release adds the first three to the public `/practice` and that the public demo hides `/mock-interview`.
- `docs/mock-interview.md`: note that the public demo blocks it, drop the stale Next.js advisory remark (fixed by 16.4.5 on `main`), and label its test counts as measured on the old base.
- `docs/post-retry-next-question.md`: update the status (it now ships in `/practice`, including the public build) and label its test counts likewise.
- `docs/retry-comparison.md`: label the test counts in the landed "Retry composer cue" section as measured on the old base.
- `docs/public-demo-readiness.md`: add a note that the next release adds the new questions, retry cue and shortcut to the public `/practice`, superseding "no new questions", and that `/mock-interview` stays blocked.
- Review notes naming the AI models that designed or reviewed a feature stay as written.

## Method

GPT‑6.2‑Sol (high) in Pi implements on branch `land-pending-practice-work` in its own worktree from current `main`, using the backup, and resolves conflicts with `main`'s later work (legacy route group, public-demo gating, Next.js 16.4.5). No bulk staging: before each commit, compare `git diff --cached --name-only` with Include, Split and Fresh edits. Commit as `Zihao Qi <35388022+Zihao-Qi@users.noreply.github.com>`. The lead reviews, then opens the PR.

## How to verify

1. **Manifest and leakage:** `git diff --name-only origin/main...HEAD` lists only Include, Split and Fresh-edit paths, and no other Exclude path. Review every hunk in Split and Include files: no transcription mode, local Gemini budget, pilot, coaching-report, `.env` or HMR-cache change; none of `main`'s `PUBLIC_DEMO_BUILD` gates, hidden voice/sign-in/legacy links, or sample-feedback copy reverted.
2. Lint, typecheck, unit and integration tests, and both default and public builds pass.
3. Playwright (default profile): the three new drills with staged hints; retry-cue cases (blank, comparison focus, next-step fallback, recovered unchanged and edited, off-page baseline, follow-up isolation, accessible description); the shortcut's acceptance table in `post-retry-next-question.md` (label, eligibility, wraparound, keyboard activation and focus, drafts preserved, disabled while pending or voice-locked, discard confirmation, **no extra app requests** on render or activation); the mock interview (skip, end early, restart, debrief, **no app API requests**).
4. **Public-demo CI image job**, extended in this PR: `/mock-interview` returns 404; the home page has no link to it; one retry in `/practice` shows the focus cue and the shortcut with the sample-feedback notice still present, with zero outbound calls, as the existing checks already assert for other flows.
5. **Test safety:** with a dummy server already listening on port 3100, `npm run test:e2e` fails to start instead of reusing it.
6. **Hygiene:** `git status --porcelain` in the main checkout is identical before and after; the branch's commits use the owner identity above.
7. Screenshots at 390 px and 1280 px: default `/practice` with the cue and shortcut, and `/mock-interview` round and debrief; public build `/` and `/practice` showing no mock-interview link and no voice panel. The lead inspects them.

## Local verification on the review branch

- Clean `npm ci` on Node 22.23.5. Lint, TypeScript, 93 unit tests, 3 integration tests, and the default and public builds passed.
- The default profile passed all 52 Playwright tests using installed Chrome in a fresh browser process. An additional synthetic fixture check confirmed the first nonblank gap action is used as the cue, and all-blank actions produce no cue or evaluation request.
- With a dummy listener on port 3100 and CI mode off, Playwright refused to start rather than reusing the server. The main checkout’s porcelain status was identical before and after.
- Local HTTPS browser checks of the public build confirmed the mock-interview route is blocked and unlinked, the voice panel is hidden, and a retry shows the cue, shortcut, and sample-feedback notice without outbound browser requests. The public image job includes these assertions but has not run on this branch. Captured the required 390 px and 1280 px views for lead review.

## Review and merge

Gemini 4 Neon High reviews this spec, then the PR diff. The PR merges when that review has no open blocker or should-fix finding and CI passes (the owner's standing instruction).

## Out of scope

Visual redesign, voice and recap features, any deployment, real AI calls, and cleaning up the main checkout. After merging, the main checkout still has these changes uncommitted on the old base; moving it to `main` while keeping the local-only files is a separate step that needs the owner's OK.
