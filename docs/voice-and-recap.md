# Voice and recap with sample content

**Status:** Spec for review. Not implemented.

## Goal

Bring back the parts of the original prototype that visitors noticed most (a spoken interviewer, answering by voice, a polished answer you can hear, and a recap at the end) without any live AI call and without sending a visitor's audio anywhere. Everything spoken or "transcribed" is prewritten sample content, generated once, reviewed, and shipped as static files. This follows the owner's choice of sample content only, and the approved design in `docs/design/visual-refresh/` (`practice.html`, `feedback.html`, `recap.html`).

## What visitors get

Rules below apply to both the public demo and the default profile unless stated.

### 1. Listen to the question

- Every starter question (all nine) has a short prerecorded audio file of the question being read aloud.
- The question card shows a **Listen to the question** button (marigold, as in `practice.html`) with a thin progress bar and elapsed / total time. It plays, pauses and resumes; switching question stops playback. Nothing plays automatically.
- A small caption "AI-generated voice" sits beside it.
- The mock interview's question card has the same control.
- If the file fails to load, the button is replaced by nothing (typed practice is unaffected).

### 2. Answer by voice (public demo: in the browser only)

- **Public build:** the answer card gets an optional **Record answer** control. It asks for the microphone only when the visitor presses it. The visitor can stop at any time (two-minute limit, as today). When recording stops, the audio is discarded in the browser and is never uploaded; the panel then shows that question's **sample transcript** in an editable box, labeled "Sample transcript" with the line "This demo doesn't recognize speech. Edit this sample before using it." **Use in answer draft** copies it into the answer box (asking before replacing a nonempty draft, as today); **Re-record** and **Discard** behave as today. Recording never submits anything.
- **Default profile:** the existing voice panel keeps its current server-side demo behavior and guards; the only change is that the demo transcript it returns is the active question's sample transcript instead of one fixed text.
- Navigation and submit locks while recording or holding an unapplied transcript stay exactly as today (`hardLocked`, discard confirmation).
- The public proxy still blocks `/api/practice/transcriptions`.

### 3. Sample polished answer (technical questions)

- Each of the six software engineering and AI/ML questions has a prewritten **sample polished answer** (about 90–140 words) and an audio recording of it.
- It appears in the feedback's right column as the dark card in `feedback.html`: title "Sample polished answer", the line "A prewritten example for this question, not a rewrite of your answer.", a Play control (bright marigold on dark) with progress and time, and the text with two or three key phrases highlighted in bright marigold.
- It shows with demo feedback and with real feedback. With real feedback on a technical question, it sits above the model's suggested answer.
- Behavioral questions keep the structure outline and never get a polished answer.

### 4. Session recap

- Once the visitor has at least one completed attempt, a **Session recap** link appears in the `/practice` header (it is not shown before then, and never on the home page).
- It opens an in-page view on `/practice` (no new route; it uses the history already loaded, so nothing is lost on navigation). Layout as `recap.html`: one section per question practiced this session, most recent first, each with track and attempt count, the question, the first and the latest attempt side by side (just one if there is a single attempt), and "Rubric concepts to review next" (the question's expected concepts, plain rows). A line at the top: "From this session's temporary history. No scores or assessments." Actions at the end: "Back to practice" and "Start 3-question mock interview".
- Nothing in the recap judges the answers: no checkmarks, counts of concepts covered, streaks or "breakthrough" labels. It is a summary of the visitor's own text.
- With an empty history (for example after a server restart) the link disappears.

### 5. Mock interview in the public demo

- The three-question typed mock interview becomes available in the public build: the home page button and header link appear, and the proxy allows `/mock-interview`. It makes no API requests (unchanged) and gains Listen to the question.

## Content

- **Sample transcripts** (nine, 40–80 words): plausible first-draft spoken answers, made-up and clearly fictional, with natural hesitations removed. They should leave room for improvement, so the feedback loop still makes sense.
- **Sample polished answers** (six): accurate, concise answers a strong new graduate could give, consistent with each question's rubric. No claims of personal experience.
- Stored in the starter bank beside each question (`sampleTranscript`, `samplePolishedAnswer` for technical questions, plus the highlighted phrases).
- GPT drafts the text; the lead reviews it for technical accuracy before any audio is generated; Gemini 4 Neon High reviews it again in the PR.

## Audio generation (one time, paid)

- Model: **Gemini 3.8 Flash TTS** (`gemini-3.8-flash-tts`) through the Gemini API, one prebuilt voice for questions (the interviewer) and a different one for polished answers. Voice names are chosen from the current documented list and recorded in the manifest.
- Expected size: nine questions (about 8 seconds each) and six answers (about 45 seconds each), roughly 6 minutes of audio. At the published standard rate of $9 per million audio tokens billed at 25 tokens per second, that is about **$0.08** ([Gemini API speech generation](https://ai.google.dev/gemini-api/docs/speech-generation), [Cloud Text-to-Speech pricing](https://cloud.google.com/text-to-speech/pricing); checked 2026-11-26). The owner's approved budget is **$1**; the script refuses to run if the planned audio exceeds 15 minutes, and stops after 30 requests including retries.
- A script, `scripts/generate-demo-audio.ts`, reads the texts from the starter bank, and only with an explicit `--execute` flag and `GEMINI_API_KEY` in the environment calls the API. It never runs in CI or at build or runtime. Without `--execute` it prints the plan (files, characters, estimated seconds and cost). It skips files whose text hash already matches the manifest.
- Output: mono AAC at 64 kbps in `public/audio/questions/<id>.m4a` and `public/audio/answers/<id>.m4a` (converted from the returned PCM with `ffmpeg`), plus `public/audio/manifest.json` with each file's text hash, duration, model and voice. Expected total under 4 MB.
- The lead runs it once, locally, after the texts are approved, using the existing private key without printing it, and records the request count and estimated cost in this doc.
- The lead listens to every file before commit; any file that misreads the text is regenerated (counted against the request cap).

## Boundaries

- No live AI call at runtime in any build; no visitor audio leaves the browser in the public build; no speech recognition anywhere.
- No real transcription, Gemini Live interviewer, or rewriting of the visitor's own answer.
- No new API routes, storage or analytics. Audio files are static assets served by the app.
- Public proxy: allow `/mock-interview`, and `/audio/questions/*.m4a`, `/audio/answers/*.m4a` and `/audio/manifest.json` (exact patterns); everything else stays as today.
- Response headers: keep today's; the microphone is only requested on the Record press.
- No deployment in this task; the release is the next task.

## How to verify

1. Lint, typecheck, unit and integration tests, default and public builds pass.
2. Unit: every starter question has a sample transcript and an audio file; every technical question has a polished answer and audio; manifest hashes match the current texts (so text and audio can't drift); behavioral questions have no polished answer; the generation script in plan mode makes no network request and refuses without `--execute`, and enforces both caps.
3. Playwright (default and public): Listen plays, pauses, stops on question switch, and hides itself if the file 404s; no audio autoplays. Public recording with a fake microphone: no microphone request before Record; after Stop, no network request carries audio (assert on all requests), the sample transcript for that question appears, Use in answer draft fills the draft (with the replace confirmation), nothing is submitted; locks and discard confirmation hold. Default profile: the server demo transcript is the question's sample transcript.
4. Polished answer card appears for technical questions with demo and with real feedback (routed fixture, above the suggested answer), and never for behavioral questions.
5. Recap: hidden with no attempts; after attempts on two questions it shows both, most recent first, with first/latest attempts and rubric concepts; no judging language; Back to practice returns to the same state with drafts intact.
6. Public-demo CI image job: `/mock-interview` loads with no API requests; the audio files and manifest load; `/api/practice/transcriptions` still 404; zero outbound calls; no visitor audio in any request; the sample-feedback notice still appears once.
7. Screenshots at 390 px and 1440 px of: practice with Listen and the sample transcript (public), feedback with the polished answer (technical, demo and real), behavioral feedback (no polished answer), the recap with one and with two questions, the mock interview with Listen. Gemini 4 Neon High does a visual review against the mockups.

## Method, review and merge

1. GPT‑6.2‑Sol (high) in Pi drafts the content and builds everything except running the paid generation, on branch `voice-recap` in its own worktree.
2. The lead reviews the texts, runs the generation once, listens to the files and commits them.
3. Gemini 4 Neon High reviews the PR diff (including the texts) and the screenshots. The PR merges when those reviews have no open blocker or should-fix finding and CI passes (the owner's standing instruction).
