# Public demo update to `main` (`539c95b`)

**Status:** Approved by the owner on 2026-11-26 (including the provenance waiver) after Gemini 4 Neon High's review (REVISE, APPROVE WITH CHANGES, then APPROVE; all findings applied). **Launched on 2026-11-26** with the owner's explicit approval: `echo-coach-demo` serves `539c95b`. The preview has been deleted. See Record. Nothing has been built or deployed for this update.

## Goal

The public demo `echo-coach-demo` still runs the image built from `f471413` (deployed 2026-11-25; see `docs/public-demo-preview-deploy.md`). Update it to `main` at `539c95b53dfcb2eb6ea817ba3691d8fcc3d7a09b`, which adds:

- PR #11: three new practice questions, the retry cue, the next-question shortcut after a retry, and the typed mock interview (`/mock-interview`).
- PR #12: the visual refresh (ink and marigold).
- PR #13: question and sample-answer audio (15 static AI-generated clips), the browser-only recorder with a sample transcript, the sample polished answer, and the session recap.

The update keeps the demo's safety settings unchanged: no credentials, no paid calls at runtime, memory storage, one instance at most, and transcription, sign-in and `/legacy` blocked. The order is: build and gate the image in Cloud Build, check it on a private preview service, wait for the owner's launch approval, then move the public service to the same image digest.

## Out of scope

- Deleting the original `echo-coach` service, its Gemini key and its Firestore recap data. This is a separate proposal for after the launch.
- Workload Identity Federation to promote CI-built images (see "Image provenance").
- Any change to runtime settings, scaling, budget, domain or IAM of `echo-coach-demo` beyond the new image. The inert IAP leftovers from the first preview (the owner's accessor binding on `echo-coach-demo` and the "Echo demo IAP" OAuth client) stay; the preview below reuses that client.
- New audio generation or other paid API calls.

## Facts checked (read-only, 2026-11-26)

- `echo-coach-demo` (us-central1, project `echo-490312`, number `189032457820`) serves revision `echo-coach-demo-00002-lbj` at 100% (`latestRevision: true`) from `us-central1-docker.pkg.dev/echo-490312/echo-demo/echo-coach-demo@sha256:3e78d8d3df7bec0878607e0a515c1ca50ea408665fde3d10ce956b8e0fb667d8` (tag `f471413`). Revision `echo-coach-demo-00001-9jj` also still exists. Settings: ingress all, `allUsers` invoker, revision max 1 / min 0, service max 1, CPU throttled, service account `echo-demo-run` (no project roles), and the demo env with no credentials (`ECHO_PUBLIC_DEMO=true`, `USE_MOCK=true`, `PRACTICE_AUTH_MODE=demo`, `PRACTICE_STORAGE=memory`, `PRACTICE_TRANSCRIPTION_MODE=disabled`, `ALLOW_LOCAL_GEMINI=false`, `ALLOW_LOCAL_TRANSCRIPTION=false`, `AUTH_URL=https://echo-coach-demo-189032457820.us-central1.run.app`).
- `539c95b` is `origin/main`. CI on it (run `45917450449`) passed all three jobs, including the public-demo image suite, on base `node:22-bookworm-slim@sha256:be979e5523c76fa4d5ca4ebd3099078f220aa47ec39c48ad5b5df9314debd6eb`, the same base as the current deploy.
- Since `f471413` there are no changes to the Dockerfile, `.dockerignore`, `package.json`, the lockfile, runtime configuration or the rate limiter (`public-demo-admission.ts`). `next.config.ts` adds the audio cache headers. `src/proxy.ts` and `public-demo-paths.ts` add an exact-path allowlist for `/mock-interview` and the 15 audio files. No response header restricts the microphone.
- The 15 clips total 2.89 MB (6 answer clips, all for software engineering and ML questions; behavioral questions have question audio only).
- IAP's OAuth client is set at the project level (`gcloud iap settings get --project=echo-490312`), so a new Cloud Run service with IAP uses it without Console steps.
- Artifact Registry `echo-demo` holds one image of about 99 MB. Docker isn't installed on the lead's machine; Cloud Build has Docker.

## Record (2026-11-26)

- **Commit:** `539c95b53dfcb2eb6ea817ba3691d8fcc3d7a09b` (= `origin/main`). Archive 3.28 MB with `.dockerignore`, the 15 clips, the manifest and `deny-egress.mjs`. The archive check's original wording ("no `.env*` or `benchmarks/` entries") was too broad: the archive contains the tracked `.env.example` and `benchmarks/` sources, which are public in the repository and excluded from the image by `.dockerignore`. The wording in step 1 is corrected.
- **First build** `223f53bf-ddb0-45f6-9f40-3066e8663ed5` stopped at the probe step, before any push. `cloud-sdk:slim` has no `python3` on its PATH. Base pinning, the image build and the fail-closed check had passed. The probe step's image was changed to `python:3.12-slim-bookworm`; nothing else changed.
- **Build** `04e50096-fed6-4c43-a590-184919b905e7`: SUCCESS (3 min 53 s). Base `node:22-bookworm-slim@sha256:be979e55…bd6eb` pulled by digest. All gate steps passed: the fail-closed start printed the expected message, the probe printed "probe ok", and the logs step printed "logs ok". Image `us-central1-docker.pkg.dev/echo-490312/echo-demo/echo-coach-demo@sha256:f72c59952c1006fd1faa9aa551fd2794bd9fe45528461944ab72211606c7027b` (tag `539c95b`).
- **Preview:** `echo-coach-demo-preview`, revision `echo-coach-demo-preview-00001-dbd` at 100%, `https://echo-coach-demo-preview-189032457820.us-central1.run.app` (listed in `run.googleapis.com/urls`). Check 3.1 passed:
  - the digest above and the demo env with no credentials;
  - maxScale 1 on the revision and the service, no minimum (0), CPU throttled;
  - `echo-demo-run` (no project roles), IAP enabled;
  - invoker only the IAP agent, accessor only the owner.

  The first `iap web add-iam-policy-binding` returned without applying (most likely waiting on an interactive prompt); rerun with stdin closed, it applied. Check 3.2 passed: unauthenticated `curl -sSI` returns 302 to `accounts.google.com`.
- **Walk-through (check 3.3):** the owner looked through the preview ("looks good to me"). At the owner's suggestion, Gemini 4 Neon High (browser) then did the scripted walk-through in the owner's browser (task 4; recording kept locally), except pressing Record: the lead's task excluded granting the microphone, so the recorder was checked only by its idle text and by the absence of audio requests. Results:
  - The notices and disclosures appear as specified.
  - Question audio, polished-answer audio and mock-interview audio played.
  - The retry cue and the next-question shortcut appear; the follow-up has no recording panel.
  - The recap shows both sections with Back to practice at both ends.
  - The mock round ended early on the review screen.
  - Network: 35 requests, all to the preview host apart from one local browser-extension stylesheet. The only POSTs were three `/api/practice/evaluate` 200s. No request carried audio, and the mock-interview page made no `/api/` request.
  - Snippet: 24 of 25 rows passed, including all 15 clips (206, immutable), the unknown audio paths (404, `private, no-store`), the blocked paths (404) and the rate limit (120 × 200, then 429, `Retry-After 49`).
- **Encoded audio alias:** the failing row was `/audio/questions/swe-hash-map.eba300ad%2em4a`, which returned 200 with the real file. Cloud Run's Google front end decodes percent-encoded unreserved characters before the request reaches the app. On the current public service, `/practic%65` and `/%70ractice` return 200 and `/leg%61cy` returns 404. The app's allowlist therefore sees the decoded path: an encoded name can only reach an already-public file, and encoded blocked paths stay blocked. The build gate, which talks to the container directly, confirmed that the app itself returns 404 for the encoded form, matching CI. The expectation for this row was wrong for Cloud Run. The public checks in step 4 now expect the decoded file for this alias and add encoded blocked paths.
- **Logs (check 3.4):** 214 entries: 202 request logs, 6 stdout lines, audit and system entries. No match for the marker, the feedback notice, `echo-practice-demo`, `GCP_IAP`, `GCP_IAAP` or `cookie`. The two `authorization` matches are the audit log's `authorizationInfo` for the lead's deploy actions. Container output is only Next.js startup lines and one "Public demo refused a request at the rate limit."

- **Launch (owner approved, 2026-11-26 ~19:58 CST):**
  - Before: `spec.traffic` was `latestRevision: true` at 100%.
  - `gcloud run services update --image` created revision `echo-coach-demo-00003-4ks`, which serves 100% with the digest above.
  - The env, service account, scaling, CPU throttling and ingress are identical to the saved copy (`diff`), and `allUsers` is still the only invoker.
- **Public checks:** all passed.
  - `/`, `/practice` and `/mock-interview` return 200 with their headings.
  - All 15 clips: 206, exact `Content-Range`, immutable cache.
  - Both unknown audio paths: 404 with `private, no-store`. The `%2em4a` alias returns the decoded file (42,761 bytes).
  - 404 for `/legacy`, `/leg%61cy`, `/api/session`, `/api/history`, `/api/practice/Access`, and `/api/practice/transcriptions` and `/api/practice/transcription%73` (GET and POST).
  - The cross-site POST to `/api/practice/evaluate` returns 403.
- **Public logs** for `00003-4ks`: 60 entries. No `PUBLIC_CHECK_MARKER`, preview marker, `echo-practice-demo` or `cookie`. Container output is only Next.js startup lines.
- **Cleanup:**
  - Deleted `echo-coach-demo-preview`; its IAP policy now returns NOT_FOUND. Deleted revision `echo-coach-demo-00001-9jj`.
  - Deleted both builds' source objects and the local work directory. The first deploy's 320 KB source object remains.
  - Kept for rollback: revision `echo-coach-demo-00002-lbj` and the `f471413` image. The registry holds two images, 99 MB and 102 MB.

## Plan

All `gcloud` commands use `--project echo-490312` and, for Cloud Run, `--region us-central1`. `IMAGE` below means the full reference `us-central1-docker.pkg.dev/echo-490312/echo-demo/echo-coach-demo@sha256:<digest from step 1>`.

### 1. Build and gate (lead)

1. Confirm `git rev-parse 539c95b` and `git rev-parse origin/main` both print `539c95b53dfcb2eb6ea817ba3691d8fcc3d7a09b`.
2. Create a temporary directory outside the repository (`work=$(mktemp -d)`) and, from the repository, run `git archive --format=tar.gz -o "$work/src.tgz" 539c95b`. List it and confirm it contains `.dockerignore`, the 15 `.m4a` files, `src/content/questions/audio-manifest.json` and `tests/public-demo/deny-egress.mjs`, and no private files: no `.env*` other than the tracked `.env.example`, no `client_secret*` and no `benchmark-results/`. The tracked `benchmarks/` sources are present; `.dockerignore` keeps them and `.env.example` out of the image.
3. Submit from `$work` with the `cloudbuild.yaml` in the appendix (kept in `$work`): `gcloud builds submit src.tgz --config cloudbuild.yaml --project echo-490312`. Its steps pull and pin CI's base digest, build with `NEXT_PUBLIC_ECHO_PUBLIC_DEMO=true`, then gate the image before anything is pushed:
   - **Fail-closed start:** the image run with no env exits 1 with "Public demo requires matching build and production runtime flags."
   - **Egress tripwire and paths:** the image runs with the production demo env plus CI's `deny-egress.mjs` preload (which writes `PUBLIC_DEMO_UNEXPECTED_OUTBOUND` on any outbound socket attempt). A probe checks:
     - `/`, `/practice` and `/mock-interview` return 200.
     - All 15 manifest clips answer `Range: bytes=0-31` with 206, `Content-Range: bytes 0-31/<size>` and `Cache-Control: public, max-age=31536000, immutable`.
     - Three unknown or encoded audio paths return 404 with `private, no-store`.
     - `/legacy`, `/api/session`, `/api/history`, `/api/practice/Access` and `/api/practice/transcriptions` (GET and POST) return 404.
     - A cross-site POST to `/api/practice/evaluate` returns 403.
     - Finally, the container log contains no `PUBLIC_DEMO_UNEXPECTED_OUTBOUND` and no `BUILD_GATE_MARKER`.
   - Only if every step passes does Cloud Build push `…/echo-coach-demo:539c95b` and report its digest. Record the build ID and digest.

### 2. Private preview (lead)

A temporary service, `echo-coach-demo-preview`. A tagged no-traffic revision on `echo-coach-demo` is not used: tag URLs on a public service are public, and their origin differs from `AUTH_URL`, so the demo would refuse its own submissions.

```sh
gcloud run deploy echo-coach-demo-preview --project echo-490312 --region us-central1 \
  --image "$IMAGE" \
  --service-account echo-demo-run@echo-490312.iam.gserviceaccount.com \
  --no-allow-unauthenticated --iap \
  --min-instances 0 --max-instances 1 --max 1 --cpu-throttling \
  --set-env-vars ECHO_PUBLIC_DEMO=true,USE_MOCK=true,PRACTICE_AUTH_MODE=demo,PRACTICE_STORAGE=memory,PRACTICE_TRANSCRIPTION_MODE=disabled,ALLOW_LOCAL_GEMINI=false,ALLOW_LOCAL_TRANSCRIPTION=false,AUTH_URL=https://echo-coach-demo-preview-189032457820.us-central1.run.app
gcloud run services add-iam-policy-binding echo-coach-demo-preview --project echo-490312 --region us-central1 \
  --member serviceAccount:service-189032457820@gcp-sa-iap.iam.gserviceaccount.com --role roles/run.invoker
gcloud iap web add-iam-policy-binding --project echo-490312 --resource-type cloud-run --region us-central1 \
  --service echo-coach-demo-preview --member user:zihaoqi777@gmail.com --role roles/iap.httpsResourceAccessor
```

Both bindings are service-scoped; never grant them at the project level, which would also expose the private `echo-coach` service. After deploying, confirm the `AUTH_URL` value is listed in `run.googleapis.com/urls`. If IAP can't be enabled on the new service, stop and report; the preview never falls back to public access.

### 3. Checks on the preview

1. **Configuration (lead):** `gcloud run services describe` shows the recorded digest, min 0, revision and service max 1, CPU throttled, `echo-demo-run`, the env above with no credentials, and IAP on. `gcloud run services get-iam-policy` shows only the IAP agent as invoker. `gcloud iap web get-iam-policy --project echo-490312 --resource-type cloud-run --region us-central1 --service echo-coach-demo-preview` shows only the owner as accessor.
2. **Unauthenticated access (lead):** `curl -sSI <preview URL>` (no `-L`) returns 302 with `location: https://accounts.google.com/…`.
3. **Owner walk-through (about 15 minutes, signed in at the preview URL, desktop Chrome with DevTools open on the Network panel and "Preserve log" on).** Type only fictional text and include `PREVIEW_MARKER_K4M9` in every answer you submit.
   - Home, then `/practice`: the sample-feedback notice is shown; there's no sign-in or legacy link.
   - Switch to **Software engineering** and the hash-map question (behavioral questions have no polished-answer audio). **Listen to the question** plays and shows "AI-generated voice".
   - **Record answer:** allow the microphone, speak a few words, then Stop. The browser's microphone indicator turns off, and the editable "Sample transcript" appears. Choose **Use in answer draft**, add the marker and submit. From Record through submit, the Network panel shows no request carrying audio (`audio/*`, `multipart/*`, or `/api/practice/transcriptions`); the only POST is to `/api/practice/evaluate`.
   - Sample feedback and the sample polished answer appear; the polished answer plays.
   - **Retry the original answer:** the retry cue appears, then the next-question shortcut after the retry. Answer the **follow-up**: it has no voice capture.
   - Open **Session recap**: it lists the attempts with "No scores or assessments." Back to practice returns to the question.
   - Open **Mock interview**, play a question, and finish a round. The Network panel shows no `/api/` request on that page.
   - Across the whole walk-through, the Network panel's domains are only the preview host (plus Google sign-in pages when IAP asks).
   - With the DevTools device toolbar at 390 px wide, glance at `/practice` and the feedback page for overflow.
   - In a private window, the preview URL asks for Google sign-in.
   - Last, run the snippet in the appendix in the DevTools console on the preview page and paste its table into the chat. It checks all 15 clips, the unknown-path 404s, the blocked paths and the rate limiter (expect up to 120 × 200, typically 115–120, then 429 with `Retry-After`). The snippet doesn't touch cookies. IAP may alter `Cache-Control` on preview responses, so the snippet only reports the audio cache header and requires just `no-store` on the 404s; the build gate and the public checks enforce the exact values.
4. **Logs (lead):** read the preview's logs since deploy, using `gcloud logging read 'resource.type="cloud_run_revision" AND resource.labels.service_name="echo-coach-demo-preview"' --project echo-490312 --freshness 1d --format json`. In all entries (`textPayload` and `jsonPayload`), there must be no match for:
   - `PREVIEW_MARKER_K4M9`;
   - "This demo shows sample feedback";
   - `echo-practice-demo` (the session cookie), `GCP_IAP` or `GCP_IAAP` (IAP cookies), `cookie` or `authorization`.

   Container stdout and stderr contain only Next.js startup lines and the fixed "Public demo refused a request at the rate limit." The request logs show paths and status codes, not bodies. The tripwire check from step 1 is not repeated here, because the preload exists only in the build gate.
5. Record the results in this document. **Then stop:** changing the public service needs the owner's explicit launch approval. If the owner doesn't approve, do the cleanup in step 5 anyway and delete the candidate image.

### 4. Launch (lead, after the owner approves)

**Effects of the cutover:** with memory storage and one instance, switching traffic starts a fresh instance. Current visitors lose their temporary history; their next submit is refused with their draft kept. Tabs already open may need a refresh to load the new pages. A traffic split isn't used under one instance. If a public check fails, visitors see the new version until the rollback below, which takes effect within seconds.

1. **Before:** `describe` shows `spec.traffic` as `latestRevision: true` at 100%. Save the env and service-account section of `describe` for comparison.
2. `gcloud run services update echo-coach-demo --project echo-490312 --region us-central1 --image "$IMAGE"`.
3. **After:** `describe` shows the new revision at 100% in `status.traffic`, the new digest, and the env, service account and scaling unchanged from the saved copy. `get-iam-policy` still shows only `allUsers` as invoker.
4. **Public checks** on `https://echo-coach-demo-189032457820.us-central1.run.app`: the same probe as the build gate, except that the `%2em4a` alias is expected to return the decoded file (Google's front end normalizes it), plus encoded blocked paths `/leg%61cy` and `/api/practice/transcription%73` (GET and POST) returning 404 (all 15 clips with 206 and the immutable header, the unknown-path and blocked-path 404s, and the cross-site POST 403 with `Origin: https://not-the-demo.example`, `Content-Type: application/json` and body `{"answer":"PUBLIC_CHECK_MARKER"}`). Also, `/`, `/practice` and `/mock-interview` return 200 with their headings. The rate limiter is not exercised on the public URL, because it is shared by all visitors.
5. **Logs:** container stdout and stderr for the new revision contain only startup lines and fixed refusal messages, and no entry contains `PUBLIC_CHECK_MARKER`.
6. If any check fails, roll back (below), verify the rollback, and report.

### 5. Cleanup and record (always, including when the launch is not approved)

- Delete `echo-coach-demo-preview`. Then confirm that `gcloud iap web get-iam-policy --project echo-490312 --resource-type cloud-run --region us-central1 --service echo-coach-demo-preview` no longer returns a policy; remove the binding explicitly if it does.
- After a successful launch, keep the `f471413` image and revision `echo-coach-demo-00002-lbj` for rollback until the owner decides otherwise (two images, about 200 MB, within the 0.5 GB free tier). Delete revision `echo-coach-demo-00001-9jj`. If the launch is not approved, delete the `539c95b` image instead.
- Delete the temporary directory, and delete this build's source object from `gs://echo-490312_cloudbuild/source/`.
- Record the commit, base and image digests, build ID, revisions, URLs and check results in this document, and open a PR with the record.

## Image provenance (owner decision)

The deployed image is rebuilt in Cloud Build from the same inputs CI used (commit, Dockerfile, lockfile, build argument and base digest), not the image CI tested, which was never pushed. The first launch left this open: promote a CI-tested image (Workload Identity Federation) or run the CI image suite against the deployed digest. Neither is done here. **Approving this spec extends the owner's earlier waiver to this preview and launch.**

The checks run against the deployed digest: the Cloud Build gate (fail-closed start, egress tripwire, all paths and audio), the preview walk-through and snippet, logs, and the public checks. The following are verified only by CI on its own build, not on this digest:

- the egress tripwire during submissions (the gate covers only pages, audio and refusals);
- session isolation between browsers, and the cookie's `HttpOnly`, `Secure` and `SameSite=Lax` attributes;
- draft preservation across a restart;
- the full mobile layout (the walk-through only glances at 390 px).

Workload Identity Federation remains a follow-up.

## Cost

Within free tiers at demo traffic: one Cloud Build run, a second image in Artifact Registry, and a preview service that scales to zero and is then deleted. One open risk is egress. Audio files aren't rate-limited (only the practice API is), and each clip is up to 439 KB. Cloud Run's free egress is 1 GiB per month (then about $0.12 per GiB), and there's no CDN in front of it. Repeated automated downloads are bounded only by the one-instance cap. This was already true of the page assets, but audio makes each request larger. The existing `$5` monthly project budget alerts on spend but doesn't cap it, and whether its email reaches the owner has never been verified (owner step 4).

## Rollback and withdraw

- **To the previous version:** `gcloud run services update-traffic echo-coach-demo --project echo-490312 --region us-central1 --to-revisions echo-coach-demo-00002-lbj=100`.
  - Verify: `describe` shows `00002-lbj` at 100%; `/` and `/practice` return 200; `/mock-interview` returns 404 (the old build doesn't have it).
  - This pins traffic, so a later `services update --image` would create a revision with no traffic. To launch again, follow it with `gcloud run services update-traffic echo-coach-demo --project echo-490312 --region us-central1 --to-latest`.
- **To withdraw the demo:**
  - Make it unreachable: `gcloud run services update echo-coach-demo --project echo-490312 --region us-central1 --ingress internal`.
  - Or make it private: `gcloud run services remove-iam-policy-binding echo-coach-demo --project echo-490312 --region us-central1 --member allUsers --role roles/run.invoker`.
- **Preview:** delete `echo-coach-demo-preview`.

## Owner steps

1. Approve this spec, including the provenance waiver.
2. Do the preview walk-through and run the snippet (about 15 minutes).
3. Approve the launch, or ask for changes.
4. Optional: confirm in Billing → Budgets that the `$5` budget's alert email reaches you.

## Appendix: `cloudbuild.yaml` (temporary, outside the repository)

```yaml
steps:
  - id: base
    name: gcr.io/cloud-builders/docker
    script: |
      #!/usr/bin/env bash
      set -euo pipefail
      base=node:22-bookworm-slim@sha256:be979e5523c76fa4d5ca4ebd3099078f220aa47ec39c48ad5b5df9314debd6eb
      docker pull "$base"
      docker tag "$base" node:22-bookworm-slim
  - id: build
    name: gcr.io/cloud-builders/docker
    args: [build, --build-arg, NEXT_PUBLIC_ECHO_PUBLIC_DEMO=true, -t, us-central1-docker.pkg.dev/echo-490312/echo-demo/echo-coach-demo:539c95b, .]
  - id: fail-closed
    name: gcr.io/cloud-builders/docker
    script: |
      #!/usr/bin/env bash
      set -uo pipefail
      rc=0
      timeout 15s docker run --rm --network none us-central1-docker.pkg.dev/echo-490312/echo-demo/echo-coach-demo:539c95b > invalid.log 2>&1 || rc=$?
      cat invalid.log
      test "$rc" -eq 1 && grep -Fq 'Public demo requires matching build and production runtime flags.' invalid.log
  - id: start
    name: gcr.io/cloud-builders/docker
    script: |
      #!/usr/bin/env bash
      set -euo pipefail
      docker create --name app --network cloudbuild \
        -e HOSTNAME=0.0.0.0 -e ECHO_PUBLIC_DEMO=true -e USE_MOCK=true -e PRACTICE_AUTH_MODE=demo \
        -e PRACTICE_STORAGE=memory -e PRACTICE_TRANSCRIPTION_MODE=disabled \
        -e ALLOW_LOCAL_GEMINI=false -e ALLOW_LOCAL_TRANSCRIPTION=false \
        -e AUTH_URL=https://demo.invalid -e NODE_OPTIONS=--import=/tmp/deny-egress.mjs \
        us-central1-docker.pkg.dev/echo-490312/echo-demo/echo-coach-demo:539c95b
      docker cp tests/public-demo/deny-egress.mjs app:/tmp/deny-egress.mjs
      docker start app
  - id: probe
    name: python:3.12-slim-bookworm
    script: |
      #!/usr/bin/env bash
      set -euo pipefail
      python3 - http://app:8080 <<'EOF'
      import http.client, json, sys, time, urllib.request, urllib.error
      base = sys.argv[1]
      def get(path, **kw):
          req = urllib.request.Request(base + path, **kw)
          try:
              with urllib.request.urlopen(req, timeout=10) as r: return r.status, r.headers
          except urllib.error.HTTPError as e: return e.code, e.headers
      for _ in range(30):
          try:
              if get("/practice")[0] == 200: break
          except (OSError, http.client.HTTPException): pass
          time.sleep(1)
      else: sys.exit("app did not become ready")
      for p in ["/", "/practice", "/mock-interview"]:
          assert get(p)[0] == 200, p
      for a in json.load(open("src/content/questions/audio-manifest.json")):
          s, h = get(a["path"], headers={"Range": "bytes=0-31"})
          assert s == 206 and h["Content-Range"] == f"bytes 0-31/{a['size']}" and h["Cache-Control"] == "public, max-age=31536000, immutable", (a["path"], s, dict(h))
      for p in ["/audio/questions/not-bundled.12345678.m4a", "/audio/answers/nested/nonexistent.12345678.m4a", "/audio/questions/swe-hash-map.eba300ad%2em4a"]:
          s, h = get(p); assert s == 404 and h["Cache-Control"] == "private, no-store", (p, s, dict(h))
      for p in ["/legacy", "/api/session", "/api/history", "/api/practice/Access", "/api/practice/transcriptions"]:
          assert get(p)[0] == 404, p
      assert get("/api/practice/transcriptions", data=b"not audio", method="POST")[0] == 404
      s, _ = get("/api/practice/evaluate", method="POST", data=b'{"answer":"BUILD_GATE_MARKER"}',
                 headers={"Origin": "https://not-the-demo.example", "Content-Type": "application/json"})
      assert s == 403, s
      print("probe ok")
      EOF
  - id: logs
    name: gcr.io/cloud-builders/docker
    script: |
      #!/usr/bin/env bash
      set -euo pipefail
      docker logs app > app.log 2>&1
      docker rm -f app > /dev/null
      ! grep -Eq 'PUBLIC_DEMO_UNEXPECTED_OUTBOUND|BUILD_GATE_MARKER' app.log || { echo 'gate: outbound attempt or marker in app log'; exit 1; }
      echo 'logs ok'
images: [us-central1-docker.pkg.dev/echo-490312/echo-demo/echo-coach-demo:539c95b]
options:
  logging: CLOUD_LOGGING_ONLY
```

If a step fails, the image is not pushed; fix the cause or stop and report. The probe's audio paths come from the manifest in the source archive, and the unknown and encoded paths match the CI suite's.

## Appendix: preview DevTools snippet (owner)

Run in the DevTools console on the preview page, after the walk-through. It sends only same-origin requests and reads only status codes and headers.

```js
(async () => {
  const audio = [
    ['/audio/answers/ml-data-leakage.3f95d65e.m4a', 389361], ['/audio/answers/ml-imbalanced-metrics.b0c1682f.m4a', 368951],
    ['/audio/answers/ml-label-audit.8d5d75ae.m4a', 438940], ['/audio/answers/swe-debugging.4487a795.m4a', 379954],
    ['/audio/answers/swe-hash-map.0d429697.m4a', 351210], ['/audio/answers/swe-pagination.fb999c22.m4a', 360507],
    ['/audio/questions/behavioral-clarify.b5f1e5b7.m4a', 69479], ['/audio/questions/behavioral-project.2dce7ef3.m4a', 37685],
    ['/audio/questions/behavioral-setback.98e1cd26.m4a', 43483], ['/audio/questions/ml-data-leakage.847d8f72.m4a', 50654],
    ['/audio/questions/ml-imbalanced-metrics.ef30a0b1.m4a', 63345], ['/audio/questions/ml-label-audit.cacd908f.m4a', 125911],
    ['/audio/questions/swe-debugging.384d9307.m4a', 51207], ['/audio/questions/swe-hash-map.eba300ad.m4a', 42761],
    ['/audio/questions/swe-pagination.6bcbc217.m4a', 116679],
  ];
  const rows = [];
  const add = (check, ok, detail) => rows.push({ check, ok, detail });
  for (const [path, size] of audio) {
    const r = await fetch(path, { headers: { Range: 'bytes=0-31' }, cache: 'no-store' });
    add(path, r.status === 206 && r.headers.get('content-range') === `bytes 0-31/${size}`, `${r.status}; cache: ${r.headers.get('cache-control')}`);
  }
  for (const path of ['/audio/questions/not-bundled.12345678.m4a', '/audio/answers/nested/nonexistent.12345678.m4a', '/audio/questions/swe-hash-map.eba300ad%2em4a']) {
    const r = await fetch(path, { cache: 'no-store' });
    add(path, r.status === 404 && (r.headers.get('cache-control') ?? '').includes('no-store'), `${r.status}; cache: ${r.headers.get('cache-control')}`);
  }
  for (const path of ['/legacy', '/api/session', '/api/history', '/api/practice/Access', '/api/practice/transcriptions']) {
    const r = await fetch(path, { cache: 'no-store' });
    add('GET ' + path, r.status === 404, String(r.status));
  }
  const t = await fetch('/api/practice/transcriptions', { method: 'POST', body: 'not audio' });
  add('POST /api/practice/transcriptions', t.status === 404, String(t.status));
  const codes = [];
  let retry = null;
  for (let i = 0; i < 121; i++) {
    const r = await fetch('/api/practice/access', { cache: 'no-store' });
    codes.push(r.status);
    if (r.status === 429) { retry = r.headers.get('retry-after'); break; }
  }
  add('rate limit', codes.at(-1) === 429 && retry !== null, `${codes.filter(c => c === 200).length} x 200, then ${codes.at(-1)}, Retry-After ${retry}`);
  console.table(rows);
})();
```

After the snippet, the demo refuses practice requests for up to a minute; that's expected.
