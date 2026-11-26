# Visual refresh: ink and marigold

**Status:** Spec for review. Not implemented.

## Goal

Give the practice app the look the owner approved: less text, fewer decorative elements, and a calm ink-and-marigold palette, so visitors focus on the question, their answer and the feedback. The approved mockups are in `docs/design/visual-refresh/` (open the HTML files in a browser; `NOTES.md` lists every color and contrast ratio). They were designed by Gemini 4 Neon High and passed two independent Neon High visual reviews.

The mockups also show features that come in the **next** task (voice and recap): Listen to the question, browser recording with a sample transcript, the sample polished answer with playback, and the session recap. This task builds only the look and layout of what exists today and leaves room for those parts.

## What visitors see

The same components serve the public demo and the default profile; the rules below say where they differ.

### Everywhere

- **Palette:** ink `#1C1B19` is the main color (primary buttons, active tab, selected question, headings, focus rings); white cards on a warm off-white canvas `#F7F5F0`; marigold only for focal cues (`#995300` on light surfaces, `#F2A93B` on dark ones). Muted green with a ✓ for "answered", crimson for destructive actions. No blue, violet, indigo, purple, teal, cyan or sky classes remain in the home page, `/practice` or `/mock-interview`.
- **Type:** Outfit for headings and Inter for body text, both self-hosted through `next/font`.
- **Header bar:** "echocoach" wordmark, a small "Public demo" label in the public build, and stable links (Home, Mock interview; Practice on the home page). The mock-interview link is hidden in the public build, as today.
- Visible focus rings, at least 44 px touch targets, and AA contrast for every text and control state, including disabled buttons.

### Home (`home.html`)

A two-column hero: headline, one sentence, the primary "Start focused practice" button, the secondary mock-interview button (default profile only), one short line of limits ("No sign-in. Temporary history. Sample feedback only." in the public build). The dark "How a round works" card has three steps. Below, "Choose a track" with three equal cards: title, one sentence, one button. Remove the eyebrow labels, the track subtitles and topic lines, and the bottom "Your experience is enough to start" callout. **Copy describes only what the build offers:** until voice ships, don't say "out loud", "listen" or "record" in the public build.

### Practice (`practice.html`)

- **Question switcher:** track tabs, then a single row of question pills with attempt counts. When the row overflows, show left and right scroll buttons. On small screens, use a styled `<select>` with a custom chevron instead of pills. The left sidebar goes away.
- **Earlier questions and saved follow-ups** (today in the sidebar) move to a compact disclosure row under the switcher, shown only when there are any.
- **Question card:** topic label, the question, then hints (one at a time, with "Show another hint").
- **Answer card:** the retry cue at the top when there is one (visible label "Sample focus for this retry" for demo feedback, "Focus for this retry" otherwise; the region's accessible name stays "Focus for this retry"); the answer box; one small line on the left ("Use made-up examples. History is temporary and may reset." in the public build); the submit button on the right.
- The voice panel keeps its current behavior (hidden in the public build), restyled to match.
- Remove the page title "Build a better answer.", the long public banner, the "Original voice demo" link styling (still hidden in public), the character counter's prominence (keep the count only near the limit or below the minimum) and other secondary copy.

### Feedback (`feedback.html`, `feedback-behavioral.html`)

Feedback stays inline on `/practice`, below the answer card.

- After a submission, the answer card collapses into a one-line bar: topic and question (topic only on small screens) and an **Edit answer** button that expands it and focuses the answer box. "Retry original" and "Answer follow-up" also expand it. Drafts are kept exactly as today.
- **The sample-feedback notice appears once**, as a neutral bar with an "i" icon, above the feedback (public build). It is removed from the composer, the feedback heading and the uncertainty box.
- **Attempts:** when a question has more than one attempt, a small row of attempt buttons ("Attempt 1", "Attempt 2", …) selects which feedback is shown, replacing the separate "Your attempts" section. Historical selection works as today.
- **Two columns on desktop, one on mobile.** Left: "What to build on" (quoted excerpt with its source line), "What to improve", "Next step". Right: "Rubric items to check", listing the question's expected concepts as plain rows (no checkboxes or circles). For behavioral questions, the right column also shows the outline card ("Situation → Your decision → Result → What you learned") instead of the old "Personal stories stay yours" note. The next task adds the sample polished answer card above the rubric for technical questions.
- **Criteria:** with demo feedback, where every criterion is "not assessable", hide the four criterion cards. With real feedback, show the four criteria as a compact list (name, status, one-line observation, excerpt if any) in the left column.
- **Compare your attempts:** for a retry, show the baseline and the displayed attempt side by side, then the next focus. With real feedback, keep the model's summary and before/after changes, styled to match. With demo feedback, omit the fixed "Illustrative comparison only" summary (the single notice covers it). The "Try another question" shortcut follows, with unchanged behavior.
- **Suggested answer:** with real feedback on technical questions, show it in the right column as today's content. With demo feedback, hide the fixed "No model answer is generated in demo mode" text.
- **Uncertainty:** with real feedback, a short "Limits" list at the end of the left column. With demo feedback, hidden (the notice covers it).
- **Optional follow-up:** a single row with the question and the "Answer follow-up" and "Retry original" buttons.
- Remove the "Illustrative demo feedback" badge, the heading "Your next step, not a final score." (use "Sample feedback" with demo feedback, "Feedback" otherwise), and the line "Edit your answer above and submit a retry. Earlier attempts remain unchanged."

### Mock interview (`mock-interview.html`)

Restyle the round and debrief to the mockup: a three-step stepper (✓ and muted green for answered, marigold for the current step), the question card, the answer box, and grouped actions. After a finished round, the reset action reads "Start new round" in neutral styling; its behavior, including any confirmation, is unchanged. During a round it stays "Discard round". The round logic and its "no app API requests" property are unchanged.

## Out of scope

Listen to the question, recording in the public build, the sample polished answer and its audio, the session recap, the "Session recap" header link, new questions, copy beyond the cuts listed here, the legacy pages (they may pick up the new body font, nothing else), the evaluator, any API or storage change, and any deployment.

## How to verify

1. Lint, typecheck, unit and integration tests, default and public builds pass.
2. Playwright (default profile): the existing suites pass, updated only where the layout intentionally changed (collapsed composer, attempt buttons instead of "Your attempts", the question switcher, the renamed "Start new round"). Add cases for: composer collapse and **Edit answer** focus with drafts preserved; attempt-button selection; the question strip's scroll buttons and the mobile `<select>`; the behavioral outline appearing only on behavioral questions; criteria hidden with demo feedback.
3. Public-demo CI image job: the notice appears exactly once on the feedback view; no mock-interview link; no voice panel; zero outbound calls (existing checks).
4. A search of `src/app/page.tsx`, `src/features/practice/` and `src/features/mock-interview/` finds no `indigo`, `violet`, `purple`, `blue`, `teal`, `cyan` or `sky` color classes.
5. Screenshots at 390 px and 1440 px of: home; practice (first answer, hint open, retry with cue); feedback (technical first attempt, technical retry, behavioral, real-feedback fixture with assessed criteria and a suggested answer); mock interview (round and debrief); in both builds where they differ. Gemini 4 Neon High does a visual review comparing them with the mockups.

## Method, review and merge

GPT‑6.2‑Sol (high) in Pi implements on branch `visual-refresh` in its own worktree. Gemini 4 Neon High reviews this spec, the PR diff, and the implementation screenshots. The PR merges when those reviews have no open blocker or should-fix finding and CI passes (the owner's standing instruction).
