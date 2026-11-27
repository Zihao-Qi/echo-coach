# Bring your own Gemini key, and browser speech recognition (public demo)

**Status:** Approved by the owner on 2026-11-26 after Gemini 4 Neon High's review (REVISE, APPROVE WITH CHANGES, then APPROVE; all findings applied). Stage 1 in progress. Not implemented. Deployment is a separate release task.

## Goal

The public demo stays free to host and sample-only by default. A visitor who brings their own Gemini API key gets the real experience, paid by their key: real feedback on their answer, an AI-written suggested answer they can hear, transcription of their recordings, and real follow-up questions. The owner practices on the same site with his own key. Visitors without a key also get their own words transcribed when their browser can do it.

## Owner decisions (2026-11-26)

- **Key path:** the visitor's key is used only in their browser, which calls Google's Gemini API directly. The key never reaches our server. The server keeps its guarantees: no credentials, no outbound calls, nothing for logs to leak.
- **Key storage:** kept for the open tab by default. An opt-in "Remember in this browser" keeps it until the visitor removes it.
- **No key:** today's sample-only demo, plus browser speech recognition where the browser supports it.
- **Not revived from the old demo:** the recap's "Inferred Role Profile" and the Imagen "Momentum card".

## Delivery in three stages

Each stage is a separate PR with its own lead review, Neon code and visual review, and CI. They merge in order:

1. **Security headers:** Content-Security-Policy and related headers for the public build.
2. **Browser speech recognition** for visitors without a key.
3. **Bring your own key.**

The owner's approval of this spec covers all three. Deployment happens after stage 3, unless the owner asks for an earlier release.

## Out of scope

- Sending keys to our server, server-side Gemini calls in the public build, or storing key-mode history on the server.
- Other providers, streaming conversation (Live API), and voice or delivery grading.
- Recording on follow-ups and earlier questions. They stay typed-only in every mode, as today.
- Changes to the mock interview, which stays a typed, self-reviewed round.
- The default (local) profile. It gets no key mode and no new headers; only shared code moves so both builds use it.
- Deployment.

## Facts checked (2026-11-26)

- **CORS:** Google's Gemini API accepts browser calls from the demo's origin. Preflights for `POST` (headers `content-type, x-goog-api-key`) and `GET` (header `x-goog-api-key`) to `generativelanguage.googleapis.com` return 200 with the origin allowed.
- **Invalid keys:** a request with an invalid key returns **HTTP 400** with `status: "INVALID_ARGUMENT"` and `details[].reason: "API_KEY_INVALID"`, not 401.
- **SDK:** `@google/genai`'s web build contains both an `x-goog-api-key` header path and a `?key=` URL path. The browser code therefore uses plain `fetch` with the header (see Stage 3).
- **Gemini API terms** (https://ai.google.dev/gemini-api/terms):
  - With unpaid (free-tier) quota, "Google uses the content you submit to the Services and any generated responses to provide, improve, and develop Google products", human reviewers may read it, and users should not submit "sensitive, confidential, or personal information".
  - With paid quota, prompts and responses aren't used to improve products.
  - In the EEA, Switzerland and the UK, the paid-service data terms apply to all use.
- **Shared evaluation logic:**
  - The evaluation instruction, response schema, parser and submission schema are plain TypeScript. The server's evaluator calls `gemini-3.8-flash` (the owner's choice) with thinking LOW, at most 4,096 output tokens and a JSON response schema, and requires `finishReason` STOP.
  - `evaluateAttempt` then applies guards: excerpts must come from the answer, behavioral questions get no rewrite, and identical answers get no comparison. It imports `node:crypto` only for `randomUUID`.
- **Server trust:** the server never accepts feedback written by the client. The public server keeps sample attempts in memory per session cookie.
- **Evaluation output:** `AnswerEvaluation` already includes `suggestedAnswer` (shown as "Optional suggested answer" outside the demo), `followUp` and `comparison`.
- **Audio player:**
  - `AudioPlayer` plays only bundled manifest files and needs their duration up front.
  - It sets the progress width with an inline `style` attribute.
  - It has no loading state and no retry.
- **Headers and rendering:** the public build has no Content-Security-Policy. The app renders no raw HTML (no `dangerouslySetInnerHTML`, `innerHTML` or `eval`).
- **Tests:** the public browser tests abort every request that leaves our origin.

## Stage 1: security headers (public build only)

**Content-Security-Policy:** every page response in the public build carries one. Following the nonce approach in the installed Next 16 guide (`node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md`):

- The existing `src/proxy.ts` generates a fresh nonce per page request. Inside `publicDemoProxy`, and only for allowed page responses, it sets the CSP on the response and passes the CSP and an `x-nonce` request header on to rendering.
  - Its path allowlist, rate limiter and refusal responses stay exactly as they are; static assets and API routes need no CSP.
  - **Do not add the guide's `config.matcher`.** It excludes `/api` and prefetch requests, which would bypass the allowlist, the rate limiter, the audio allowlist and the legacy guard.
  - Public pages render per request (for example with `await connection()`), as nonces require. This is gated on `PUBLIC_DEMO_BUILD`, so default-profile rendering is unchanged.
- **Directives (production):**
  - `default-src 'self'`
  - `script-src 'self' 'nonce-<nonce>' 'strict-dynamic'`
  - `style-src 'self' 'nonce-<nonce>'`, plus `style-src-attr 'unsafe-inline'`. React `style` attributes, such as the progress bar's width, are style attributes that can't run script.
  - `img-src 'self' data: blob:`; `font-src 'self'`; `media-src 'self' blob:`; `worker-src 'self' blob:`
  - `connect-src 'self' https://generativelanguage.googleapis.com`. This limits where an injected script could send a key.
  - `object-src 'none'`; `base-uri 'self'`; `form-action 'self'`; `frame-ancestors 'none'`; `frame-src 'none'`
  - `upgrade-insecure-requests`, only when the request arrived over HTTPS (`x-forwarded-proto: https` or an `https:` URL). Otherwise local `next start` over HTTP would have its assets upgraded and break.
- The public build only runs with `NODE_ENV=production` (runtime validation refuses anything else), so there's no development variant to cover.
- **No fallback to inline scripts:** if a nonce can't be applied to a page, the implementer stops and reports. `script-src 'unsafe-inline'` is not an option.

**Other headers:**
- `Permissions-Policy: microphone=(self), camera=(), geolocation=()`.
- `Referrer-Policy: strict-origin-when-cross-origin`, so a key restricted to this site's address receives the `Referer` it needs.

**Default profile:** gets no new headers. This avoids interfering with its Google sign-in flow; the default profile is local-only.

**Verification:**
- Header tests on `/`, `/practice` and `/mock-interview` in the public build:
  - two requests get different nonces;
  - the rendered scripts carry the header's nonce;
  - the default profile gets none of the new headers.
- A browser test asserting zero `securitypolicyviolation` events and no CSP console errors while using sample practice, audio playback (including the progress bar), recording and the mock interview.
- The existing public-demo suite passes unchanged.

## Stage 2: browser speech recognition (no key)

Applies in the public build when no key is active.

- **Detection:** support (`SpeechRecognition` or `webkitSpeechRecognition`) is detected after mount, never during render, so the first render matches the server.
  - Until detection finishes, the panel shows today's copy.
  - Without support, the panel stays in `sample` mode: today's flow and copy, with the audio staying in the browser and the sample transcript shown.
  - With support, a failure after the visitor presses Record (a synchronous throw from `start()`, or `onerror`) shows a short error and keeps typing available. It never switches to the sample transcript.
- **Copy before recording, with support:** "Your browser turns your speech into text and may send your audio to its provider (such as Google, Apple or Microsoft). Echo Coach's server doesn't receive it."
- **Recording:**
  - **Record answer** stops any playing audio and starts recognition (`en-US`, continuous, interim results) without a separate `MediaRecorder`.
  - Between `start()` and `onstart` (while the permission prompt is open), the panel holds the existing locked "requesting permission" state. Cancel calls `abort()`, and an `onstart` that arrives after cancel, question change or unmount calls `abort()`.
  - The two-minute timer starts on `onstart`. Reaching the limit takes the same path as Stop.
  - The panel shows the words as they come. Interim words aren't announced to screen readers; the existing polite status messages are kept.
- **Stop:** calls `recognition.stop()` and shows "Finishing…", with the panel locked like the existing processing state.
  - If `onend` hasn't arrived within 3 seconds, the app calls `abort()` and uses the words received so far: the final results plus the latest interim text, capped at 10,000 characters.
  - Then the editable box labeled "Your transcript" appears with focus. **Use in answer draft**, **Re-record** and **Discard** work as today.
  - **Discard** and leaving the question call `abort()`.
- **Early end:** browsers may end recognition on their own after a pause. An unexpected `onend` moves to the transcript box with the words so far and the status "Recording stopped." There is no automatic restart.
  - Result handling uses `resultIndex` and final results, so repeated interim results aren't duplicated.
- **Errors:**
  - `onerror` (permission denied, no speech, network, or a browser that exposes the API but can't serve it) shows a short message, releases the microphone and keeps typing available.
  - The `onend` that follows an error does not replace the error with an empty box.
  - A `no-speech` error says "No speech was heard."
  - An empty successful result shows an empty editable box.
- **Locks and stops:** the recording lock, the discard confirmation and the stop events (switching question, track or attempt; submitting; opening the recap) apply as today.
- **Mode names:** the recorder and panel split their public-build branches into explicit modes: `sample`, `browser-speech` and, in Stage 3, `gemini-key`. The default profile keeps `server`. Wording such as "sample transcript" in confirmations and status messages follows the active mode, and so does the panel badge:
  - `sample`: "Browser only";
  - `browser-speech`: "Browser speech";
  - `gemini-key`: "Gemini · your key".

  The review box's label and description also follow the mode.

**Verification:** browser tests with a stubbed recognizer cover:
- live words, and Stop finishing normally;
- Stop when `onend` never arrives (the 3-second abort);
- an early `onend`;
- `onerror` followed by `onend`;
- `no-speech`, and an empty result;
- permission denied;
- no support, falling back to the sample flow;
- Discard aborting.

They also assert no hydration warnings, no request with audio, and no request to `/api/practice/transcriptions`. The owner checks Chrome by hand on the preview.

## Stage 3: bring your own key

### Modes

- **Sample mode (no key):** Stages 1 and 2 as described.
- **Key mode:** a visitor has added a working key. Feedback, the suggested answer and its audio, transcription and follow-ups come from Gemini under their key.

### Key dialog

- The control lives in the practice header only (`/practice`). It shows **Use your Gemini key** in sample mode, and a "Your Gemini key" badge with **Remove key** in key mode.
- It opens an accessible modal dialog: labeled, focus moves into it, Escape closes it, and focus returns to the button.
- **The field:** a password-type field with `autoComplete="off"` and `spellCheck={false}`. The value is trimmed. There's no form submission to any URL.
- **Text in the dialog:**
  - "Requests go from this browser straight to Google and are billed to your key. Your key is never sent to Echo Coach's server."
  - "On Google's free tier (outside the EEA, UK and Switzerland), Google may use what you send to improve its products, and people may review it. Don't include personal or confidential details."
  - "Tip: create a key for this site and restrict it to this site's address and the Generative Language API."
  - Links to Google AI Studio's key page and to the Gemini API terms.
  - A **Remember in this browser** checkbox, off by default, with the note: "Saved in this browser until you remove it. Anyone using this browser, and any script on this site, could read it."
  - "Key mode keeps its own practice history in this tab."
- **Check:** **Use key** sends one free metadata request, `GET …/v1beta/models/gemini-3.8-flash`, with the key in `x-goog-api-key`. It has a 15-second timeout and is aborted if the dialog closes. On success the mode switches. On failure the dialog explains (see Errors) and nothing is stored.
- **Storage:**
  - The key is kept in a module-level store in the browser, so moving between pages within the app keeps it.
  - By default it's gone on refresh or close. Key-mode history in `sessionStorage` survives a refresh and waits for the key to be added again.
  - With Remember, the key is also saved in `localStorage`. On page load, a remembered key turns key mode on without any network request; errors surface on the first action. A temporary network error never deletes a remembered key.
    - If `localStorage` throws on read, the page starts in sample mode.
    - If it throws on write, the key stays for this tab, with "Couldn't remember the key in this browser."
  - **Startup gate:** the key store is read after mount, before any server practice request. History, baseline and `/api/practice/access` requests wait for that check, and in key mode they don't happen at all.
  - **Removal in another tab:** a `storage` event saying the key was removed turns key mode off here immediately, without asking. It:
    - aborts any in-flight Gemini request and active recording;
    - discards unapplied voice state, including a kept WAV;
    - runs the full switch cleanup below.

    A key added in another tab is ignored here until this tab adds it.
- **Never:** the key is never put in a cookie, a URL, a request to our origin, `sessionStorage`, logs or the console.

### Switching modes

- Adding or removing a key is disabled while a submission, recording, transcription or audio generation is in progress. It asks first if an unapplied transcript exists.
- **On switch:**
  - All audio stops and generated audio URLs are released.
  - The selected attempt, the submission cache and the retry baseline are cleared.
  - A follow-up view returns to its root starter question.
  - An open recap closes if the new mode has no attempts.
  - Typed drafts for root questions are kept.
- **Server isolation:** in key mode, nothing reads from or writes to the server's practice API. History loading, focus refresh, baseline lookups and error recovery all use the local key-mode store. A test asserts zero `/api/practice/attempts` and `/api/practice/evaluate` requests in key mode.

### Feedback in key mode

- **Shared request and parsing:** a pure module builds the evaluation request and parses the response. Both the server's evaluator and the browser use it, so the two stay identical. It covers:
  - the content JSON (question, candidate answer, previous answer);
  - the instruction and the response schema (`z.toJSONSchema(evaluationResponseSchema)`, without `$schema`);
  - thinking LOW and the 4,096-token cap;
  - the STOP check, usage extraction, the submission schema (trimmed, 20–10,000 characters) and the guards.

  The guards move out of `evaluateAttempt` into this module, using `crypto.randomUUID()`.
- **Transport:** the browser calls `POST https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent` with `fetch`, the key only in the `x-goog-api-key` header, a 45-second timeout and **no automatic retries**. Every retry is the visitor's choice, because each costs money.
- **One canonical request:** the shared module defines the request once. A thin server adapter maps it to the SDK's parameters (`config`, `systemInstruction`, `contents`). A browser adapter maps it to the REST body (`generationConfig`, `systemInstruction: { parts }`, `contents: [{ role: "user", parts }]`). Unit tests check that both carry the same fields and values.
- **Reading REST responses:**
  - The browser uses only `candidates[0].content.parts` that aren't thoughts (`thought !== true`), concatenating their text. This applies to feedback and transcription; the SDK's `response.text` does the same on the server.
  - The parser requires `finishReason` STOP, and treats a missing candidate or `promptFeedback.blockReason` as an unusable response.
  - TTS reads the `inlineData` audio part.
- **Labels:**
  - The existing model line becomes "Gemini · gemini-3.8-flash · your key". The sample notice isn't shown.
  - The suggested answer appears below the feedback as "Optional suggested answer · try improving yours first", as in the default profile.
  - In the public build's key mode, the prewritten "Sample polished answer" card is not shown. The default profile keeps it.
  - Behavioral questions keep the structure outline, with no rewrite and no Play.
- **Retries and follow-ups** follow the server's rules against the local store:
  - A retry compares with the referenced earlier key-mode attempt.
  - A follow-up comes only from a stored feedback's follow-up proposal, one level deep, using the same question-building code as the server.

### History in key mode

- Key-mode attempts and their feedback are kept in `sessionStorage` for this tab: they survive a refresh and are deleted when the tab closes. The attempt list, retry comparison and recap read them in key mode.
- **Storage failures:** if storage is full or unavailable, the attempt stays in page memory and the visitor sees "This attempt can't be saved for a refresh." Corrupt stored data is ignored and reported once.

### Audio for the suggested answer

- **The player:**
  - **Play** sits on the suggested answer (technical questions only) with the label "AI-generated voice · uses your key".
  - Pressing it calls `gemini-3.8-flash-tts` once (voice Sulafat, as in the bundled answers) with only the suggested answer's text: `fetch`, a 60-second timeout, no retries.
- **Response formats:** the response can be raw signed 16-bit little-endian mono PCM (`audio/L16;…;rate=N`) or a WAV; both formats were seen during the audio generation run (`fd3ee16`). The browser checks that the audio is non-empty, has an even length, and has a sample rate of 16–48 kHz. It parses a WAV's RIFF chunks, not a fixed 44-byte header, and checks for PCM, 16-bit and mono, and that the `data` chunk fits the buffer. It wraps raw PCM in a WAV header and rejects anything else. Duration comes from the byte length and sample rate.
- **`AudioPlayer` extension:**
  - It accepts a generated source with the states idle, generating, playing/paused, and failed (with **Try again**).
  - Until the duration is known (idle and generating), it shows no progress ratio or clock.
  - The focus target on failure may be any element, not only a heading.
  - Double presses are ignored while generating, and the request is aborted if the answer leaves the page.
  - The one-sound-at-a-time and stop rules apply as today.
- **Caching:** the generated audio is cached for that answer while it stays on the page, so collapsing and reopening doesn't bill again. Switching attempt or question, opening the recap, removing the key, or leaving the page stops and releases it.
- **Quota:** a 429 or 403 from the TTS model says audio isn't available with this key. Feedback keeps working, and this error never marks the key as invalid.

### Recording and transcription in key mode

- **Recording:** the recorder works as in the default profile. The browser records and converts to the canonical WAV with the existing `normalize-recording`, keeping the 2-minute limit (at most about 3.8 MB of WAV, well under Gemini's inline limit).
- **Transcription request:** on Stop, the browser sends the audio straight to Gemini: `gemini-3.8-flash`, inline audio, a 60-second timeout and no retries.
  - Base64 encoding is done in chunks.
  - The settings are thinking minimal and at most 2,048 output tokens.
  - The instruction asks for the verbatim words only: no preamble, timestamps or formatting, and an empty result if there is no speech.
- **Result:** the editable transcript appears. **Use in answer draft** works as today; nothing is evaluated automatically.
- **Failures:** a failed transcription keeps the WAV in page memory so the visitor can choose **Try transcription again** without re-recording. The WAV is cleared as soon as transcription succeeds or the visitor discards it.
- **Copy:** "Your recording is sent from this browser to Google with your key for transcription, and discarded here once done."
- Our server receives no audio, and `/api/practice/transcriptions` stays blocked.

### Errors

Errors are classified by HTTP status and Gemini's `error.status` / `details[].reason`. Every failure keeps the draft, and nothing falls back to sample feedback.

| Condition | Message and action |
|---|---|
| 400 `API_KEY_INVALID`, or 401 | "Google didn't accept this key." Offers **Remove key**. |
| 403 `API_KEY_HTTP_REFERRER_BLOCKED` or `API_KEY_SERVICE_BLOCKED` | "This key's restrictions block this site or the Gemini API." Explains how to allow them. |
| 404 for a model | "This key can't use [model]." |
| 429 / `RESOURCE_EXHAUSTED` | "Your key's quota or rate limit was reached. Try again later." |
| Other 403 / `PERMISSION_DENIED` (for example a revoked or leaked key, or a disabled project) | "Google denied access for this key." Offers **Remove key**. |
| Other 400 (for example `FAILED_PRECONDITION`, such as an unsupported region) | "Google refused this request." |
| 5xx (`INTERNAL`, `UNAVAILABLE`) | "Gemini is temporarily unavailable. Try again." |
| Timeout or network error | "Couldn't reach Google. Try again." |
| Blocked or empty response (`blockReason`, no candidate) | "Gemini didn't return a usable answer for this text." |
| Malformed output, a guard rejection, or a non-STOP finish | "Gemini's response couldn't be used. Try again." |

Raw error text from Google is never shown or logged. **Remove key** is offered on failures during practice. In the key dialog, before anything is stored, the same messages appear without it. TTS quota and permission errors follow the audio rule above.

## Verification (Stage 3)

**Unit tests:**
- The shared request builder and parser give identical requests and results for the server path and the browser path.
- Guards in the browser path: excerpt rejection, the behavioral override, and identical answers.
- REST parsing: responses with `{ thought: true }` parts, for feedback and transcription; a missing candidate; `blockReason`; a non-STOP finish.
- Audio: raw PCM gets a valid WAV header; a valid WAV passes through; odd lengths, empty audio, out-of-range rates and wrong formats are rejected.
- Key store: memory by default; `localStorage` only with Remember; Remove clears both; the `storage` event works.
- History store: separate from sample history; storage failures and corrupt data are handled.

**Browser tests:**
- All Gemini traffic is routed to fakes with Playwright's `page.route`; there are no real calls in CI.
- **Key leakage**, asserted over every request using a sentinel key: the key appears only in the `x-goog-api-key` header of requests to `generativelanguage.googleapis.com`. It never appears in our origin's requests or bodies, in URLs, cookies, the console or `sessionStorage`. It's absent from `localStorage` without Remember, and after Remove.
- **Key check:** success, 400 `API_KEY_INVALID`, 403 referrer-blocked, and a timeout.
- **Key mode end to end:**
  - feedback, with the suggested answer above the follow-up;
  - the behavioral structure outline with no Play;
  - a retry with a comparison, and a follow-up;
  - the recap from key-mode history;
  - zero requests to the server's practice API.
- **Errors:** 400, both 403 kinds, 429, 5xx, a blocked response and malformed output mid-session, each keeping the draft.
- **TTS:** PCM and WAV fakes; an invalid format with Try again; a cache hit without a second request; one sound at a time alongside the question audio; TTS quota errors that keep feedback working.
- **Transcription:** a fake microphone and a fake response; failure, then Try again without re-recording.
- **Mode switching:** while on a follow-up; while recording (disabled); with an open recap; with drafts kept.
- **Remember:**
  - a reload with and without Remember;
  - zero `/api/practice/access` and `/api/practice/attempts` requests on a reload with a remembered key;
  - removal in another tab while on a follow-up and during an in-flight request;
  - `localStorage` that throws.
- **CSP:** zero violations throughout, including `blob:` playback.

**Public-demo suite (HTTPS):** sample mode is unchanged, including no outbound requests from the server. One key-mode run with routed fakes confirms the only external host contacted is `generativelanguage.googleapis.com`, and the server's logs contain no sentinel key.

**Manual:** the owner tries key mode on the private preview with his own key (a few cents), including Play and one transcription. Separately, he tries browser speech recognition in Chrome without a key.

**Visual review:** screenshots of the key dialog, key-mode feedback with Play, the generating and failed audio states, recording with live words, and the 390 px layout, reviewed by Gemini 4 Neon High.

## Method

Spec, then Gemini 4 Neon High review, then the owner's go. For each stage: Grok 4.7 High implements in a worktree, then the lead reviews, Neon reviews the PR diff and screenshots, and the PR merges when it's clear and CI is green. Deployment follows stage 3 as a separate release task with its own approval.
