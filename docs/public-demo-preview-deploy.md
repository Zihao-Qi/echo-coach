**Status:** Deployed and verified as a private preview on 2026-11-25. The spec was reviewed by Gemini 4 Neon High before deployment (REVISE, then APPROVE WITH CHANGES; all findings applied); the record sections were reviewed after launch. The owner authorized the preview and accepted the rebuild deviation for the preview, then extended that waiver to the launch. **Launched publicly on 2026-11-25** with the owner's explicit approval (see Launch). The original `echo-coach` service was made private on 2026-11-26.

## Preview results (2026-11-25, before launch)

- **Budget:** `echo-490312 demo $5 monthly` created by CLI (50/90/100% of actual spend; default billing-admin email). This deviates from the plan below: the CLI needed `billingbudgets.googleapis.com`, which was enabled in addition to the two planned APIs (Artifact Registry and Cloud Build). Whether the owner's inbox receives the alert email has not been verified. An existing, separate monthly budget alert was left unchanged.
- **Build:** Cloud Build `0d6c1cf1-e8fe-4109-80f7-c878a5aabfb8` from `git archive f471413`, on the pinned base `be979e55…bd6eb` (matching CI). Image `us-central1-docker.pkg.dev/echo-490312/echo-demo/echo-coach-demo@sha256:3e78d8d3df7bec0878607e0a515c1ca50ea408665fde3d10ce956b8e0fb667d8`.
- **Service:** `echo-coach-demo`, revision `echo-coach-demo-00002-lbj`, 100% of traffic, at `https://echo-coach-demo-189032457820.us-central1.run.app`.
  - Settings: revision max 1 / min 0, service-level max set to 1 (the Console had left 20), request-based billing (CPU throttled).
  - Runs as `echo-demo-run`, which has no project roles. Only the demo env is set, with no credentials.
  - During the preview, the Run invoker was only the IAP service agent, and the IAP accessor was only `zihaoqi777@gmail.com`.
- **IAP setup:** the CLI deploy and a Console toggle didn't create an OAuth client in this no-organization project. With the owner's approval, Gemini (browser) created the Web client "Echo demo IAP" with the IAP redirect URI. The audience was already External/Testing with the owner as the only test user. The lead applied the client with `gcloud iap settings set`, without printing the secret. Unauthenticated requests then got a 302 to Google sign-in.
- **Walk-through (owner, then Gemini in the owner's browser):**
  - Gemini submitted a synthetic answer containing `PREVIEW_MARKER_7Q2X` (the precondition for the log check below).
  - Home and `/practice` show the sample-feedback notice, with no microphone, sign-in or legacy link. Every visible link leads to `/` or `/practice`.
  - The feedback is labeled "Illustrative demo feedback", and the notice appears beside it. The retry comparison works.
  - Hosted limit: 119 × 200, then 429 with `Retry-After: 33` (the page's own load request accounts for the 120th).
- **Logs:** 234 service log entries since deploy. Zero matches for `PREVIEW_MARKER_7Q2X`, the answer text, `echo-practice-demo` or `PUBLIC_DEMO_UNEXPECTED_OUTBOUND`. App text lines are only Next.js startup and the fixed "Public demo refused a request at the rate limit." Error Reporting is disabled in this project, so it holds no reports; stderr was covered by the log scan.
- **Withdraw rehearsal:** `--ingress internal` made the URL return 404. Restoring `--ingress all` brought back the IAP 302.

## Launch (2026-11-25) and follow-up (2026-11-26)

- The owner approved the launch, accepting the rebuilt image as tested by the preview checks rather than by promoting a CI-tested image.
- Ran `gcloud run services update --no-iap` and granted `allUsers` `roles/run.invoker`. Public checks: `/` 200 with the home content, `/practice` 200, `/legacy` and `/api/session` 404, and a cross-site POST to `/api/practice/evaluate` 403.
- Original `echo-coach` service: the owner asked for a low budget. The `$5` project budget already covers it (budgets apply per project). It was also capped at one instance at the service level (`gcloud run services update --max 1`) and kept serving through the launch. At launch it was still public and in real mode (`USE_MOCK=false`, with a Gemini key); it had no requests in the last 30 days. **Made private on 2026-11-26** at the owner's request: the `allUsers` invoker binding was removed (the service now has no invoker bindings) and its URL returns 403. The service, revision and key were kept, so this is reversible.
- Turning IAP off removed the IAP service agent's invoker binding (the demo's only invoker is now `allUsers`). Two inert preview leftovers remain: the owner's IAP accessor binding on the service and the "Echo demo IAP" OAuth client. Neither grants access while IAP is off; delete them if IAP is not reused.
- To withdraw: `--ingress internal`, or remove the `allUsers` binding.

**Still open after launch:** promote a CI-tested image (Workload Identity Federation) or run the CI image suite against this digest; and delete the original `echo-coach` service once the demo covers its features (owner's plan; it stays private until then).

## Facts checked (read-only, 2026-11-25)

- Project `echo-490312` (number `189032457820`) is active, and billing is enabled on account `0150B5-AFEE7B-C541FE`. The active gcloud account is `zihaoqi777@gmail.com`.
- The only Cloud Run service is the **original prototype** `echo-coach` in `us-central1`. It is publicly invocable (`allUsers` has `roles/run.invoker`), has ingress `all`, and per `existing-cloud-project.md` holds a `GEMINI_API_KEY`. This spec leaves it unchanged; see "Separate risk".
- Enabled: `run`, `iap`, `logging`, `monitoring`. Not enabled: `artifactregistry`, `cloudbuild`, `billingbudgets`.
- The project has no Google organization. IAP for Cloud Run supports that, but the first enable needs the Cloud Console (an External OAuth consent screen), because OAuth clients can't be created programmatically.
- CI on `main` (`f471413`, run `45734769883`) built the public image from `node:22-bookworm-slim@sha256:be979e5523c76fa4d5ca4ebd3099078f220aa47ec39c48ad5b5df9314debd6eb`.

## Owner steps in the Cloud Console (one time, about 5 minutes)

1. **Budget:** Billing → Budgets & alerts → create a monthly budget of **$5** for project `echo-490312` on billing account `0150B5-AFEE7B-C541FE`, with email alerts to billing admins at 50%, 90% and 100% of actual spend. Confirm that `zihaoqi777@gmail.com` receives billing-admin email. **Budgets alert; they don't cap spending.** It's done in the Console because the Budgets API is disabled and needs a quota project for user credentials.
2. **IAP first enable:** after the lead deploys the service (step 5 below), open Cloud Run → `echo-coach-demo` → Security, select Require authentication → Identity-Aware Proxy, and complete the External OAuth consent screen. Leave it in Testing with `zihaoqi777@gmail.com` as the only test user. The lead then manages access by CLI.

## What the lead creates (CLI)

1. **APIs:** enable `artifactregistry.googleapis.com` and `cloudbuild.googleapis.com`. Provision the IAP service agent with `gcloud beta services identity create --service=iap.googleapis.com`.
2. **Runtime identity:** a new service account, `echo-demo-run@echo-490312.iam.gserviceaccount.com`, with **no project roles**. The default compute service account has `roles/editor` and must not be used: it could read the prototype's secrets and call paid APIs.
3. **Artifact Registry:** one Docker repository, `echo-demo`, in `us-central1`. Keep only the deployed image (the free tier is 0.5 GB per billing account per month).
4. **Image build (Cloud Build):** submit `git archive --format=tar.gz f471413` with a temporary `cloudbuild.yaml` kept outside the repository. Its steps:
   1. `docker pull node:22-bookworm-slim@sha256:be979e55…bd6eb` (the exact CI base digest), then `docker tag` it as `node:22-bookworm-slim`, so the unchanged Dockerfile builds on CI's base. If that digest can't be pulled, stop.
   2. `docker build --build-arg NEXT_PUBLIC_ECHO_PUBLIC_DEMO=true -t us-central1-docker.pkg.dev/echo-490312/echo-demo/echo-coach-demo:f471413 .` (no `--pull`, so the pinned base is used).
   3. Declare the image under `images:` so Cloud Build pushes it and reports the manifest digest. Set `options.logging: CLOUD_LOGGING_ONLY`, so no build-log bucket is created.

   The upload creates the `echo-490312_cloudbuild` Cloud Storage bucket for the source archive (a few MB, within the free tier).
5. **Service:** a new Cloud Run service, `echo-coach-demo`, in `us-central1`, deployed **by digest**:
   - `--service-account echo-demo-run@…`, request-based billing (the default), `--min-instances 0`, `--max-instances 1`, all traffic to the one revision;
   - `--no-allow-unauthenticated --iap`, with `roles/run.invoker` granted only to `service-189032457820@gcp-sa-iap.iam.gserviceaccount.com`;
   - IAP access (`roles/iap.httpsResourceAccessor`) for `user:zihaoqi777@gmail.com` only;
   - env: `ECHO_PUBLIC_DEMO=true`, `USE_MOCK=true`, `PRACTICE_AUTH_MODE=demo`, `PRACTICE_STORAGE=memory`, `PRACTICE_TRANSCRIPTION_MODE=disabled`, `ALLOW_LOCAL_GEMINI=false`, `ALLOW_LOCAL_TRANSCRIPTION=false`, and `AUTH_URL=https://echo-coach-demo-189032457820.us-central1.run.app`. That is Cloud Run's deterministic URL (service, project number, region). It must be set on the first deploy, because the image refuses to start without an exact HTTPS origin. After deploying, confirm it's listed in the `run.googleapis.com/urls` annotation, since `status.url` may report the hashed URL. Cloud Run may also serve a legacy hashed URL; writes from that origin are refused by design, so share only the deterministic one;
   - no secrets or Secret Manager references. `DEMO_SESSION_SECRET` is left unset, so a restart issues fresh sessions, as the parent spec allows.

   If the first deploy with `--iap` warns that the project has no organization, deploy with `--no-allow-unauthenticated` only (still private: nobody can invoke it), have the owner do Console step 2, then add the IAP bindings by CLI.

## Deviation from check 5, owner waiver for the preview only

Check 5 prefers deploying the exact image CI tested. The CI image was never pushed, and promoting it needs Workload Identity Federation for GitHub Actions. For this **private preview only**, the lead rebuilds with identical inputs instead: the same commit, Dockerfile, lockfile, build argument and **pinned base image digest**. The hosted checks below run against the deployed digest. **Before any public launch**, either set up Workload Identity Federation to promote a CI-tested image, or run the CI image suite against the Artifact Registry digest. The owner's approval of this spec is the waiver for the preview.

## Checks on the deployed preview

1. `gcloud run services describe`: min 0, max 1, request-based billing, no warm minimum, all traffic on the one revision, IAP on, service account `echo-demo-run` (and `get-iam-policy` on the project shows it has no roles), the expected env with no credentials, the recorded digest. The Run IAM policy has `run.invoker` only for the IAP service agent, and the IAP policy has the accessor role only for the owner.
2. An unauthenticated `curl` to the URL is refused by IAP, not served by the app.
3. **Owner walk-through, about 5 minutes:**
   - Sign in at the URL and do home → question → sample feedback → revision.
   - Paste the marker `PREVIEW_MARKER_7Q2X` into the answer.
   - Check that the sample-feedback notice appears before and after submitting, and that there's no microphone, sign-in or legacy link.
   - In a private window, check that the URL asks for Google sign-in.
   - **Hosted limit:** on `/practice`, run a provided DevTools snippet that sends 121 requests to `/api/practice/access` and prints the status codes. Expect 120 × 200 then 429 with `Retry-After` (minus the few requests the page itself already made).
4. **Logs:** Cloud Logging for the service since deploy, plus Error Reporting: no `PREVIEW_MARKER_7Q2X`, no `PUBLIC_DEMO_UNEXPECTED_OUTBOUND`, no cookie values. The limiter and capacity refusals appear only as fixed text.
5. **Withdraw rehearsal:** set `--ingress internal`, confirm the URL stops serving, then restore `--ingress all` and confirm it serves again through IAP.
6. Record the commit, base and image digests, revision, URL and results in this spec and in a PR. Then stop: public exposure (removing IAP and granting `allUsers`) needs the owner's explicit launch approval.

## Cost

Within free tiers at preview traffic: Cloud Run (request-based, scales to zero), IAP (no charge on Cloud Run), Artifact Registry (one image, under 0.5 GB), Cloud Build (one build) and the source bucket. Not guaranteed $0; the budget alerts.

## Separate risk, not changed here

The original `echo-coach` service is open to anyone and holds a Gemini API key. If its code still makes real Gemini, speech or image calls, anyone with the URL can run up charges, and it has no instance cap. Recommend deciding, separately, whether to restrict or delete it. *Public access closed 2026-11-26: capped at one instance at launch and made private the next day (see Launch). The service and its key remain until it is deleted; revoke the key then.*

## Rollback

Delete the `echo-coach-demo` service, the `echo-demo` repository, the `echo-demo-run` service account, and the `echo-490312_cloudbuild` bucket if this deploy created it. Delete the IAP accessor binding and the "Echo demo IAP" OAuth client too. The enabled APIs and the budget can stay; they cost nothing unused.
