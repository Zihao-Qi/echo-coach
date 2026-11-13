# Gemini 4 follow-up UI design proposal

Archived external design proposal, reviewed and modified before integration. Model: gemini-4-argon / LOW. Application UI source only; no credentials or personal answers supplied. This is not the current implementation specification; see [follow-up-design.md](follow-up-design.md).

Lead review rejected catalog-first historical fallbacks, provisional catalog metadata masquerading as source snapshots, and a monolithic 1,000-plus-line workspace. Gemini revised the implementation into components, a session hook, and target helpers, with saved-follow-up discovery and explicit source context. Independent GPT-6.1-Sol/high review then required per-target recovery caches and pending-safe header links; Gemini supplied those fixes. The proposal's single `submissionRef` and catalog-first examples below are retained only as historical advice, not accepted code.

### 1. Component & Hook Boundaries

*   **`PracticeSession` (Updated State Container):** Manages active focus (`root` vs `followup`), draft map (`Record<string, string>` keyed by `activeQuestion.id`), and submission payload construction.
*   **`FollowUpCallout` (New Presentational Component):** Rendered inside the "Answer feedback" section when viewing a completed root attempt (`!latest.followUpOfAttemptId`) that contains `latest.evaluation.followUp`. Displays `prompt`, `rationale`, `focus` badge (mapped via `evaluationCriteria`), and `expectedConcepts` pills, plus two actions: **"Answer follow-up"** (primary) and **"Retry original question"** (secondary, focuses `#practice-answer`). Hidden on follow-up attempts (enforcing depth = 1) and legacy records without `followUp`.
*   **`FollowUpContextBanner` (New Presentational Component):** Rendered at the top of the question card when practicing a follow-up (`activeQuestion.origin === "follow-up"`). Displays parent context (collapsible excerpt of the source root answer, loading/error state via `useAttemptBaseline(followUpOfAttemptId, ...)`), and a **"Return to original question"** button.
*   **`useAttemptBaseline` (Reused Hook):** Invoked a second time in `PracticeSession` for `activeFollowUp?.followUpOfAttemptId` to resolve the parent source attempt via `GET /api/practice/attempts/[id]` if paginated out of `history.records`.

---

### 2. State Model & Explicit Transitions

Replace single `questionId` state with a union focus state:
```ts
type ActiveFocus =
  | { kind: "root"; rootQuestionId: string; snapshotFallback?: InterviewQuestion }
  | {
      kind: "followup";
      rootQuestionId: string;
      followUpOfAttemptId: string;
      question: InterviewQuestion; // From makeFollowUpQuestion or record.questionSnapshot
      rootSnapshot?: InterviewQuestion;
    };
```
*   **Derived `activeQuestion`:**
    *   If `focus.kind === "root"`: `starterQuestions.find(q => q.id === focus.rootQuestionId) ?? focus.snapshotFallback`.
    *   If `focus.kind === "followup"`: `focus.question`.
*   **Drafts & Attempts Scoping:**
    *   `answer = drafts[activeQuestion.id] || ""` (keeps root `q-id` and `followup:<sourceAttemptId>` drafts strictly isolated).
    *   `questionAttempts = attempts.filter(a => a.questionId === activeQuestion.id)` (isolates retry history per specific question).
    *   Sidebar attempt counters count all attempts sharing the root: `attempts.filter(a => (a.rootQuestionId ?? a.questionId) === q.id).length`, plus a subtle indicator if follow-ups exist under that starter question.
*   **Transitions (All disabled while `pending === true`; none trigger evaluation):**
    1.  **Select Track / Starter Question:** Sets `focus = { kind: "root", rootQuestionId: id }`, clears `selectedAttempt`, `error`, `hintCount`.
    2.  **Click "Answer follow-up" (from `latest` root attempt):** Calls `makeFollowUpQuestion(activeQuestion, latest.id, latest.evaluation.followUp)`. Sets `focus = { kind: "followup", rootQuestionId: latest.rootQuestionId ?? latest.questionId, followUpOfAttemptId: latest.id, question: derivedQ, rootSnapshot: latest.questionSnapshot ?? activeQuestion }`. Sets `selectedAttempt = null` (or latest existing attempt for `derivedQ.id`).
    3.  **Click "Return to original question":** Resolves root from `starterQuestions.find(q => q.id === focus.rootQuestionId) ?? focus.rootSnapshot ?? sourceAttempt?.questionSnapshot`. Sets `focus = { kind: "root", rootQuestionId, snapshotFallback }`.
    4.  **Reopen Saved / Failed Attempt (`recover(record)`):**
        *   If `record.followUpOfAttemptId`: resolves `question` from `record.questionSnapshot` (or derives via `makeFollowUpQuestion` if `sourceAttempt` is loaded). Sets `focus = { kind: "followup", rootQuestionId: record.rootQuestionId!, followUpOfAttemptId: record.followUpOfAttemptId, question }`.
        *   If root attempt: sets `focus = { kind: "root", rootQuestionId: record.rootQuestionId ?? record.questionId, snapshotFallback: record.questionSnapshot }`.
        *   Populates `drafts[record.questionId] = record.answer` and sets `submissionRef.current = { submissionId: record.id, questionId: record.rootQuestionId ?? record.questionId, followUpOfAttemptId: record.followUpOfAttemptId, previousAttemptId: record.previousAttemptId, answer: record.answer }`.
    5.  **Submit (`POST /api/practice/evaluate`):**
        *   Payload always sends curated root `questionId: focus.rootQuestionId`, `followUpOfAttemptId: focus.kind === "followup" ? focus.followUpOfAttemptId : undefined`, `previousAttemptId: latest?.id` (which is scoped to `activeQuestion.id`, so the first follow-up attempt has `previousAttemptId: undefined` and retries of that follow-up link to the prior follow-up attempt), `answer`, and `submissionId`.
        *   Never sends prompt or rubric. Reuses `submissionRef.current` across network retries unless `activeQuestion.id` or `answer` changes.

---

### 3. Failure Cases & Edge-Case Handling

*   **Catalog Removal / Missing Root Snapshot:**
    *   If a saved attempt references a `rootQuestionId` removed from `starterQuestions`, `record.questionSnapshot` (or `sourceAttempt.questionSnapshot`) renders the question.
    *   If practicing a legacy/focused follow-up whose parent attempt isn't in `starterQuestions` and lacks `rootSnapshot` (even after `useAttemptBaseline` resolves), the **"Return to original question"** button is rendered `disabled` with helper text: *"Original question is no longer in the active catalog"*—preventing crashes.
*   **Unloaded Parent Source Attempt:**
    *   When reopening a saved follow-up after page refresh, `useAttemptBaseline(focus.followUpOfAttemptId, ...)` fetches the parent root attempt in the background to display parent answer context without blocking follow-up drafting or retry comparison. If the fetch fails, `FollowUpContextBanner` shows a non-blocking inline error with a "Retry loading parent answer" button.
*   **Failed Follow-Up Submission Recovery:**
    *   If `POST /api/practice/evaluate` fails mid-flight, `submissionRef.current` retains the exact `{ submissionId, questionId: rootQuestionId, followUpOfAttemptId, previousAttemptId, answer }`. Clicking "Reopen saved answer" in the "Saved answers awaiting feedback" panel restores focus to the follow-up and reuses `record.id` as `submissionId`.
*   **Hint Visibility on Follow-Ups:**
    *   `makeFollowUpQuestion` produces `hints: []`. When `activeQuestion.hints.length === 0`, hide the hint button bar cleanly rather than rendering a dead disabled button.

---

### 4. Accessibility

*   **Focus Management:** Switching between root and follow-up via "Answer follow-up" or "Return to original question" moves focus to the question heading (`<h2 tabIndex={-1}>`) and announces the context change via the existing `sr-only` `role="status"` live region. Clicking "Retry original question" focuses `#practice-answer`.
*   **Landmarks & Labels:** `FollowUpCallout` uses `<section aria-labelledby="followup-heading">`. `FollowUpContextBanner` uses `aria-label="Follow-up context"`. Disabled "Return to original question" links `aria-describedby` to the unavailability explanation.

---

### 5. Six Browser Acceptance Tests

1.  **Targeted Follow-Up Launch & Draft Isolation:** Type a partial draft on a root question, view a completed root attempt with `evaluation.followUp`, click "Answer follow-up", verify the follow-up prompt/rationale/focus render with an empty textarea, type a follow-up draft, click "Return to original question", and verify both drafts are preserved under their respective keys.
2.  **Follow-Up Submission & Retry Lineage:** Submit a first follow-up answer (`followUpOfAttemptId` = root attempt ID, `previousAttemptId` = `undefined`, `questionId` = root ID). Then edit and submit a retry of that follow-up; verify `previousAttemptId` equals the first follow-up attempt ID (not the parent root attempt) and `RetryComparisonPanel` compares the two follow-up attempts.
3.  **Single-Depth Enforcement & Legacy Compatibility:** Verify that a completed follow-up attempt's feedback panel never renders `FollowUpCallout`, and old root attempts without `evaluation.followUp` render feedback normally without follow-up UI.
4.  **Saved Follow-Up Reopen After Refresh & Remote Parent Fetch:** Reload the page with a completed follow-up and an incomplete (`status !== "completed"`) follow-up in history; reopen the incomplete follow-up, verify `FollowUpContextBanner` fetches the parent root attempt via `/api/practice/attempts/[id]`, and verify submitting reuses the saved `submissionId` and `followUpOfAttemptId`.
5.  **Pending-Safe Navigation Lock:** Trigger a follow-up evaluation and while `pending === true`, verify track buttons, starter question buttons, "Return to original question", and history selection buttons are disabled and no extra `/api/practice/evaluate` calls fire on navigation after completion.
6.  **Removed Catalog Root Fallback & Disabled Return:** Load a follow-up record whose `rootQuestionId` is absent from `starterQuestions` and whose parent lacks a root `questionSnapshot`; verify the follow-up renders from its own `questionSnapshot` without crashing and "Return to original question" is visibly disabled with explanatory copy.
