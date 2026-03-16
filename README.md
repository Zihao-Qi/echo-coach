# Echo Coach

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

## Cloud Run Deployment

The app is ready to deploy to Cloud Run with Docker.

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
