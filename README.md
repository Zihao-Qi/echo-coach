# Echo Coach

## Reconstruction preview

The redesigned home is at `/`, the new-graduate practice workspace is at `/practice`, and the original voice demo remains at `/legacy`.

- Six curated starter questions across behavioral, software engineering, and AI/ML.
- Progressive hints, question-aware structured feedback, and separate retry attempts.
- [Retry comparison](docs/retry-comparison.md) shows before/after evidence, regressions, and a next focus using the same evaluation request; historical feedback and linked baselines remain accessible.
- [Targeted follow-ups](docs/follow-up-design.md) offer one optional focused question within that same evaluation. Original/follow-up drafts and retry histories stay separate; saved questions reopen with their historical snapshots. Gemini 4 designed and implemented the UI, followed by lead critique and independent GPT-6.1-Sol/high review.
- Default demo feedback is illustrative, **not an assessment of correctness**.
- Coaching now includes separate accuracy, reasoning, structure, and evidence findings. [Gemini evaluation setup](docs/gemini-evaluation.md) covers bounded local testing and the benchmark. The user's local configuration now uses Gemini 3.8 Flash / low thinking; the shared `.env.example` still defaults to mock feedback.
- Google sign-in via Auth.js, verified-email allowlisting, owner-scoped Firestore repositories, saved-attempt recovery, pagination, and transactional daily evaluation limits are implemented for real mode.
- Demo mode stores attempts in server memory per signed browser session. They survive a page refresh, but are **not durable or cross-device**.
- Real Google login can be tested without paid AI/storage: `PRACTICE_AUTH_MODE=google`, `PRACTICE_STORAGE=memory`, `USE_MOCK=true`. The UI labels preview storage and illustrative feedback.
- Real Google OAuth/Firestore integration requires setup and has not yet been credential-tested. Firebase association is not required.
- [Recorded-answer demo](docs/recorded-voice-ui.md): record → stop → edit a fixed example transcript → explicitly confirm your draft → separately request feedback. **It does not recognize your speech yet.** Audio goes to this app for validation, not Google. Real transcription and Live conversation remain upcoming. [Capture feasibility results](docs/recorded-voice-feasibility.md) cover the isolated 120-second Chrome test.
- Run `npm run test:unit` for workflow and API tests; `npm run test:integration` exercises real Next.js session handling with synthetic Auth.js cookies, without calling cloud services.

For real practice, configure Google Web OAuth credentials, `AUTH_SECRET`, canonical `AUTH_URL`, ADC, your email allowlist, `GEMINI_API_KEY`, and `GEMINI_EVALUATION_MODEL`, then set `USE_MOCK=false` (see [.env.example](.env.example) and [cloud setup](docs/cloud-setup.md)). No model is silently selected. Real endpoints require a validated Auth.js session for an allowlisted, verified Google account. **Legacy real-mode endpoints are blocked in production** because their persistence is not owner-scoped.

Plans and audit: [reconstruction plan](docs/reconstruction-plan.md), [current-project review](docs/current-project-review.md), [Opus-reviewed recorded-voice plan](docs/recorded-voice-plan.md).

## Original prototype

`Echo Coach` is a Next.js prototype for a live interview expression coach. The current MVP asks an interview question aloud, captures the user’s spoken answer, rewrites that answer into a clearer and more professional response, and lets the user replay the polished version for practice.

Architecture diagram:
- [docs/architecture.md](./docs/architecture.md)

Local development defaults to the mock coaching flow so the full product shell can be built without cloud dependencies. Real mode uses:
- Gemini Live for the spoken interviewer
- Chirp 3 for transcript capture
- Gemini 2.5 Flash for answer rewriting
- Gemini Flash TTS for practice playback
- Imagen 4 Fast for the recap cue card
- Firestore for persisted session recap/history

## Local Development

Start the app:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Real-Mode Development

To exercise the real cloud path instead of the local mock flow:

```bash
USE_MOCK=false npm run dev
```

That mode requires:
- `GEMINI_API_KEY`
- `GOOGLE_CLOUD_PROJECT`
- working Google Cloud authentication for Speech-to-Text V2
- `speech.googleapis.com` enabled on the active project

Optional:

```bash
GOOGLE_CLOUD_SPEECH_LOCATION=us
```

The transcript route defaults to `us`, which matches the current Chirp 3 setup path used by the app.

## Quality Checks

Run the static checks:

```bash
npm run lint
npm run build
```

Install the Chromium browser used by the checked-in Playwright suite:

```bash
npm run test:e2e:install
```

Run the browser tests:

```bash
npm run test:e2e
```

The checked-in Playwright suite forces `USE_MOCK=true` so browser tests stay deterministic and do not depend on cloud credentials.

## Original Cloud Run Deployment Reference

**Historical prototype instructions below are not the reconstructed app's release checklist.** Use [docs/cloud-setup.md](docs/cloud-setup.md) for private practice requirements. No reconstructed cloud deployment has been verified yet. Legacy real-mode API calls are blocked in production.

The container uses Cloud Run-compatible standalone Next.js output.

Required runtime environment variables:
- `USE_MOCK=false`
- `GEMINI_API_KEY`
- `GOOGLE_CLOUD_PROJECT`
- `GOOGLE_CLOUD_SPEECH_LOCATION=us`

Recommended one-time setup:

```bash
gcloud config set project echo-490312
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com speech.googleapis.com firestore.googleapis.com
```

Deploy:

```bash
cd /Users/xiaoxiawang/Desktop/Echo/echo-coach

gcloud run deploy echo-coach \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars USE_MOCK=false,GOOGLE_CLOUD_PROJECT=echo-490312,GOOGLE_CLOUD_SPEECH_LOCATION=us,GEMINI_API_KEY=YOUR_GEMINI_API_KEY
```

After deployment, open the service URL and run one real interview session end to end.

## Browser Test Coverage

- onboarding to session to recap happy path
- `Coach this answer` rewrite flow
- recap alignment with the coached answer
- invalid direct session route redirect
- invalid direct recap route redirect
- recap refresh redirect behavior

## Current Constraints

- The polished MVP is interview-only and English-only.
- The mock flow is fully verified, and the real cloud chain has passed a credentialed smoke test.
- The remaining validation is subjective browser QA with a real voice and speakers.
- TTS depends on Gemini quota; the app now falls back from `gemini-2.5-flash-preview-tts` to `gemini-2.5-pro-preview-tts` when the first model is exhausted.
