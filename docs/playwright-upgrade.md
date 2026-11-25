# Upgrade Playwright and unpin CI from ubuntu-24.04

**Status:** Merged in PR #6. Spec reviewed by Gemini 4 Neon High (approve with changes, then approve) and approved by the owner, who chose `ubuntu-latest`. Tracks issue #5.

**Local results:** Lockfile diff matches step 1 exactly. `npx playwright --version` prints 1.65.1. Lint, `tsc`, 84 unit and 3 integration tests passed. Serial e2e: 38 passed with bundled Chromium and 38 passed with installed Chrome (`PLAYWRIGHT_CHANNEL=chrome`).

**CI results:** PR #6 run `45705076734`: both jobs ran on `Image: ubuntu-26.04` (Ubuntu 26.04.1 LTS) and passed. `setup-node` resolved Node v22.23.5 from the tool cache, and `npm ci` succeeded. `npx playwright install --with-deps chromium` downloaded Chrome for Testing and Chrome Headless Shell 159.0.8154.6 with no unsupported-OS fallback. The e2e job reported `38 passed` in about 3 minutes, well within the 20-minute timeout. Each job logs one warning that `actions/checkout@v4` and `actions/setup-node@v4` target the deprecated Node.js 20 actions runtime. The same warning appears on the earlier 24.04 runs (PR #4), so this change didn't introduce it. Upgrading the actions is out of scope. After merge, the `push` run on `main` (run `45707587921`, commit `a34f54a`) passed both jobs on `ubuntu-26.04`, with `38 passed` in e2e. Issue #5 closed automatically from the merge.

## Problem

CI is pinned to `ubuntu-24.04` (PR #4, `docs/ci-runner-pin.md`) because Playwright 1.58.2 can't install Chromium on the `ubuntu-26.04` image that `ubuntu-latest` now uses. GitHub will eventually retire `ubuntu-24.04`, and both CI jobs would then fail together.

The Playwright 1.61 release notes say "Playwright now supports Ubuntu 26.04." The 1.65.1 package (latest, Nov 13) has `ubuntu26.04-x64` entries for host platform detection, its system dependency list, and Chromium download URLs. 1.60.0 has none.

## Intended change

1. Upgrade `@playwright/test` from `^1.58.2` to `^1.65.1` with `npm install -D @playwright/test@^1.65.1`. A dry run on a copy of the lockfile changes the root `packages[""]` devDependency range and four package entries: `@playwright/test`, `playwright` and `playwright-core` (1.58.2 → 1.65.1), and removal of the optional `fsevents` 2.3.2 that 1.58.2 pulled in. The caret matches the other devDependencies in `package.json`; `npm ci` keeps CI on the exact locked version.
2. In `.github/workflows/ci.yml`, change both `runs-on: ubuntu-24.04` lines back to `runs-on: ubuntu-latest` and remove the pin comments. The `npx playwright install --with-deps chromium` step stays.
3. Update `docs/ci-runner-pin.md`: mark the pin as removed by this change, and replace its stale "post-merge `push` run on `main` is still to be checked" line with the actual result (the push run after PR #4 passed both jobs).
4. Commit this spec as `docs/playwright-upgrade.md`, with its status and results updated before merge.

No application code, test, or `playwright.config.ts` change.

## Breaking changes reviewed (1.59 to 1.65)

From the full Playwright release notes for 1.59–1.65, checked against this repo:

| Version: change | Effect here |
| --- | --- |
| 1.65: actions wait for elements to be not `inert` | No `inert` in `src/` or `tests/`. |
| 1.65: text the browser doesn't render (closed `<details>`, unassigned slots) is no longer part of accessible names | The app uses `<details>` in `PracticeFeedback` and `FollowUpContextBanner`. The tests that query inside them (for example "Earlier attempts") open the disclosure first. All 38 e2e tests passed in the local trial. |
| 1.65: cookie matching follows RFC 6265 | `practice-api.spec.ts` calls `context().cookies()` without a URL, which returns all cookies as before. |
| 1.65: `APIRequestContext` `params` append to the existing query | `practice-api.spec.ts` uses `request` with `data` and `headers` only. |
| 1.65: TypeScript class fields follow `useDefineForClassFields` | `tsconfig.json` targets ES2017, where it is off. The one test class (`tests/audio/process-memory.ts`) has no initializer that reads a constructor parameter. |
| 1.65: `.css` imports in tests must exist | No style imports in tests. |
| 1.65: Node.js 20 no longer tested; use 22, 24 or 26 | CI uses Node 22. |
| 1.64: `screen` forwarded from device descriptors | `playwright.config.ts` spreads `devices["Desktop Chrome"]`, so `window.screen` is now 1920×1080. `page.setViewportSize()` in the mobile tests changes the viewport, not `screen`. `src/` has no `window.screen`, `matchMedia`, `@media` or `device-width` usage; its responsive classes key off viewport width. The mobile tests check overflow and visibility, not pixel snapshots, so they show no functional effect, not visual parity. If screen emulation ever matters, set `screen: undefined` in the config. |
| 1.64: JSX in tests follows `tsconfig.json` | No `.tsx` test files. |
| 1.64: elements in hidden iframes count as hidden | No iframes in tests. |
| 1.62: headless clipboard isolated from the OS | No clipboard use in tests. |
| 1.62, 1.63: Debian 11 and Ubuntu 20.04 dropped | Not used by CI. |
| 1.60: removed long-deprecated APIs (`ariaRef`, `exposeBinding` handle, `connect` logger, `videosPath`/`videoSize`) | None used. |
| 1.59: WebKit on macOS 14 and `experimental-ct-svelte` removed | Not used. |

## Local trial

In a separate worktree from `origin/main` (`b1a5e0f`), on macOS, with 1.65.1 installed without saving (`npm i --no-save`):

- `npx playwright install chromium --no-remove` downloaded Chrome Headless Shell 159.0.8154.6 (build 1255) alongside existing builds.
- Full serial e2e with the **bundled** browser (`CI=true npx playwright test --workers=1`, no `PLAYWRIGHT_CHANNEL`): 38 passed.
- `npx tsc --noEmit` (covers the e2e specs and `scripts/benchmark-recording.ts`, which also imports Playwright), ESLint, and 84 unit tests passed.

This shows the test code works on 1.65.1 on macOS. Only the CI run can show that Chromium installs and runs on `ubuntu-26.04`.

## Risks

- **System packages on 26.04.** `--with-deps` installs apt packages from 26.04's repositories each run. Package metadata in Playwright doesn't guarantee they resolve, or that the newer headless Chromium launches cleanly under 26.04's sandbox defaults and passes the fake-microphone voice tests (16 of 38). The CI run is the check.
- **Browser jump.** Bundled Chromium moves from 145.0.7632.6 (1.58.2) to 159.0.8154.6 (1.65.1). Behavior differences surface as e2e failures, which are out of scope to fix here (see below).
- **Node 22 on 26.04.** `setup-node` must provide Node 22 on the new image. Run `45676812021` already ran the checks job on 26.04 with Node 22 and passed.
- **npm cache.** `setup-node` keys the cache on OS family and lockfile hash. The lockfile change gives a new key; an older `~/.npm` tarball cache may still be restored by prefix, which is harmless for `npm ci`.
- **`ubuntu-latest` will move again.** When GitHub moves it to the next release, CI can break the same way. This spec accepts that in exchange for not having to re-pin by hand (see alternatives).
- **Actions runtime warnings.** `actions/checkout@v4`, `setup-node@v4` and `upload-artifact@v4` may log runtime deprecation warnings. Out of scope, but note them in the PR if they appear.

## Alternatives considered

| Option | Trade-off |
| --- | --- |
| **`^1.65.1` and `ubuntu-latest` (chosen)** | Latest release; bundles Chromium 159.0.8154.6 (the 1.65 notes list Chromium 158, tested against stable Chrome 157), close to the local Chrome 158 that `PLAYWRIGHT_CHANNEL=chrome` runs use. Tested locally. Returns CI to the original floating label that issue #5 asked for. |
| `~1.61.1` | Smallest step with Ubuntu 26.04 support and fewer breaking changes. Targets Chromium/Chrome 149, further from local Chrome, and untested locally. |
| Exact `1.65.1` instead of a caret | Prevents a future lockfile refresh from pulling a minor release with breaking changes. Differs from the other devDependencies; the lockfile already pins CI. |
| Pin `ubuntu-26.04` instead of `ubuntu-latest` | Predictable: no surprise OS change. Needs a manual bump before 26.04 is retired, the same chore as today's pin. |
| Keep the 24.04 pin and only upgrade Playwright | Leaves the retirement problem issue #5 exists to fix. |
| Run e2e in Playwright's container image | Decouples Playwright from the runner image. Larger workflow change than needed. |

## Out of scope

- Other dependency upgrades, including Next.js, `@types/node`, the Dockerfile's Node version, and GitHub Actions versions.
- Changes to `playwright.config.ts`, tests, or application code. If CI on 26.04 needs any of these, stop and return to this spec.
- Running `benchmark:recording`. Its types are checked, but `tests/audio/process-memory.ts` matches Chrome helper-process flags at runtime, which isn't verified on the new Chromium.

## Coordination

The branch is `playwright-upgrade`, from `origin/main` (`b1a5e0f`), in a separate worktree. The other contributor's uncommitted work changes `playwright.config.ts` (it sets `reuseExistingServer: false`) but not `package.json`, the lockfile, `.github/`, or `docs/ci-runner-pin.md`. Their config change is independent of the version bump. After this merges, their checkout needs `npm ci`. Their local runs use installed Chrome (`PLAYWRIGHT_CHANNEL=chrome`), so a browser download is optional.

## How to verify

1. `git diff --stat origin/main` shows only `package.json`, `package-lock.json`, `.github/workflows/ci.yml`, `docs/ci-runner-pin.md`, and `docs/playwright-upgrade.md`. The lockfile diff changes only the root devDependency range and the four package entries listed above. In `ci.yml`, only the two `runs-on` lines change.
2. Locally on the branch: `npm ci`; `npx playwright --version` prints 1.65.1; `npx playwright install chromium` if the browser isn't cached; `npm run lint`, `npx tsc --noEmit`, `npm run test:unit`, `npm run test:integration` pass; `CI=true PLAYWRIGHT_CHANNEL= npm run test:e2e -- --workers=1` reports 38 passed with none failed or skipped. Then a smoke run with installed Chrome: `CI=true PLAYWRIGHT_CHANNEL=chrome npm run test:e2e -- --workers=1`.
3. In the PR's CI run, for both jobs: "Set up job" shows `Image: ubuntu-26.04` and `Ubuntu 26.04.x LTS`; `setup-node` resolves Node 22; `npm ci` succeeds. The checks job passes all steps. In the e2e job, `npx playwright install --with-deps chromium` exits 0 with no unsupported-OS fallback message, and the suite reports 38 passed with none failed or skipped, within the 20-minute timeout. Any workflow warnings are noted in the PR.
4. After merge, the `push` run on `main` passes on `ubuntu-26.04`, and issue #5 is closed with a link to the PR.
