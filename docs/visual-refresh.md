# Visual refresh: ink and marigold

**Status:** Implemented on `visual-refresh`. Gemini 4 Neon High approved the spec after revisions; the implementation diff and screenshots still need review. Not deployed.

## Goal

Give the practice app the look the owner approved: less text, fewer decorative elements, and a calm ink-and-marigold palette, so visitors focus on the question, their answer and the feedback. The approved mockups are in `docs/design/visual-refresh/` (open the HTML files; `NOTES.md` lists every color and contrast ratio).

The mockups also show features of the **next** task (voice and recap): Listen to the question, browser recording with a sample transcript, the sample polished answer with playback, and the session recap. This task builds only the look and layout of what exists today.

## Ground rules

1. **Restyle by default.** Every element and state this spec doesn't list as removed or changed keeps its content, behavior, accessible name and guards (`hardLocked`, discard confirmation), restyled with the new tokens. This includes the sign-in and loading gate, history errors, "Saved answers awaiting feedback", "Load older attempts", the follow-up context banner ("Return to original question"), the voice panel (default profile), the local-Gemini warning, the default-profile storage notice, Sign out, and the "Original voice demo" link (default profile only, in the header of the home page and `/practice`).
2. **Demo versus real feedback** is decided per attempt by `provenance.mode === "demo"`, in both builds. The public build only ever has demo feedback.
3. **No claims of unshipped features** in either build: home and practice copy must not offer listening, recording, voice answers, a polished answer, playback or a session recap. The checked phrases are "out loud", "Listen to", "Record answer", "recording", "polished answer", "Play" and "session recap" (question text such as "duplicate records" is fine). The default profile's existing voice panel and "Original voice demo" link keep their labels.
4. Visible focus rings, at least 44 px touch targets, AA contrast for every text and control state. Replace `disabled:opacity-*` with the disabled tokens. Exactly one `<h1>` per page in every state (see Feedback).

## Visual system

- Tokens from `NOTES.md` as Tailwind v4 `@theme` variables: ink `#1C1B19` (primary buttons, active track, selected question, headings, focus rings); canvas `#F7F5F0`, white cards, stone `#EFECE6`, hairline borders; marigold `#995300` on light surfaces and `#F2A93B` on dark ones, only for focal cues (retry-cue label, current mock step, link hover, dark-card highlights); muted green with ✓ for "answered"; crimson for destructive actions; disabled tokens.
- Type: Outfit for display headings via an explicit `font-display` class (not a global `h1, h2, h3` rule), Inter for body, both through `next/font`.
- **Legacy isolation:** the new tokens and fonts apply to the home page, `/practice` and `/mock-interview` only. Don't change `:root`/`body` colors or remove the legacy utility classes (`.nordic-grid`, `.glass-card`, glow and shimmer classes); `/legacy` pages must look as they do today. Scope the existing unlayered `h1, h2, h3, .font-heading` rule in `globals.css` to the legacy pages (for example under a wrapper class set by `src/app/(legacy)/layout.tsx`), so it no longer overrides heading classes on the refreshed pages.
- After this task, `src/app/page.tsx`, `src/app/practice/`, `src/app/mock-interview/`, `src/features/practice/` and `src/features/mock-interview/` contain no `indigo`, `violet`, `purple`, `blue`, `teal`, `cyan`, `sky`, `emerald`, `amber` color classes and no `#f6f7fb`.

## Header

One header bar on all three pages: "echocoach" wordmark, a small "Public demo" label in the public build, and links on the right. Home: Practice, Mock interview. `/practice`: Home, Mock interview, plus Sign out and Original voice demo where they exist today. Home in the default profile also keeps Original voice demo. `/mock-interview`: Home, Practice. Mock-interview links are hidden in the public build, as today. Navigation from `/practice` keeps today's guards.

## Home (`home.html`)

- Hero: today's headline ("Good answers are built. Not memorized."), one sentence (today's public sentence in the public build; today's default sentence otherwise), "Start focused practice", and the mock-interview button (default profile only). One limits line: public "No sign-in. Temporary history. Sample feedback only."; default "New-graduate SWE and AI/ML practice."
- Dark card "How a round works": a "Sample prompt" inset with a real starter question, then three steps: "Answer in your own words", "Check against the rubric" (public) or "Get specific feedback" (default), "Retry and compare".
- "Choose a track": three equal cards (title, one sentence, one button).
- Removed: the eyebrow label, "Small rounds. Specific skills." and its subtitle, the topic lines on track cards, the "Your experience is enough to start" callout, and the footer's "think out loud" line (footer: "Echo Coach · Interview practice for new-grad SWE and AI/ML candidates."; the public footer keeps the sample-feedback notice).

## Practice (`practice.html`)

**Question switcher (replaces the sidebar).** Track buttons (buttons with `aria-pressed`, as today). Below, question pills in catalog order, each showing the competency and "· N attempt(s)" when N > 0. The row scrolls horizontally; left/right scroll buttons (44 px) appear only while the row overflows (detected with a `ResizeObserver` and scroll position) and disable at the ends. Below the `sm` breakpoint, a styled `<select>` with a custom chevron replaces the pills; when the active target isn't a starter question of the track (an earlier question or a saved follow-up), the select shows that target as a disabled extra option. Switching keeps today's guards.

**Earlier questions and saved follow-ups** move under the switcher as two separate `<details>` disclosures, collapsed by default, labeled "Earlier questions (N)" and "Saved follow-ups (N)", each shown only when non-empty, with today's entries and accessible names.

**Question card:** topic label, the question as the page's `<h1>`, the intent line as one muted sentence, then hints exactly as today ("Give me a hint", then "Reveal another hint", cumulative).

**Answer card:**
- The retry cue at the top, when there is one. Visible label "Sample focus for this retry" when the attempt it comes from has demo feedback, otherwise "Focus for this retry"; the region's accessible name stays "Focus for this retry". (`usePracticeSession` exposes the cue's source mode.)
- The answer box.
- A bottom row: on the left, the public line "Use made-up examples. No personal details. History is temporary and may reset." (default profile: today's storage notice, shortened to one line); the character count only when the trimmed answer is under the minimum or the length is 9,000 or more; on the right, the submit button with today's labels ("Get feedback", "Evaluate my retry").
- The default profile's voice panel stays inside the answer card, restyled.

**Removed:** the page title "Build a better answer.", the "Echo Coach / Practice lab" eyebrow, the long public banner (its content moves to the line above and the single notice below), and the sample-feedback sentence in the banner.

## Feedback (`feedback.html`, `feedback-behavioral.html`)

Feedback stays inline on `/practice`.

**Collapsed composer.** When the displayed question has feedback to show, the question card and the answer card collapse into one bar: topic and question (topic only below `sm`), plus **Edit answer**. The switcher, the disclosures and the follow-up context banner stay visible above it. The `role="status"` announcer and session error alerts stay mounted outside the collapsible part, so announcements and recovery errors still reach the visitor while it is collapsed.
- **Headings:** the page's single `<h1>` is the question card's heading when expanded and the bar's question text (one `<h1>` with `tabIndex={-1}` wrapping topic and prompt) when collapsed. The feedback heading is always an `<h2>` with `tabIndex={-1}`.
- It starts collapsed when feedback is shown (after a successful submission, or when opening a question or saved follow-up that has feedback). It is expanded for a question without feedback, after a failed submission (with the error visible), and after "Reopen saved answer".
- **Edit answer**, "Retry original answer" and "Answer follow-up" expand it and move focus to the answer box after it mounts. For "Answer follow-up", this replaces today's move of focus to the question heading; the "Opened follow-up question" announcement stays. After a successful keyboard submission, focus moves to the feedback heading. Other navigation that focuses the question heading today focuses the page's `<h1>` (the bar's, when collapsed).
- Drafts, retry links and the submission cache behave exactly as today.

**The sample-feedback notice** appears once, as a neutral bar with an "i" icon, above the feedback, whenever the displayed attempt has demo feedback (any build). It is removed from the feedback heading, the composer, the uncertainty box and the comparison panel's demo subline.

**Attempt selector.** When the displayed question has two or more completed attempts, a row of buttons ("Attempt 1", "Attempt 2", …) sits at the top of the feedback, always visible: `role="group"` with `aria-label="Attempts"`, `aria-pressed` on the shown one, disabled while `hardLocked`, wrapping when long, 44 px high. It replaces the "Your attempts" section and uses today's selection logic (including off-page baselines).

**Layout.** Heading "Sample feedback" (demo) or "Feedback" (real), with the real-mode "Gemini · model" badge kept beside it. For an attempt that isn't a retry, a collapsed `<details>` "Your answer" under the heading shows the submitted text (retries show it in Compare your attempts). Two columns from `lg` (7/5), one column below:
- **Left:** criteria (real feedback only), "What to build on", "What to improve", "Next step", "Rubric items to check", and "Limits" (real feedback only).
- **Right:** for behavioral questions, the "Structure outline" card (Situation → Your decision → Result → What you learned) with the intro "Behavioral answers aren't rewritten, so your stories stay yours. Use this outline to shape your own draft." (not the mockup's wording, which mentions a polished answer), replacing the "Personal stories stay yours" note; for technical questions with real feedback, the suggested answer card. **When the right column has nothing, the left column spans the full width.** (Technical demo feedback is full width until the next task adds the sample polished answer.)

**Content rules:**
- Criteria: real feedback shows the four criteria as a compact list (name, status label, observation, excerpt if any) with status text in ink and a neutral pill. Demo feedback hides them.
- "What to build on" lists every strength: quoted excerpt, then its observation as a small source line. "What to improve" lists every gap: observation, then next step. "Next step" lists the next steps (renamed from "Try this next").
- "Rubric items to check": the question's expected concepts as plain rows, no checkboxes or circles; omitted when there are none.
- "Limits" (renamed from "Limitations / uncertainty"): real feedback only.
- Suggested answer: real feedback, technical questions, as today's collapsed `<details>` ("Optional suggested answer · try improving yours first"). Demo feedback hides the fixed "No model answer is generated in demo mode" text.
- Token usage line: real feedback only, kept as today's small text at the end.

**Compare your attempts** (a retry only). Baseline and displayed attempt side by side (stacked below `sm`), labeled with their attempt numbers or "Linked earlier answer", keeping today's baseline loading, error and "Retry loading baseline" states. Then: real feedback shows the model's summary, the before/after changes and its disclaimer line, then "Focus for the next retry"; demo feedback shows only the next focus. A retry without a comparison shows "No model comparison is available for this retry. An unchanged answer does not demonstrate improvement. Compare the submitted answers above." The "Try another question" shortcut follows, unchanged.

**Optional follow-up.** One card: the label "Optional follow-up" (was "Go one level deeper"), the question, "Answer follow-up" and "Retry original answer" (labels unchanged). Real feedback keeps the rationale, focus label, optional concepts, the AI-generated disclaimer and the unsent-draft notice, condensed below the question. Demo feedback shows the question and buttons only.

**Removed:** the "Illustrative demo feedback" badge, the heading "Your next step, not a final score.", "Edit your answer above and submit a retry. Earlier attempts remain unchanged.", and the separate "Your attempts" section.

## Mock interview (`mock-interview.html`)

The flow stays as today: ready intro, answering, "Round answers" (full answers), "Open debrief", "Self-review debrief". Restyle each to the mockup's look:
- A three-step stepper on the answering and review screens: answered (muted green, ✓, "Answered"), skipped (stone, "Skipped", no ✓), current (marigold, `aria-current="step"`), upcoming (stone, "Up next"), and, on the review screen after ending early, unreached (stone, "Not included").
- Question card and answer box as on `/practice`; actions grouped (primary, then secondary, then destructive), full width on mobile, rendered once (no duplicated buttons).
- After a finished round, the reset action reads "Start new round" (neutral style, same behavior and confirmation as today's "Discard round"/"Start over" there). During a round it stays "Discard round". Labels inside the debrief are unchanged.
- The round's "no app API requests" property is unchanged.

## Out of scope

Listen to the question, recording in the public build, the sample polished answer and its audio, the session recap and its header link, new questions, the legacy pages, the evaluator, any API or storage change, and any deployment.

## How to verify

1. Lint, typecheck, unit and integration tests, default and public builds pass.
2. Playwright (default profile): existing suites pass, updated only for this spec's intentional changes: collapsed composer and **Edit answer**; attempt selector and "Your answer" instead of "Your attempts"; question switcher and disclosures instead of the sidebar ("Archived questions" becomes "Earlier questions"); header and button labels ("Open practice →" and "Back to practice" become "Practice"; "Start a focused practice round →" becomes "Start focused practice"); "Your next step, not a final score." becomes "Sample feedback"/"Feedback"; the behavioral note becomes "Structure outline"; "Go one level deeper" becomes "Optional follow-up"; "Try this next" → "Next step"; "Limitations / uncertainty" → "Limits"; "Answer follow-up" focusing the answer box; "Start new round" after a finished mock round.
3. New Playwright cases: collapse states (after submit, opening an attempted question, failed submit stays expanded, reopen saved answer expands); Edit answer, Retry original answer and Answer follow-up expand and focus the answer box, with drafts preserved; focus after keyboard submit; the attempt selector (selection, `aria-pressed`, visible when viewing Attempt 1); the switcher's scroll buttons at a narrow desktop width and the mobile `<select>` including the extra disabled option; the disclosure; the behavioral outline only on behavioral questions; full-width left column with technical demo feedback; and a **real-feedback fixture** (routed response) asserting criteria statuses, comparison summary and changes, suggested answer, "Limits" and token usage.
4. Public-demo CI image job: the notice appears exactly once on the feedback view; the temporary-history line is visible; no mock-interview or session-recap link; no voice panel; none of the words in ground rule 3 on `/` or `/practice`; zero outbound calls (existing checks).
5. The color search in "Visual system" returns nothing; `/legacy` screenshots match today's.
6. Screenshots at 390 px and 1440 px: home (both builds); practice (first answer, hint open, retry with cue, disclosure open); feedback (technical first attempt, technical retry, behavioral, real-feedback fixture); mock interview (answering, round answers, debrief). Gemini 4 Neon High does a visual review against the mockups.

## Local verification

On Node 22, a clean `npm ci`, lint, TypeScript, both production builds, 93 unit tests, 3 integration tests, and 58 default-profile Chrome tests passed. Real feedback was exercised with routed fixtures only. All four public-demo spec cases passed over local HTTPS against the standalone build, using local Node-process restarts instead of Docker. No outbound attempts or synthetic test markers appeared in the server logs. The updated container is for CI to verify.

The color search found no excluded classes. The 1440 px `/legacy` before/after PNGs were byte-identical with animations paused. The 390 px and 1440 px captures are in `/tmp/echo-lead/vr-shots/` for lead and Neon review.

## Method, review and merge

GPT‑6.2‑Sol (high) in Pi implements on branch `visual-refresh` in its own worktree. Gemini 4 Neon High reviews this spec, the PR diff, and the implementation screenshots. The PR merges when those reviews have no open blocker or should-fix finding and CI passes (the owner's standing instruction).
