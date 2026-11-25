# Pin CI to the Ubuntu 24.04 runner

**Status:** Implemented on branch `ci-pin-ubuntu-24.04`. Spec reviewed twice by Gemini 4 Neon High (approve with changes; findings applied) and approved by the owner. CI results are recorded below once the PR run finishes.

## Problem

Both CI jobs in `.github/workflows/ci.yml` use `runs-on: ubuntu-latest`. GitHub moved that label from the `ubuntu-24.04` image to `ubuntu-26.04` after the last green run on `main` (Nov 13, image `ubuntu-24.04` version `20261111.370.1`). On the new image the Playwright E2E job fails before any test runs:

```
Cannot install dependencies for ubuntu26.04-x64 with Playwright 1.58.2!
Error: ERROR: Playwright does not support chromium on ubuntu26.04-x64
```

This was first seen on PR #3 (run `45676812021`, image `ubuntu-26.04` version `20261116.202.1`). It is not caused by that PR. Any new run on `main` or a PR fails the same way. In that same run, the other job (lint, typecheck, unit and integration) passed on 26.04.

## Intended change

In `.github/workflows/ci.yml`, change `runs-on: ubuntu-latest` to `runs-on: ubuntu-24.04` for **both** jobs (`checks` and `e2e`), each with a one-line comment explaining the pin and pointing to this spec. Nothing else in the workflow changes. This spec is committed with the change as `docs/ci-runner-pin.md`, with its status updated to implemented before merge, matching how other specs live in `docs/`.

Both jobs are pinned so the two `npm run build` runs (in `test:integration` and in the Playwright web server) use the same image, and so the shared npm cache isn't written by two Ubuntu releases. The cost is losing early warning from the checks job on 26.04.

## Risks and follow-up

- **The pin is temporary.** GitHub will eventually deprecate and retire `ubuntu-24.04`, and both jobs would then fail together. The real fix is upgrading Playwright to a release that supports 26.04 and returning to `ubuntu-latest`, as a separate change. I haven't checked whether such a release exists yet. After this merges, open a GitHub issue to track that upgrade and unpin.
- **`ubuntu-24.04` is a rolling image.** It still receives updates, and `npx playwright install --with-deps chromium` installs system packages from 24.04's package repositories on every run. Future 24.04 updates could still break Playwright 1.58.2, though that is much less likely than an OS release change.
- **npm cache.** `actions/setup-node` keys the npm cache on OS family and lockfile hash, not Ubuntu release, so a cache written on 26.04 may be restored on 24.04. The cache holds package tarballs, not built `node_modules`, so this should be harmless. `npm ci` success in verification confirms it.
- **Playwright version.** `package.json` allows `^1.58.2`. CI uses the lockfile's `1.58.2` through `npm ci`. A lockfile update that bumps Playwright would change this picture and should be tested against the pinned image.

## Alternatives considered

| Option | Trade-off |
| --- | --- |
| **Pin both jobs to `ubuntu-24.04` (chosen)** | Two-line change plus comments. Returns to the image of the last green run. Needs a deliberate update before 24.04 is retired. |
| Pin only the E2E job | Smallest diff and keeps early 26.04 signal from the checks job. The jobs would build on different images and share an npm cache across two releases. |
| Upgrade Playwright to a 26.04-supporting version | Keeps `ubuntu-latest`. Changes dependencies and possibly browser behavior; not yet confirmed that a supporting release exists. Planned as the follow-up. |
| Run E2E in Playwright's official container (`mcr.microsoft.com/playwright:v1.58.2-noble`) | Decouples Playwright from runner OS changes and removes `install --with-deps`. Larger workflow change (container setup, Node version inside the container); not needed for a minimal unblock. |
| Use the runner's preinstalled Chrome (`PLAYWRIGHT_CHANNEL=chrome`) | Already supported by `playwright.config.ts`, but also requires removing the failing `npx playwright install --with-deps chromium` step and relying on the image's Chrome and system libraries. Less deterministic than Playwright's bundled Chromium, since Chrome updates with the image. |

## Out of scope

- Upgrading Playwright, Node, or any dependency.
- Other workflow changes (caching, artifacts, triggers, timeouts, containers).
- Changes to application code or tests.

## Coordination

The branch is `ci-pin-ubuntu-24.04`, created from `origin/main` in a separate worktree. The other contributor's uncommitted work does not touch `.github/` or `docs/ci-runner-pin.md`. PR #3 (`legacy-route-group`) is independent. After this merges, update PR #3 from `main` (rebase, or GitHub's "Update branch") so a new run uses the new workflow. Re-running PR #3's old failed run would not, because it replays the original commit and workflow file.

## How to verify

1. In the PR for this change, both jobs' "Set up job" logs show `Image: ubuntu-24.04` (Runner Image group) and `Ubuntu 24.04.x LTS` (Operating System group).
2. Both jobs pass: `npm ci` succeeds, `npx playwright install --with-deps chromium` exits 0, and all e2e tests pass with none failed or skipped (38 tests on current `origin/main`, `b1856e7`).
3. `git diff --stat origin/main` shows only `.github/workflows/ci.yml` and this spec (`docs/ci-runner-pin.md`). In `ci.yml`, only the two `runs-on` lines and their comments change.
4. After merge, the `push` run on `main` passes.
