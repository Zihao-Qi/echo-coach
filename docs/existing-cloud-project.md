# Existing Google Cloud project inspection

Initial inspection was read-only after installing Google Cloud CLI and browser sign-in. Following user approval, Firebase Management, Identity Toolkit, and Cloud Resource Manager APIs were enabled. No IAM bindings, databases, or deployments were changed.

## Verified

- Project ID: `echo-490312`
- Display name: `Echo`
- Lifecycle state: `ACTIVE`
- Firestore default database exists in Native mode, region `us-central1`.
- Cloud Run service `echo-coach` exists in `us-central1`.
- Existing service URL: `https://echo-coach-zsc4hbbnsq-uc.a.run.app`
- Firestore, Cloud Run, Gemini Developer API (`generativelanguage.googleapis.com`), Speech-to-Text, and Text-to-Speech APIs are enabled, among other services.

## Not verified

- Initial Firebase/Auth inspection was blocked by disabled APIs; those APIs are now enabled.
- Firebase project association and Authentication configuration returned 404 before association was attempted.
- `projects.addFirebase` returned 403 despite the active account having Owner and all four documented setup permissions. Firebase association and web-app creation were not completed. Codex navigated to the existing-project association and stopped at Blaze pricing confirmation. Codex reported no pricing/legal acceptance or completed association. User subsequently selected Auth.js; no further Firebase association is needed.
- Existing application health, saved data, Gemini model quota, billing details, and backend IAM roles were not inspected.
- Backend Application Default Credentials setup and reconstructed app cloud integration are not yet verified.

## Google OAuth follow-up

User created/downloaded a Web client after choosing Auth.js. Its downloaded metadata matches `echo-490312`, origin `http://localhost:3000`, and redirect `http://localhost:3000/api/auth/callback/google`. Credentials were imported into ignored private local configuration; secret values are not recorded here. The local app advertises the registered callback correctly. Actual user sign-in remains to be verified. Shared OAuth branding and existing Desktop client were not modified by the assistant.

## Gemini key reuse

With user authorization, the existing Cloud Run `GEMINI_API_KEY` was imported securely into ignored local configuration (0600), without printing it or changing the deployed app. The key was accepted by the read-only Gemini model-list endpoint, which lists `gemini-3.8-flash` and `gemini-4-argon` for `generateContent`. Following explicit model/budget approval, ten Gemini 3.8 Flash / LOW generation calls succeeded. Token-rate estimated total was roughly $0.03, not a verified invoice. Real feedback is now enabled for user-initiated local practice with login off and memory-only history; no hosted deployment was changed.

## Next setup

User selected Auth.js + Google OAuth after reviewing Firebase pricing. Configure a Google Web OAuth client instead of completing Firebase association. Reuse the existing Firestore database; keep the original Cloud Run service unchanged and use a separate preview service for reconstruction validation. The three enabled APIs remain enabled; no service disabling or billing changes were performed.

Never copy CLI access tokens, service-account keys, or model API secrets into this document or source control.
