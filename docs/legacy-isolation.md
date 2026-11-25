# Load the original voice prototype only on its own pages

**Status:** Implemented on branch `legacy-route-group` and verified locally against `origin/main` `b1856e7`. Spec reviewed twice by Gemini 4 Neon High (approve with changes; all findings applied). Root description wording approved by the owner.

**Results:** The home page's non-polyfill JavaScript dropped from 738 KB to 458 KB raw (197 KB to 136 KB gzip, measured with gzip level 9). `/practice` and `/legacy/missing` no longer reference either marker; `/legacy`, `/session/[id]` and the recap page still do. The route list, including static/dynamic markers, is identical to the baseline. Lint, `tsc`, 84 unit, 3 integration and 38 serial Chrome e2e tests passed with no test edits. A browser script against `npm run start` confirmed: one opening-question preload across `/legacy` → session → recap in the same document; leaving for `/practice` stays in the same document with no `/api/session/*` requests; pressing Back mounts a fresh provider (one new preload); `/legacy/missing` returns 404 with no prototype requests; `/` and `/practice` make no prototype requests. Titles and descriptions matched step 4 on every listed route. `/mock-interview` checks wait until the other contributor's work is merged.

## Problem

The root layout (`src/app/layout.tsx`) wraps every page in `LegacyCoachBoundary`. That client component statically imports `CoachProvider` and only decides at render time, from `usePathname()`, whether to mount it. Mounting is skipped on new pages, so no legacy requests run there (`tests/e2e/home.spec.ts` checks this). The code is still bundled into the root layout's client JavaScript.

Measured on a production build of `origin/main` (`b1856e7`, `npm run build`, which runs `next build --webpack`): the static home page (`/`) loads two chunks that also load on `/legacy`.

| Chunk | Contains (grep marker) | Raw | Gzip |
| --- | --- | --- | --- |
| `695-*.js` | `CoachProvider` and its `src/lib` helpers (`opening-question-preload`) | 27.5 KB | 7.9 KB |
| `95247769-*.js` | `@google/genai` client SDK used by the legacy Gemini Live adapter, `src/lib/gemini-coach.ts` (`BidiGenerateContent`) | 247.9 KB | 51.4 KB |

Together that is about 275 KB raw / 59 KB gzip. Across all non-polyfill `/_next/static/chunks/**/*.js` files referenced by `/` (738 KB raw / 198 KB gzip), that is 37% raw and 30% gzip. Every page under the root layout, including `/practice` and `/mock-interview`, receives the same layout chunks. The root `metadata.description` also still describes the original prototype ("Live interview expression coach for spoken grammar, phrasing, and professional answers").

## Intended change

Move the provider from a runtime pathname check to the route structure, using a Next.js route group (see the bundled guide at `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route-groups.md`):

```
src/app/layout.tsx                    root layout: <html>, <body>, globals.css; no provider
src/app/(legacy)/layout.tsx           new nested layout: <CoachProvider>{children}</CoachProvider>
src/app/(legacy)/legacy/page.tsx      moved from src/app/legacy/page.tsx
src/app/(legacy)/session/[id]/...     moved from src/app/session/[id]/... (page + recap)
src/providers/LegacyCoachBoundary.tsx deleted
```

- **URLs do not change.** Route groups are not part of the path, so `/legacy`, `/session/[id]` and `/session/[id]/recap` resolve as today. `src/app/api/session/*` and `src/app/api/history` are not moved.
- **`(legacy)/layout.tsx` is a Server Component nested layout.** It has no `"use client"` directive, so it can export `metadata`. It imports the client `CoachProvider` from `../../providers/CoachProvider` and renders it around `children`. It renders no `<html>`/`<body>`, so it is not a second root layout. Navigating between the prototype and the new pages stays a client-side navigation, as it is now, rather than the full page reload that multiple root layouts cause.
- **Provider lifetime within the prototype is unchanged.** Today `/legacy` → `/session/[id]` → `/session/[id]/recap` keeps one `CoachProvider` instance because the boundary renders the same element at the same position. Under the group layout, all three routes share one layout instance, so the provider persists the same way. Leaving the group (for example to `/practice`) unmounts it and runs its existing cleanup effect, as today.
- **Intended edge-case changes.** The current boundary matches by path prefix, so unmatched URLs such as `/legacy/missing`, `/session/a/b` or `/legacy-anything` render the root not-found page *inside* `CoachProvider`, which also fires the `opening-question-preload` request. After the change, those URLs render not-found without the provider and make no legacy request. No `error.tsx`, `not-found.tsx` or `global-error.tsx` exists under `src/app` today, so there is no custom error boundary whose position relative to the provider changes. If one is added later at the root, the provider will sit inside it.
- **Metadata.** Root `description` becomes the current product: "Practice behavioral, software engineering, and AI/ML interview answers, get specific feedback, and try again." This wording must be confirmed by the owner before implementation. The group layout exports the existing prototype description, so `/legacy`, `/session/[id]` and `/session/[id]/recap` keep it. The title stays "Echo Coach" everywhere (the other contributor's in-progress `/mock-interview` page sets its own title, which is unaffected).
- **Imports.** Moved files gain one directory level, so their relative imports of `providers/`, `lib/` and `types/` get one more `../`. A repository-wide search of `src/`, `tests/` and `scripts/` on `origin/main` shows `useCoachSession` and `CoachProvider` are used only by the three moved pages, `CoachProvider.tsx` itself and `LegacyCoachBoundary.tsx`, and `LegacyCoachBoundary` is imported only by the root layout. No test or config file references the old page file paths.

## Alternatives considered

| Option | Trade-off |
| --- | --- |
| **Route group with nested layout (chosen)** | Uses the framework's routing to scope the bundle. Removes the pathname check. Requires moving three page files. |
| Keep `LegacyCoachBoundary`, load `CoachProvider` with `next/dynamic` | No file moves, but keeps the runtime pathname check and adds an async chunk load before legacy pages render. With `ssr: false`, server rendering of the legacy pages would throw from `useCoachSession()` unless their children were also suppressed. |
| Lazy-import `src/lib/gemini-coach.ts` inside `CoachProvider` | Removes the SDK chunk only, still ships `CoachProvider` on every page, and modifies prototype code, which is out of scope. |
| Wrap each legacy page in its own provider | Simple per file, but the provider would remount between `/legacy` and `/session/[id]`, losing the session started on `/legacy`. Breaks the existing flow. |
| Separate root layouts for both groups | Isolates further, but every link between prototype and practice becomes a full page reload, and the home page must move into a group. More change than the problem needs. |

## Out of scope

- Changing, fixing or deleting the prototype's behavior, its API routes, `src/proxy.ts`, or `src/lib/*`.
- Moving prototype-only CSS (`nordic-grid`, `glass-card`, `glow-orb-*`) out of `globals.css`. It is small and stays global.
- Dependency upgrades, Dockerfile changes, or any other page's UI.
- New automated tests. Existing tests cover the prototype flow; the extra navigation check below is manual.
- Rewriting `docs/architecture.md`. It does not mention `LegacyCoachBoundary`.

## Coordination

Another contributor has uncommitted work on `main`. None of it touches the files above. Their e2e specs visit `/legacy` and `/session/...` by URL, which does not change. The branch is `legacy-route-group`, created from `origin/main` in a separate worktree. If their work lands first, rebase before merging and rerun the checks below.

## How to verify

Run all checks from a clean build: `rm -rf .next && npm run build` (the same `next build --webpack` command as the baseline). The build also regenerates `.next/types`, so run it before `npx tsc --noEmit`.

1. **Bundle.** Collect every `/_next/static/chunks/**/*.js` path (including nested `app/` chunks; URL-decode paths such as `%28legacy%29` before reading them from disk) referenced by a page's HTML (`<script src>`, `<link rel="preload">` and the `self.__next_f` flight payload).
   - Control: the chunks referenced by `.next/server/app/legacy.html` still contain both `opening-question-preload` and `BidiGenerateContent`.
   - Static `/`: no chunk referenced by `.next/server/app/index.html` contains either marker.
   - Dynamic `/practice` and `/mock-interview` (the latter only after the other contributor's work is merged): fetch the HTML from `npm run start`, apply the same check.
   - Report the before/after total raw and gzip bytes of all non-polyfill chunks referenced by `/`, using the same method as the baseline table.
2. **Existing checks pass unchanged:** `npm run lint`, `npx tsc --noEmit`, `npm run test:unit`, `npm run test:integration`, and the full serial e2e suite (`PLAYWRIGHT_CHANNEL=chrome CI=true npm run test:e2e -- --workers=1`). No test file is edited.
3. **Provider persistence and exit.** `CoachProvider` sends one `POST /api/session/speak` with body `sessionId: "opening-question-preload"` when it mounts, and never again while mounted. Other speak requests during a session use the real session ID and are not counted. Counting that request shows whether the same instance survived.
   - Automated: `tests/e2e/day3-flow.spec.ts` starts a session on `/legacy` and lands on `/session/[id]`, which redirects to `/` when the provider has no session. Passing proves the provider survived that step. `tests/e2e/recap-visual.spec.ts` checks that the recap Momentum Card still renders end to end. It does not by itself prove the provider survived the recap step, because the recap page can also load the card from `localStorage` or the recap API.
   - Manual, in `npm run start` with Chrome DevTools (Network tab, preserve log): go from `/legacy` through a mock session to `/session/[id]/recap`. Exactly one opening-question preload `POST /api/session/speak` fires across the three pages.
   - Exit, same session: on `/legacy`, record `performance.timeOrigin`, click "Try the new question-answer practice lab →", and confirm `/practice` has the same `performance.timeOrigin` (no document reload). Then press Back to `/legacy`. `performance.timeOrigin` is still unchanged and a new preload `POST /api/session/speak` fires, which only happens if the provider unmounted on exit and mounted again.
   - Not-found, in Chrome DevTools: `/legacy/missing` returns 404 and makes no `/api/session/*` request.
4. **Metadata.** From `npm run start`, read `<title>` and `<meta name="description">` in the server HTML (`curl`, before any client redirect): `/` and `/practice` show "Echo Coach" and the new description. `/legacy`, `/session/test-session` and `/session/test-session/recap` show "Echo Coach" and the prototype description. After the other contributor's work is merged, `/mock-interview` keeps its own title and shows the new root description.
5. **No route changes.** The build's route list matches the pre-change build of the branch base (20 app routes on `origin/main` `b1856e7`) with the same static (`○`) or dynamic (`ƒ`) markers. In particular `/` and `/legacy` stay static.
