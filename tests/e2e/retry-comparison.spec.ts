import { expect, test, type Page } from "@playwright/test";
import { DemoPracticeEvaluator } from "../../src/infrastructure/ai/demo/practice-evaluator";
import { starterQuestions } from "../../src/content/questions/starter-bank";
import type { AttemptRecord } from "../../src/domain/interview/attempt-record";

const question = starterQuestions[2];
const before = "I would use a hash map because it is always constant time.";
const after = "A hash map is expected constant time, but collisions can cause linear worst-case lookup.";
async function record(id: string, answer: string, index: number, previousAttemptId?: string): Promise<AttemptRecord> {
  return {
    id, questionId: question.id, answer, previousAttemptId,
    submittedAt: `2026-01-01T00:00:0${index}.000Z`, status: "completed",
    evaluation: await new DemoPracticeEvaluator().evaluate(question, answer),
    provenance: { mode: "gemini", model: "offline-browser-fixture", thinkingLevel: "low", promptVersion: "test", rubricVersion: "1" },
  };
}
async function history(page: Page, records: AttemptRecord[]) {
  await page.route(/\/api\/practice\/attempts(?:\?.*)?$/,  (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ records, cursor: null }) }));
  await page.goto("/practice?track=swe");
}

test("branch retry shows its linked baseline, evidence changes, and other attempts", async ({ page }) => {
  const first = await record("00000000-0000-4000-8000-000000000001", before, 1);
  const second = await record("00000000-0000-4000-8000-000000000002", "This is a separate second attempt that should remain in history.", 2, first.id);
  const third = await record("00000000-0000-4000-8000-000000000003", after, 3, first.id);
  third.evaluation!.comparison = {
    summary: "The revised answer qualifies the lookup bound.",
    changes: [{ kind: "improvement", observation: "Distinguishes expected and worst-case behavior.", beforeExcerpt: "always constant time", afterExcerpt: "expected constant time" }],
    nextFocus: "Explain the sorted-array alternative.",
  };
  second.evaluation!.nextSteps = ["Name one workload that benefits from ordering.", "A second action that should stay in feedback."];
  const submitted: Record<string, unknown>[] = [];
  await page.route("**/api/practice/evaluate", async (route) => {
    submitted.push(route.request().postDataJSON());
    await route.fulfill({ status: 503, json: { error: "Synthetic evaluation paused." } });
  });
  await history(page, [third, second, first]);
  const cue = page.getByRole("region", { name: "Focus for this retry" });
  await expect(cue).toContainText("Explain the sorted-array alternative.");
  const feedback = page.getByRole("region", { name: "Retry feedback" });
  await expect(feedback).toContainText("What changed since Attempt 1?");
  await expect(feedback).toContainText("always constant time");
  await expect(feedback).toContainText("expected constant time");
  const attempts = page.getByRole("region", { name: "Attempt comparison" });
  await expect(attempts.getByRole("heading", { name: "Attempt 1", exact: true })).toBeVisible();
  await expect(attempts.getByRole("heading", { name: "Attempt 3", exact: true })).toBeVisible();
  await attempts.getByText("Earlier attempts (1)", { exact: true }).click();
  await expect(attempts).toContainText(`Attempt 2: ${second.answer}`);
  await attempts.getByRole("button", { name: "View feedback for attempt 2", exact: true }).click();
  await expect(page.getByRole("button", { name: /^Try another question in Software engineering: Debugging and testing$/ })).toBeVisible();
  await expect(cue).toContainText("Name one workload that benefits from ordering.");
  await expect(cue).not.toContainText("A second action");
  const draft = page.getByLabel("Your answer", { exact: true });
  await expect(draft).toHaveAccessibleDescription(/Name one workload that benefits from ordering/);
  expect(submitted).toHaveLength(0);
  await draft.fill(after);
  await page.getByRole("button", { name: "Evaluate my retry" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Synthetic evaluation paused." })).toBeVisible();
  expect(submitted).toHaveLength(1);
  expect(submitted[0]).toMatchObject({ previousAttemptId: second.id, answer: after });
});

test("regression feedback is shown as regression rather than assumed progress", async ({ page }) => {
  const first = await record("00000000-0000-4000-8000-000000000011", after, 1);
  const second = await record("00000000-0000-4000-8000-000000000012", before, 2, first.id);
  second.evaluation!.comparison = {
    summary: "This retry removes an important qualification.",
    changes: [{ kind: "regression", observation: "Worst-case collision behavior is no longer acknowledged.", beforeExcerpt: "expected constant time", afterExcerpt: "always constant time" }],
    nextFocus: "Restore the average versus worst-case distinction.",
  };
  await history(page, [second, first]);
  await expect(page.getByRole("region", { name: "Retry feedback" })).toContainText("regression");
  await expect(page.getByRole("region", { name: "Retry feedback" })).toContainText("Restore the average versus worst-case distinction.");
});

test("historical retries without comparison remain readable", async ({ page }) => {
  const first = await record("00000000-0000-4000-8000-000000000021", before, 1);
  const second = await record("00000000-0000-4000-8000-000000000022", after, 2, first.id);
  delete second.evaluation!.comparison;
  await history(page, [second, first]);
  await expect(page.getByText("No model comparison is available for this retry.", { exact: false })).toBeVisible();
  const shortcut = page.getByRole("button", { name: /^Try another question in / });
  await expect(shortcut).toBeVisible();
  await expect(page.getByRole("heading", { name: "Attempt 2", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "View feedback for attempt 1", exact: true }).click();
  await expect(shortcut).toHaveCount(0);
});

test("a linked baseline outside the loaded page can be loaded independently and retried", async ({ page }) => {
  const first = await record("00000000-0000-4000-8000-000000000031", before, 1);
  const current = await record("00000000-0000-4000-8000-000000000032", after, 2, first.id);
  let reads = 0;
  await page.route(`**/api/practice/attempts/${first.id}`, (route) => {
    reads++;
    return route.fulfill({ status: reads === 1 ? 503 : 200, contentType: "application/json", body: JSON.stringify(reads === 1 ? { error: "Baseline temporarily unavailable." } : { record: first }) });
  });
  await history(page, [current]);
  await expect(page.getByRole("region", { name: "Attempt comparison" }).getByRole("alert")).toContainText("Baseline temporarily unavailable.");
  await expect(page.getByRole("button", { name: /^Try another question in / })).toBeVisible();
  await page.getByRole("button", { name: "Retry loading baseline" }).click();
  await expect(page.getByRole("heading", { name: "Linked earlier answer", exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Attempt comparison" })).toContainText(first.answer);
  expect(reads).toBe(2);
});

test("failed retries and archived root retries do not offer another catalog question", async ({ page }) => {
  const first = await record("00000000-0000-4000-8000-000000000071", before, 1);
  const failed = await record("00000000-0000-4000-8000-000000000072", after, 2, first.id);
  const archive = { ...question, id: "retired-question", competency: "Retired example" };
  const archivedFirst = { ...first, id: "00000000-0000-4000-8000-000000000073", questionId: archive.id, questionSnapshot: archive };
  const archivedRetry = { ...archivedFirst, id: "00000000-0000-4000-8000-000000000074", previousAttemptId: archivedFirst.id, answer: after };
  await history(page, [archivedRetry, archivedFirst, first, { ...failed, status: "failed", evaluation: undefined, provenance: undefined }]);
  await expect(page.getByRole("region", { name: "Saved answers awaiting feedback" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Attempt comparison" })).toContainText(first.answer);
  const shortcut = page.getByRole("button", { name: /^Try another question in / });
  await expect(shortcut).toHaveCount(0);
  await page.getByRole("button", { name: "Retired example 2 saved attempts" }).click();
  await expect(page.getByRole("region", { name: "Attempt comparison" })).toContainText(archivedRetry.answer);
  await expect(shortcut).toHaveCount(0);
});

test("tied timestamps still select the child after reload", async ({ page }) => {
  const first = await record("00000000-0000-4000-8000-000000000049", before, 1);
  const current = await record("00000000-0000-4000-8000-000000000041", after, 1, first.id);
  current.evaluation!.comparison = { summary: "The child is the retry.", changes: [], nextFocus: "Explain memory trade-offs." };
  await history(page, [current, first]);
  await expect(page.getByRole("region", { name: "Retry feedback" })).toContainText("The child is the retry.");
  await page.reload();
  await expect(page.getByRole("region", { name: "Retry feedback" })).toContainText("The child is the retry.");
});

test("refreshing a completed saved answer starts a new retry without editing the draft", async ({ page }) => {
  const completed = await record("00000000-0000-4000-8000-000000000081", before, 1);
  completed.evaluation!.nextSteps = ["Explain the cost of a collision."];
  const records: AttemptRecord[] = [{ ...completed, status: "pending", evaluation: undefined, provenance: undefined }];
  await history(page, records);
  await page.getByRole("button", { name: "Reopen saved answer" }).click();
  await expect(page.getByRole("button", { name: "Get feedback", exact: true })).toBeEnabled();
  const cue = page.getByRole("region", { name: "Focus for this retry" });
  await expect(cue).toHaveCount(0);

  records[0] = completed;
  await page.getByRole("button", { name: "Refresh history" }).click();
  await expect(page.getByRole("region", { name: "Answer feedback" })).toBeVisible();
  await expect(cue).toContainText(completed.evaluation!.nextSteps[0]);
  await page.route("**/api/practice/evaluate", (route) => route.fulfill({ status: 503, json: { error: "Paused for test." } }));
  const sent = page.waitForRequest("**/api/practice/evaluate");
  await page.getByRole("button", { name: "Evaluate my retry", exact: true }).click();
  const payload = (await sent).postDataJSON();
  expect(payload).toMatchObject({ previousAttemptId: completed.id, answer: before, submissionId: expect.any(String) });
  expect(payload.submissionId).not.toBe(completed.id);
});

for (const hasAction of [true, false]) {
  test(`retry cue ${hasAction ? "uses the first nonblank gap action" : "is absent when all actions are blank"}`, async ({ page }) => {
    const first = await record("00000000-0000-4000-8000-000000000091", before, 1);
    const retry = await record("00000000-0000-4000-8000-000000000092", after, 2, first.id);
    const action = "Give an example of a collision.";
    Object.assign(retry.evaluation!, {
      comparison: { summary: "Fixture retry.", changes: [], nextFocus: " " }, nextSteps: [" ", ""],
      gaps: [
        { observation: "First gap", nextStep: " " },
        { observation: "Second gap", nextStep: hasAction ? action : "" },
        { observation: "Third gap", nextStep: hasAction ? "Describe a trade-off." : "  " },
      ],
    });
    await history(page, [retry, first]);
    await expect(page.getByRole("region", { name: "Retry feedback" })).toContainText("Fixture retry.");
    const cue = page.getByRole("region", { name: "Focus for this retry" });
    if (hasAction) await expect(cue.getByText(action, { exact: true })).toBeVisible();
    else await expect(cue).toHaveCount(0);
  });
}

test("recovering an older failed attempt selects its returned feedback", async ({ page }) => {
  const first = await record("00000000-0000-4000-8000-000000000051", before, 1);
  const failed = await record("00000000-0000-4000-8000-000000000052", after, 2, first.id);
  const newest = await record("00000000-0000-4000-8000-000000000053", "A later answer that must not replace the recovered selection.", 3, first.id);
  const records: AttemptRecord[] = [newest, { ...failed, status: "failed", evaluation: undefined, provenance: undefined }];
  let baselineReads = 0;
  await page.route(`**/api/practice/attempts/${first.id}`, (route) => {
    baselineReads++;
    return route.fulfill({ json: { record: first } });
  });
  first.evaluation!.nextSteps = ["Preserve the original retry baseline."];
  newest.evaluation!.nextSteps = ["This cue belongs to the newest attempt only."];
  failed.evaluation!.comparison = { summary: "Feedback for the recovered earlier attempt.", changes: [], nextFocus: "Add a workload example." };
  await page.route("**/api/practice/evaluate", async (route) => {
    expect(route.request().postDataJSON()).toMatchObject({ submissionId: failed.id, previousAttemptId: first.id });
    const attempt = { ...failed };
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ attempt }) });
  });
  await history(page, records);
  const cue = page.getByRole("region", { name: "Focus for this retry" });
  await expect(cue).toContainText("This cue belongs to the newest attempt only.");
  await expect(page.getByRole("heading", { name: "Linked earlier answer", exact: true })).toBeVisible();
  expect(baselineReads).toBe(1);
  await page.getByRole("button", { name: "Reopen saved answer" }).click();
  await expect(cue).toContainText("Preserve the original retry baseline.");
  const draft = page.getByLabel("Your answer", { exact: true });
  await draft.fill(`${failed.answer} An edit makes it a new attempt.`);
  await expect(cue).toContainText("This cue belongs to the newest attempt only.");
  await draft.fill(failed.answer);
  await expect(cue).toContainText("Preserve the original retry baseline.");
  await page.getByRole("button", { name: "Evaluate my retry" }).click();
  await expect(page.getByRole("region", { name: "Retry feedback" })).toContainText("Feedback for the recovered earlier attempt.");
  const attempts = page.getByRole("region", { name: "Attempt comparison" });
  await expect(attempts).toContainText(failed.answer);
  await expect(cue).toContainText("Add a workload example.");
  await attempts.getByText("Earlier attempts (1)", { exact: true }).click();
  await attempts.getByRole("button", { name: /View feedback for attempt / }).click();
  await expect(cue).toContainText("This cue belongs to the newest attempt only.");
  expect(baselineReads).toBe(1);
});

for (const hasOriginalBaseline of [true, false]) {
  test(`recovered answer ${hasOriginalBaseline ? "uses a different off-page baseline" : "without a baseline has no cue"}`, async ({ page }) => {
    const originalBaseline = await record("00000000-0000-4000-8000-000000000061", before, 1);
    originalBaseline.evaluation!.nextSteps = ["Use the original workload as evidence."];
    const otherBaseline = await record("00000000-0000-4000-8000-000000000062", after, 2);
    const failed = await record("00000000-0000-4000-8000-000000000063", after, 3, hasOriginalBaseline ? originalBaseline.id : undefined);
    const latest = await record("00000000-0000-4000-8000-000000000064", "A later attempt with different evidence and advice.", 4, otherBaseline.id);
    latest.evaluation!.nextSteps = ["This cue only applies to a new submission."];
    let reads = 0;
    await page.route(`**/api/practice/attempts/${originalBaseline.id}`, (route) => {
      reads++;
      return route.fulfill({ json: { record: originalBaseline } });
    });
    await page.route(`**/api/practice/attempts/${otherBaseline.id}`, (route) => route.fulfill({ json: { record: otherBaseline } }));
    let submissions = 0;
    await page.route("**/api/practice/evaluate", (route) => {
      const payload = route.request().postDataJSON();
      submissions++;
      expect(payload.submissionId).toBe(failed.id);
      expect(payload.previousAttemptId).toBe(failed.previousAttemptId);
      return route.fulfill({ json: { attempt: failed } });
    });
    await history(page, [latest, { ...failed, status: "failed", evaluation: undefined, provenance: undefined }]);
    const cue = page.getByRole("region", { name: "Focus for this retry" });
    await expect(cue).toContainText("This cue only applies to a new submission.");
    await page.getByRole("button", { name: "Reopen saved answer" }).click();
    // Displayed feedback is still the completed retry, even when the recovered composer is not a retry.
    await expect(page.getByRole("button", { name: /^Try another question in Software engineering: Debugging and testing$/ })).toBeVisible();
    if (hasOriginalBaseline) await expect(cue).toContainText("Use the original workload as evidence.");
    else await expect(cue).toHaveCount(0);
    expect(reads).toBe(hasOriginalBaseline ? 1 : 0);
    expect(submissions).toBe(0);
    await page.getByRole("button", { name: hasOriginalBaseline ? "Evaluate my retry" : "Get feedback", exact: true }).click();
    await expect.poll(() => submissions).toBe(1);
  });
}
