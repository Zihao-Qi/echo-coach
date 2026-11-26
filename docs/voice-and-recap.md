# Voice and recap with sample content

**Status:** Approved spec. Reviewed text changes and the implementation are on `voice-recap`; the production audio manifest is intentionally empty until the lead generates and listens to the recordings. No deployment.

## Goal

Bring back the parts of the original prototype that visitors noticed most (a spoken interviewer, answering by voice, a polished answer you can hear, and a recap at the end) without any live AI call and without sending a visitor's audio anywhere in the public demo. Everything spoken or "transcribed" is prewritten sample content, generated once, reviewed, and shipped as static files. This follows the owner's choice of sample content only and the approved design in `docs/design/visual-refresh/` (`practice.html`, `feedback.html`, `feedback-behavioral.html`, `recap.html`, `mock-interview.html`). Where this spec differs from the mockups (disclosure lines, button names, recap actions), the spec wins.

## Scope of each feature by question kind

`/practice` shows three kinds of question: **starter questions** (the nine in the starter bank), **follow-ups**, and **earlier questions** (archived roots no longer in the bank).

| | Starter | Follow-up | Earlier question |
|---|---|---|---|
| Listen to the question | yes | no | no |
| Record answer, public build | yes, with that question's sample transcript | no (panel hidden) | no (panel hidden) |
| Record answer, default profile | yes, as today | as today | as today |
| Sample polished answer | technical starters only | no | no |
| Appears in recap | yes | yes, as its own section | yes |

## What visitors get

### 1. Listen to the question

- Each starter question has a prerecorded file of it being read aloud. The question card shows **Listen to the question** (marigold, as in `practice.html`), a read-only progress bar, elapsed / total time (the total comes from the bundled manifest, so it shows before loading) and the caption "AI-generated voice". The mock interview's question card has the same control.
- Pressing it plays; pressing again pauses (its name changes to "Pause question audio"); playing to the end resets it. Nothing plays automatically. Audio uses `preload="none"`, so nothing downloads until pressed.
- **Only one sound at a time.** Starting any player pauses the others. Playback stops when the visitor switches question, track, attempt or follow-up, presses Record answer, submits, opens or closes the recap, or advances, skips, ends or discards a mock-interview turn.
- If a file fails to load or `play()` is rejected, the control is replaced by the polite status "Audio isn't available right now." and focus moves to the question heading. Typed practice is unaffected.

### 2. Answer by voice

**Public build (browser only, starter questions only):**
- **Before recording,** the panel says: "Record yourself to practice speaking. Your audio stays in this browser and is deleted when you stop. This demo doesn't recognize speech: after you stop, you'll see a sample transcript you can edit." The microphone is requested only when the visitor presses **Record answer**.
- **Recording:** as today (two-minute limit, Stop, Discard, polite status announcements without per-second chatter, the recording indicator respects reduced motion). Recorded chunks are discarded as they arrive; the public flow never converts audio, never calls `/api/practice/transcriptions` and never makes any request with audio in it.
- **On Stop or the two-minute limit:** the microphone is released, and the panel shows that question's sample transcript in an editable box labeled "Sample transcript", described by "This demo doesn't recognize speech. Edit this sample before using it." Focus moves to the box. **Use in answer draft** copies it into the answer box, asking before replacing a nonempty draft; **Re-record** starts again; **Discard** clears the panel.
- **Discard while recording** returns to the idle state without a transcript. **Permission denied, no microphone or an unsupported browser** show the existing alert and no transcript; typed practice stays usable.
- All existing guards stay: recording and an unapplied transcript lock navigation and submit, with the existing discard confirmation; stale-Stop, late-permission and track-ended handling are kept.
- Runtime config is unchanged: the public demo still requires `PRACTICE_TRANSCRIPTION_MODE=disabled` and `ALLOW_LOCAL_TRANSCRIPTION=false`, and `/api/practice/transcriptions` stays blocked (proxy 404). The browser-only mode is selected by `PUBLIC_DEMO_BUILD`, not by the transcription mode.

**Default profile:** the existing panel, server demo route and privacy copy (WAV goes to this app for validation) stay as they are, and the route stays question-agnostic. After the demo transcript returns, the client shows the active starter question's sample transcript in its place, but only when the response mode is `demo` and its text equals the server's standard demo fixture; empty, short or non-demo responses are shown as returned (follow-ups and earlier questions keep the fixture). Its button keeps its name "Use confirmed transcript".

### 3. Sample polished answer (technical starter questions)

- Each of the six software engineering and AI/ML starter questions has a prewritten sample polished answer (about 90–140 words, two or three short paragraphs) and its recording.
- It appears in the feedback's right column as the dark card in `feedback.html`: heading "Sample polished answer", the line "A prewritten example for this question, not a rewrite of your answer.", a play control (bright marigold on dark; accessible names "Play sample polished answer" / "Pause sample polished answer"), a read-only progress bar and time, the caption "AI-generated voice", and the text. Two or three key phrases are emphasized in bright marigold **and** semibold, so emphasis doesn't rely on color alone and survives forced-colors mode.
- With demo feedback the feedback becomes two columns when this card is present. With real feedback it sits above the model's suggested answer in the same right column.
- If the audio fails, only the play row is replaced by "Audio isn't available right now." and focus moves to the card's heading; the text stays.
- Never shown for behavioral questions (they keep the structure outline), follow-ups or earlier questions; those keep today's layout.

### 4. Session recap

- A **Session recap** button appears in the `/practice` header once the loaded history has at least one completed attempt. It uses the same guards as other navigation (`hardLocked`, discard confirmation).
- It opens an in-page view on `/practice` (no route change; browser Back still leaves the page, which is intended). Focus moves to the recap's `<h1>` "Session recap". **Back to practice** (a button) returns to the same question with drafts intact and focus on the question heading.
- Top line: in the public build and memory storage, "From this session's temporary history. No scores or assessments."; with durable storage, "From your saved practice history. No scores or assessments."
- One section per question with completed attempts, ordered by its latest attempt, newest first; each is an `<h2>` with the track, "Follow-up" when it is one, and the attempt count, then the question, then the first and latest attempts side by side, labeled with their numbers (one card when there is a single attempt; long answers wrap, never truncated), then "Rubric concepts to review next" as plain rows (omitted when the question has none).
- If older history isn't loaded yet (`history.cursor` present), the recap says "Showing recent attempts." and offers **Load older attempts**, which uses the existing loader.
- If the history becomes empty while the recap is open (for example a demo session reset), the recap shows "Your session history is empty. It may have reset." with Back to practice, and the header button disappears after returning.
- Nothing judges the answers: no checkmarks, counts of concepts covered, streaks or labels. Actions at the end: Back to practice, and **Start 3-question mock interview** (a link to `/mock-interview`). The mockup's "Try another question" button is left out.

### 5. Mock interview in the public demo

- The typed mock interview becomes available in the public build: the home-page button, the `/practice` header link, and the route. It still makes no API requests, gains Listen to the question, and its intro adds "Self-review only. Nothing is scored."
- `/legacy` and "Original voice demo" stay hidden and blocked in the public build.

## Content

- **Where it lives:** a separate module, `src/content/questions/sample-content.ts`, keyed by starter question ID, holding `sampleTranscript` (all nine), `polishedAnswer` (an array of paragraphs; its canonical text is `paragraphs.join("\n\n")`, used for speech and hashing) and `highlights` (exact phrases) for the six technical questions. It is **not** added to `InterviewQuestion`, so saved question snapshots and follow-ups are unchanged. The UI looks content up by ID only for starter questions.
- **Sample transcripts** (40–80 words): plausible first-draft spoken answers, clearly fictional, with room for improvement.
- **Polished answers:** accurate, concise answers a strong new graduate could give, consistent with the question's rubric, with no claims of personal experience. Decorative quotation marks are added by the UI, not stored or spoken.
- **Order of review, before any paid call:** GPT drafts the texts; the lead reviews them for accuracy; Gemini 4 Neon High reviews the texts on their own; only then is audio generated. If a later review changes a text, only that file is regenerated.

## Audio generation (one time, paid)

- **Model and cost:** `gemini-3.8-flash-tts` through the Gemini API. Its paid standard rate is $9 per million audio tokens at 25 tokens per second, equal to $0.00225 per 10 seconds, through 2026-12-31 ([Gemini API pricing](https://aistudio.google.com/docs/pricing), checked 2026-11-26). Planned audio is about 9 × 8 s plus 6 × 45 s, roughly 6 minutes, so about **$0.08**. The owner's approved budget is **$1**. Two prebuilt voices from the documented list (one for questions, a calm one for polished answers), recorded in the manifest.
- **Script** `scripts/generate-demo-audio.ts`, never referenced by `package.json` scripts, CI, the build or `src/`:
  - Without `--execute` it prints the plan (files, characters, estimated seconds at 2.5 words per second, estimated cost) and makes no network request. It refuses to run at all if the planned audio exceeds 15 minutes.
  - With `--execute` it refuses when `CI` is set, `ECHO_PUBLIC_DEMO=true`, `GEMINI_API_KEY` is missing, or `ffmpeg` is unavailable; it sends the key in the `x-goog-api-key` header and never logs headers or URLs.
  - Caps: at most 30 requests per run including retries (SDK retries off, a 60-second timeout per request); it stops when cumulative **generated** audio passes 15 minutes or the estimated cost passes $0.50.
  - It skips items whose text hash already matches the manifest; `--only question:<id>` or `--only answer:<id>` regenerates one item. A regenerated item's previous file is deleted.
  - It accepts the provider’s RIFF/WAVE PCM response (`audio/wav` or `audio/x-wav`) or its existing raw 24 kHz PCM format. It validates that the audio is 16-bit mono PCM, reads the WAV’s sample rate (16–48 kHz) and actual data length, and passes the PCM and its sample rate to `ffmpeg` for mono AAC at 64 kbps. No change to the paid-call guards or caps.
- **Output:** `public/audio/questions/<id>.<hash8>.m4a` and `public/audio/answers/<id>.<hash8>.m4a`, where `hash8` is the first 8 hex characters of the **audio file's** SHA-256 (so any regeneration changes the URL), and `src/content/questions/audio-manifest.json` with, per file: ID, kind, path, SHA-256 of the exact UTF-8 text, SHA-256 and size of the file, duration, model and voice. The manifest is imported at build time; the browser never fetches it. Expected total under 4 MB.
- **Run and check:** the lead runs it once locally with the existing private key (not printed), listens to every file, regenerates misreads with `--only`, and records the request count and estimated cost here.
- **Generation record (2026-11-26):** the first run stopped on request 1 because the model returns `audio/wav`, which the script didn't accept yet; the script was fixed to accept validated PCM WAV. The second run (15 requests, about $0.10) produced clips that began by reading the instruction aloud, so the script now sends only the text, and the clips were regenerated (15 requests, 325 seconds of audio, about $0.07). Two one-word probe requests checked the response format. Each final clip was checked by transcribing it with Gemini 3.8 Flash and comparing the words with the text: all 15 match; levels peak at or below 0 dBFS with no long silences. Estimated total spend, including the checks, is about $0.25 of the $1 budget.
- **Caching:** because each file name contains its file hash, successful responses for those hashed `.m4a` paths get `Cache-Control: public, max-age=31536000, immutable` (via a `next.config.ts` header rule scoped to the hashed-file pattern). Unknown audio paths still 404 with `private, no-store`.

## Boundaries

- No live AI call at runtime in any build; no visitor audio leaves the browser in the public build; no speech recognition anywhere; no rewriting of the visitor's own answer; no Gemini Live interviewer.
- No new API routes, storage or analytics.
- **Public proxy** changes, and nothing else:
  - allow `/mock-interview` and `/mock-interview/`;
  - allow audio only when the path is in an exact set built from the manifest (the 15 file paths), not by prefix or pattern.
  - Static audio must keep supporting range requests (206) through the proxy.
- **Headers:** the app sets no `Permissions-Policy` or `Content-Security-Policy` today, so the microphone (same origin) and audio need no header change. Don't add a policy that blocks them.
- Update `docs/public-demo-readiness.md` with a note that this release adds the mock interview, static audio and browser-only recording, and keeps `/legacy`, transcription and sign-in blocked.
- No deployment in this task.

## Accessibility

- Players are buttons with the names above, at least 44 px; the progress bar is `role="progressbar"` with an `aria-label`, `aria-valuemin`, `aria-valuemax`, `aria-valuenow` and `aria-valuetext` like "0:06 of 0:18", not live-announced.
- Recorder focus order and announcements as described in section 2; the sample transcript box has a `<label>` and is described by its notice.
- Recap: one `<h1>`, an `<h2>` per question, `<h3>` for its parts; Session recap and Back to practice are buttons; the mock-interview action is a link.
- All new colors use the tokens in `NOTES.md`.

## How to verify

1. Lint, typecheck, unit and integration tests, default and public builds pass.
2. **Unit:**
   - every starter question has a sample transcript and question audio;
   - every technical starter has a polished answer whose highlights each appear verbatim exactly once;
   - behavioral starters have none;
   - manifest text hashes match the current texts, file hashes and sizes match the files on disk, and `public/audio/` holds only the files in the manifest;
   - the proxy allows exactly the manifest's audio paths and rejects others (nested, `..`, encoded and unknown names);
   - the script in plan mode makes no network request, refuses `--execute` under each guard, and `--only` takes `question:` or `answer:`;
   - the caps stop it (with a mocked client).
3. **Playwright, default and public:**
   - Listen plays, pauses, resets, stops on every listed event, and only one sound plays at a time;
   - a 404 replaces the control with the status; nothing autoplays.
4. **Playwright, public recording** with a fake microphone:
   - no microphone request before Record;
   - after Stop, no request of any kind carries audio, and none goes to the transcription route;
   - the right sample transcript appears, and Use in answer draft works with its confirmation;
   - discard while recording, permission denied, and the two-minute limit behave as specified;
   - no recording panel on follow-ups.
5. **Default profile:** the server demo still runs, and the displayed transcript is the starter question's sample.
6. **Polished answer:**
   - shown for technical starters with demo feedback (two columns) and with real feedback (routed fixture, above the suggested answer);
   - never shown for behavioral questions, follow-ups or earlier questions;
   - an audio failure keeps the text.
7. **Recap:**
   - hidden with no attempts;
   - with attempts on two questions and a follow-up, it shows three sections in the right order with the first and latest attempts and the concepts;
   - "Load older attempts" appears when the history has more;
   - the empty-history state;
   - focus on open and on Back to practice;
   - drafts intact; guards respected.
8. **Public-demo CI image job:**
   - `/mock-interview` loads with no `/api/*` or external requests (audio allowed);
   - audio files load, including a range request;
   - unknown audio paths 404 without the long-lived cache header, and hashed files carry it;
   - `/api/practice/transcriptions` and `/legacy` 404;
   - zero outbound calls; no visitor audio in any request;
   - the sample-feedback notice still appears once.
9. **Screenshots** at 390 px and 1440 px:
   - practice with Listen, recording idle and the sample transcript (public);
   - technical feedback with the polished answer (demo and real), and behavioral feedback;
   - the recap with one question, and with several questions including a follow-up;
   - the mock interview with Listen.
   
   Gemini 4 Neon High does a visual review against the mockups.

## Audio handoff and local fixtures

- From the `voice-recap` checkout, `npx --no-install tsx scripts/generate-demo-audio.ts` prints the plan without using a key or accessing the network. The reviewed text plans 15 files, 363.6 seconds and about $0.0818. The script uses Kore for questions and Sulafat for polished answers. Only the lead runs the same command with `--execute` for step 4. Check the pronunciation of “idempotency” when listening; use `--only answer:swe-debugging` with `--execute` if that one file needs regeneration.
- The script writes the hashed `.m4a` assets under `public/audio/questions/` and `public/audio/answers/` and updates `src/content/questions/audio-manifest.json`. Commit the reviewed assets and the manifest together, run the manifest unit test, and rebuild both profiles. Controls, duration labels, the public proxy allowlist and immutable cache headers all use the bundled manifest. No code or runtime setting needs to change when the files are added.
- To test without buying audio, make a disposable copy of the checkout under the OS temp directory (exclude `.git`, `.next`, `node_modules`, and `.env*`). In the copy, run `npm ci` and `npx --no-install tsx tests/audio/prepare-demo-audio-fixtures.ts`; this uses mocked raw PCM and the same FFmpeg and manifest-writing code, with no provider request. Build and run the default and HTTPS public suites in that copy. Do not copy or commit the fixture files or its manifest back to the worktree. In an empty-manifest checkout, the four playback cases skip with an explicit reason and the other cases still cover the text-only fallback.

## Local verification

Node 22: lint, TypeScript, 100 unit tests, 3 integration tests, and both production builds passed. Chrome passed 62 default-profile cases with the empty manifest (four asset cases explicitly skipped), and all 66 in the disposable fixture build. The public spec passed all six local HTTPS cases both with and without fixtures, using Node-process restarts instead of Docker. The fixture run verified the exact-path allowlist, range requests and caching with real `.m4a` files. Tests saw no recording uploads, provider traffic or marker leaks. All 16 screenshots in `/tmp/echo-lead/vc-shots/` show synthetic answers and use silent AAC fixtures for the audio states. The production recordings, final pronunciation check, and image CI are still pending.

## Method, review and merge

1. GPT‑6.2‑Sol (high) in Pi drafts the texts, on branch `voice-recap` in its own worktree.
2. The lead reviews the texts, then Gemini 4 Neon High reviews them.
3. GPT builds the features and the script, without running it with `--execute`.
4. The lead runs the generation once, listens to the files and commits them.
5. Gemini 4 Neon High reviews the PR diff and the screenshots. The PR merges when those reviews have no open blocker or should-fix finding and CI passes (the owner's standing instruction).
