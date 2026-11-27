# Echo Coach

Echo Coach is an interview-practice workspace for new graduates. Work through behavioral, software engineering, and AI/ML questions, revise your answers, and compare attempts. Feedback is practice guidance, not a hiring decision or a score.

## Try the public demo

[Open Echo Coach](https://echo-coach-demo-189032457820.us-central1.run.app). The live demo needs no account or API key. Use fictional answers: feedback is illustrative, not an assessment, and server-side sample history is temporary.

- **Focused practice** (`/practice`) offers nine starter questions, progressive hints, retry comparisons, one-level follow-ups, and a session recap.
- **Typed mock interview** (`/mock-interview`) is a three-question round with optional self-review, not live AI coaching.
- **Audio practice** includes prerecorded questions and selected sample answers. The live demo can capture your voice for practice, but its editable transcript is a fixed sample, not your spoken words.

### Merged, not yet live on the public URL

[Browser speech recognition and bring your own Gemini key](docs/bring-your-own-key.md) are on `main` and in a private release preview. With no key, supported browsers can transcribe your speech through their own speech service; browsers without support keep the sample recorder. With your own key, you can get Gemini feedback, technical suggested-answer audio, recording transcription, and follow-up questions. The browser calls Google directly; Echo Coach’s server does not receive your key or recording. Gemini calls use your key’s quota and may incur charges. Key-mode history stays in the tab, separate from sample history.

See [current implementation and release status](docs/implementation-status.md) for what has passed and what still needs verification.

## Run locally

Use Node.js 22, the same major version as CI and the release image:

```bash
npm ci
npm run dev
```

Open [localhost:3000](http://localhost:3000). The default local setup uses mock feedback. See [`.env.example`](.env.example) for configuration; keep actual credentials in an ignored local file.

- **Private practice:** [Auth.js and Firestore setup](docs/cloud-setup.md) covers optional Google sign-in, owner-scoped history, and real server-side evaluation. This is separate from public browser key mode.
- **Local recording:** the [default recording flow](docs/recorded-voice-ui.md) validates captured audio and returns a fixture transcript when demo transcription is enabled. It is not real speech recognition.
- **Legacy prototype:** `/legacy` is retained outside the public profile. Its real-mode endpoints are blocked in production. Do not use legacy instructions to deploy the public demo.

## Verify changes

```bash
npm run lint
npx tsc --noEmit
npm run test:unit
npm run test:integration
npm run test:e2e:install
npm run test:e2e
```

CI also builds the public-demo image and exercises it over HTTPS with synthetic inputs and fake Gemini responses. No real key is needed for automated tests.

## Further reading

- [Progress and release status](docs/implementation-status.md)
- [Architecture](docs/architecture.md)
- [Retry comparison](docs/retry-comparison.md) and [targeted follow-ups](docs/follow-up-design.md)
- [Voice and recap release](docs/voice-and-recap.md) and [public deployment record](docs/public-demo-update.md)
