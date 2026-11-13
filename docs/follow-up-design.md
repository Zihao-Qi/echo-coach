# Targeted follow-up design

## Discussion and decision

User requested Gemini 4 discussion for important design decisions and independent GPT-6.1-Sol/high review after each implementation stage.

One bounded design call was made to `gemini-4-argon` / LOW with a generic architectural brief only. Raw advice: `follow-up-gemini4-discussion.md`. Usage: 458 input / 1,818 output tokens. At the retrieved temporary standard $2/$10 per-million rates, estimated cost is $0.019096, not an invoice. No personal answers, credentials, or private repository contents were supplied.

Accepted: embed one optional follow-up proposal in a completed source evaluation, then persist a server-derived immutable question snapshot on each submitted attempt. This avoids a separate generated-question collection and extra generation call. The model's unsupported estimate about how often users ignore questions, and its claim that this option is strictly superior, were not accepted as evidence.

## Invariants

- Initial depth is one. Follow-ups may be retried, but do not spawn follow-ups.
- Root question ID, follow-up parent ID, and same-question retry baseline are distinct.
- Client sends only root question ID and source/baseline IDs, never trusted prompts/rubrics.
- Server resolves source by owner, validates root and depth, then constructs the focused question.
- Every new attempt saves prompt/rubric snapshot before generation. Failed/replayed attempts use that snapshot even after catalog edits.
- Follow-up answers are evaluated against their focused question; no comparison against the root answer.
- Comparison is allowed only for retries of the same follow-up source/identity.
- Invalid optional follow-up proposals are dropped without failing valid core evaluation.
- Old records lacking proposals or snapshots remain readable; no follow-up action is offered without a valid proposal.
- Generated rubrics guide coaching; they are not independently verified technical truth or instruction policy.

## Stages

1. Backend contracts, snapshot/lineage handling, evaluator integration, and regression tests; independent GPT-6.1-Sol/high review before UI work.
2. UI actions, separate root/follow-up drafts, historical reopening and failure recovery, browser tests; independent GPT-6.1-Sol/high review before completion.

Coaching stays on Gemini 3.8 Flash / LOW. No additional coaching benchmark requests are included in this design call.

## Implemented UI and lead critique

At the user's request, Gemini 4 Argon / LOW produced the UI design and implementation, including review-driven patches. The lead integrated the generated source, authored acceptance tests, inspected the rendered desktop/mobile experience, and rejected or corrected advice rather than treating it as authoritative. The archived initial proposal is in `follow-up-ui-gemini4-design.md`.

Final boundaries:

- `PracticeWorkspace.tsx`: page layout, question/history navigation, input, accessible pending lock.
- `usePracticeSession.ts`: root/follow-up transitions, isolated drafts, selected history, per-target recovery IDs, and explicit submission payloads.
- `practiceTarget.ts`: target resolution, snapshot precedence, and saved follow-up/archived-root grouping.
- `FollowUpCard.tsx`: optional prompt, rationale, focus, rubric disclosure, and original-retry action.
- `FollowUpContextBanner.tsx`: original question, separately loaded parent answer, load/retry status, and return action.
- `PracticeFeedback.tsx`: existing evaluation rendering and same-question retry comparison.

Accepted changes after critique:

1. Split the initial 1,000-plus-line workspace into the components/hook/helpers above.
2. Prefer exact saved question snapshots over today's catalog. Do not label a catalog fallback as a verified historical root snapshot. Independently fetched parent snapshots win over provisional metadata; return navigation waits when the original context is not yet known.
3. Discover completed saved follow-ups independently of the currently selected root, including removed catalog questions. Failed records remain reopenable through saved-answer recovery.
4. Keep root drafts, each source-specific follow-up draft, retry baselines, and spawning parent context distinct. Navigation never evaluates automatically; request bodies carry only IDs and answer text.
5. Replace the single outstanding submission cache with per-target caches. A failed source A keeps its original submission ID even after source B succeeds; successful B must not clear A.
6. Guard header links as well as workspace controls while pending, including keyboard activation, accessible disabled state, and tab order.

The lead reproduced the last two defects as failing browser assertions before applying Gemini's fixes. The final independent GPT-6.1-Sol/high UI review found no remaining actionable issues. Its Pi session recorded `provider=openai-codex`, `modelId=gpt-6.1-sol`, and `thinkingLevel=high`. Backend review separately reached no remaining concrete actionable findings after snapshot/recovery corrections. These were static reviews; the lead owned runtime verification.

## Verification and limits

Observed checkpoint:

- `npm run test:unit`: 53 passed.
- `npm run lint`: passed.
- `npm run test:integration`: production build/TypeScript plus 3 HTTP integration tests passed.
- `PLAYWRIGHT_CHANNEL=chrome CI=true npm run test:e2e -- --workers=1`: 22 passed, including 7 follow-up tests.
- Additional focused follow-up screenshot/overflow run: passed; desktop full-page and 390px mobile viewport captures inspected. Mobile full-page capture after viewport resizing produced a browser capture artifact, so inspection uses the focused viewport capture rather than claiming the tiled image was valid.
- `npm audit`: zero vulnerabilities. `git diff --check`: passed.
- Local development access endpoint responds with demo auth, memory storage, and the bounded local Gemini mode. No evaluation was triggered by this readiness check.

The seven follow-up browser cases cover isolated drafts and first-child/retry payloads; pending navigation; cross-source failed-submission identity; legacy feedback; removed roots; historical source snapshots loaded outside the history page; and failed-child recovery with the original source, baseline, answer, and ID. Unit/API tests additionally enforce owner/source isolation, server-only prompt/rubric authority, optional-enrichment failure isolation, snapshot persistence, idempotency, and one-depth enforcement.

No further automated coaching calls were made under the completed ten-call benchmark authorization. The new retry/follow-up prompt (`question-aware-v5-follow-ups`) and provider schema still need authorized real-Gemini validation; mock tests cannot establish schema acceptance, focused-question relevance, rubric quality, or comparison accuracy. Firestore durability, real Google sign-in, deployment, and physical-device voice remain outside this checkpoint. Drafts survive target switches within the mounted workspace, not browser reloads or app exits; submitted memory history survives refresh only while the server process remains alive.

## Gemini UI generation receipts

Separate from coaching evaluation, the user requested Gemini's UI design and implementation. Successful implementation responses with retained token receipts:

| Request | Input tokens | Output tokens |
| --- | ---: | ---: |
| Initial UI implementation | 12,387 | 13,463 |
| Modular revision | 17,838 | 15,502 |
| Historical-snapshot correction | 6,591 | 1,682 |
| Independent-review recovery/navigation fixes | 9,362 | 2,136 |

These are token receipts, not a complete call inventory or billing total; the initial UI design response did not save a standalone usage receipt. No credentials or personal answer history were supplied to these generation requests; input consisted of application source, public question content, design constraints, and review findings.
