# Implementation and release status

**Last checked:** 2026-11-27. This is the current status page. Feature specs and earlier deployment records describe their own checkpoints, not necessarily what is live today.

| Status | What is available |
| --- | --- |
| **Live public demo** | Nine starter questions, hints, sample feedback, retry comparisons, one-level follow-ups, typed mock interviews, prerecorded audio, fixed sample transcripts, and a session recap. No account or key required. Sample history is temporary. |
| **Merged, in private release preview** | Public-only security headers, browser speech recognition without a key, browser-only Gemini key mode, and the live-verified transcription compatibility fix. These are **not yet live on the public URL**. |
| **Retained for local or private use** | Default mock development profile; optional Auth.js, Firestore, and server-side Gemini configuration for authenticated practice. The original prototype is separate at `/legacy`; its real-mode endpoints remain blocked in production. |

## Delivery milestones

- [Typed practice and mock interview (PR #11)](https://github.com/Zihao-Qi/echo-coach/pull/11), [visual refresh (PR #12)](https://github.com/Zihao-Qi/echo-coach/pull/12), and [voice and recap (PR #13)](https://github.com/Zihao-Qi/echo-coach/pull/13) are on the live public demo. See the [deployment record](public-demo-update.md).
- [Security headers (PR #15)](https://github.com/Zihao-Qi/echo-coach/pull/15) add a nonce-based Content Security Policy and a microphone permission policy to the public build.
- [No-key browser speech (PR #16)](https://github.com/Zihao-Qi/echo-coach/pull/16) adds live words and an editable transcript in supported browsers. Unsupported browsers keep the sample recorder. Some browsers use a remote speech service; Echo Coach's server does not get the recording.
- [Browser-only Gemini key mode (PR #17)](https://github.com/Zihao-Qi/echo-coach/pull/17) adds real feedback, technical suggested-answer audio, transcription, and one-level follow-ups. Requests go directly from the browser to Google, with no app-server key or audio upload. Key-mode attempts are stored separately in the tab; remembering the key in this browser is opt-in. Follow-up answers remain typed-only on the public profile.
- [Gemini transcription compatibility (PR #18)](https://github.com/Zihao-Qi/echo-coach/pull/18) uses the provider-supported `LOW` setting. No automatic paid retries are introduced.

## Verification and next gate

- The [CI run on the exact release candidate](https://github.com/Zihao-Qi/echo-coach/actions/runs/46048324293), `eac7f8c`, passed lint/typecheck/unit/integration, Playwright E2E, and the public release image smoke test. Browser CI uses routed fixtures, not a real Gemini key.
- Local HTTPS Chrome checks with synthetic input and the real Gemini service passed key validation, feedback, generated-answer playback, and transcription after the compatibility fix. No key or audio transfer to the app server was detected. This did not prove no-key dictation with a physical microphone.
- The candidate's Cloud Build gate checked the exact image's headers, sample submission, bundled audio, blocked routes and server egress. An owner-only hosted preview is available for acceptance checks; public traffic has not moved.
- **Before public launch:** complete real microphone dictation in Chrome without a key, check Gemini feedback/playback/transcription on the hosted preview, and check origin isolation, logs, and mobile layout. Then get explicit public-launch approval. Hosting and Google provider usage have separate costs; this is not a zero-cost guarantee.

## Reference documents

- [Browser speech and Gemini key mode design](bring-your-own-key.md)
- [Original public-demo readiness and limits](public-demo-readiness.md) and [current public deployment record](public-demo-update.md)
- [Voice and recap design](voice-and-recap.md), [retry comparison](retry-comparison.md), and [mock interview](mock-interview.md)
- [Private practice cloud configuration](cloud-setup.md) and [legacy isolation](legacy-isolation.md)
