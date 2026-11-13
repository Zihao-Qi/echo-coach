# Private practice cloud setup: Auth.js

User selected Auth.js + Google OAuth instead of Firebase Authentication. Firebase association/Blaze confirmation was not completed. The existing Firestore Native database and Cloud Run service remain available; no Firebase association is needed to use them.

## Required configuration

1. Use existing Google Cloud project `echo-490312`.
2. In Google Cloud Console → Google Auth Platform (or APIs & Services → Credentials), configure the OAuth app's branding, audience, support email, and authorized domains as required. Request only `openid`, `email`, and `profile`. For a testing audience, add your own account as a test user. Review any consent/legal prompts yourself.
3. Create a **Web application** OAuth client, preferably dedicated to the Echo Coach reconstruction. Configure `http://localhost:3000/api/auth/callback/google` for local development. Add the future preview app's exact HTTPS origin plus `/api/auth/callback/google` when known. This URI must match exactly.
4. Place `AUTH_GOOGLE_ID`, secret `AUTH_GOOGLE_SECRET`, and a randomly generated `AUTH_SECRET` (at least 32 characters) in ignored `.env.local` locally or managed secrets in hosting. Do not paste secrets into chat or commit them.
5. Set canonical `AUTH_URL` (origin only), `GOOGLE_CLOUD_PROJECT=echo-490312`, and server-only `PRACTICE_ALLOWED_EMAILS` to your Google account email. Hosted AUTH_URL must be HTTPS; plain HTTP is only allowed for localhost development.
6. First test Google login with `PRACTICE_AUTH_MODE=google`, `PRACTICE_STORAGE=memory`, and `USE_MOCK=true`. This uses real sign-in but illustrative coaching and process-local history, without Gemini/Firestore calls. Only after ADC is configured should you select `PRACTICE_STORAGE=firestore`. Choose a currently available Gemini evaluation model, configure `GEMINI_EVALUATION_MODEL` and secret `GEMINI_API_KEY`, and set `USE_MOCK=false` when paid model usage is intentionally enabled. Hosted real model evaluation requires Google auth and Firestore. A separate explicit loopback-only development exception supports login-free Gemini testing; see [Gemini evaluation](gemini-evaluation.md) for its guards and per-process limits. Model quality and pricing must be benchmarked before claiming reliable coaching.

Google OAuth consent or organization policy requirements may need user action. Do not create a new project or accept an agreement automatically to bypass a restriction.

## Local setup checkpoint

The user created a Web OAuth client and downloaded its JSON. Its project `echo-490312`, localhost origin, and exact callback were verified without printing credentials. Credentials were imported into ignored `.env.local` with mode 0600; the source download was also restricted to 0600 and retained. A fresh Auth.js secret was generated locally. The local provider callback was verified while Google authentication was enabled. User subsequently requested disabling login for development; current settings use `PRACTICE_AUTH_MODE=demo`, mock evaluation, and memory storage. Credentials are retained privately. Set `PRACTICE_AUTH_MODE=google` to resume Google login testing; actual Google sign-in/token exchange remains unverified.

The private configuration is excluded from Git and Docker; OAuth credential JSON filename patterns are excluded as well. No secret values should be added to reports or source control.

## Session and access design

- Auth.js handles OAuth validation, its sign-in/sign-out CSRF protections, and encrypted HttpOnly session cookies.
- Google profiles must have a verified email and match the configured allowlist before sign-in succeeds.
- The backend validates its Auth.js session and rechecks the email allowlist on every practice request.
- Stable storage owner IDs are `google:{Google subject ID}`, not mutable email addresses.
- Practice write endpoints additionally require the configured canonical Origin, preventing cross-origin cookie-authenticated writes.
- JWT sessions last eight hours. Normal sign-out clears the browser cookie; it does **not** immediately invalidate a stolen copied JWT. Removing an account from the allowlist immediately blocks its practice API access. Rotating AUTH_SECRET invalidates all sessions. A per-session revocation store could be added later.
- No Google access/refresh tokens are exposed to browser application code or used as practice bearer credentials.
- Auth.js Next.js v5 integration is currently a pinned prerelease (`5.0.0-beta.32`) supporting Next.js 16; upgrade it deliberately with tests rather than silently following a moving beta tag.

## Firestore credentials and permissions

The standalone `@google-cloud/firestore` client uses Application Default Credentials. For local development, use Google Cloud SDK ADC setup rather than a committed service-account key. For Cloud Run, attach a dedicated service account with Firestore document read/write permissions (for example `roles/datastore.user`). Firebase Auth lookup permissions are not needed.

The existing project has a default Native database in `us-central1`; do not recreate or delete it. Backend SDK calls use IAM, not browser Firestore Security Rules. The unused Firebase rules template was removed. Do not overwrite any existing rules without inspecting them and obtaining approval.

## Data layout

```text
practiceUsers/{encodedGoogleOwnerId}/attempts/{submissionUuid}
practiceUsers/{encodedGoogleOwnerId}/budgets/{utcDate}
```

Attempts are create-if-absent. Evaluation updates status, lease fields, evaluation, and provenance without overwriting the answer. Daily evaluation quota is reserved transactionally. Failed provider calls consume a reservation. This bounds provider attempts, **not dollar-denominated charges**; configure billing alerts and provider quotas separately. Cloud Run, Firestore, and Gemini can still incur usage charges even without Firebase.

History uses submitted timestamp plus document ID pagination. Verify the query against Firestore and create any service-requested index if needed.

## Release validation

- Verify correct Google redirect/callback behavior, verified email, and allowlist enforcement.
- Reject absent/expired/tampered sessions and cross-origin practice writes.
- Confirm answer persistence before evaluation; force a failure and recover the same saved attempt.
- Verify history across two devices signed into the same account and isolation from other accounts.
- Test daily quotas across instances and persistence after backend restart.
- Confirm hosted legacy real-mode API paths return 410.
- Verify the canonical hosted URL, OAuth redirect URI, secure cookies, IAM, and secret handling.
- Run a representative Gemini quality and cost benchmark.

Use a separate Cloud Run preview service; do not overwrite the original `echo-coach` deployment. No cloud release or real OAuth/Firestore validation is claimed by passing local demo tests.
