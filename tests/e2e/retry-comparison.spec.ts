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
  await history(page, [third, second, first]);
  const feedback = page.getByRole("region", { name: "Retry feedback" });
  await expect(feedback).toContainText("What changed since Attempt 1?");
  await expect(feedback).toContainText("always constant time");
  await expect(feedback).toContainText("expected constant time");
  const attempts = page.getByRole("region", { name: "Attempt comparison" });
  await expect(attempts.getByRole("heading", { name: "Attempt 1", exact: true })).toBeVisible();
  await expect(attempts.getByRole("heading", { name: "Attempt 3", exact: true })).toBeVisible();
  await attempts.getByText("Earlier attempts (1)", { exact: true }).click();
  await expect(attempts).toContainText(`Attempt 2: ${second.answer}`);
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
  await expect(page.getByRole("heading", { name: "Attempt 2", exact: true })).toBeVisible();
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
  await page.getByRole("button", { name: "Retry loading baseline" }).click();
  await expect(page.getByRole("heading", { name: "Linked earlier answer", exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Attempt comparison" })).toContainText(first.answer);
  expect(reads).toBe(2);
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

test("recovering an older failed attempt selects its returned feedback", async ({ page }) => {
  const first = await record("00000000-0000-4000-8000-000000000051", before, 1);
  const failed = await record("00000000-0000-4000-8000-000000000052", after, 2, first.id);
  const newest = await record("00000000-0000-4000-8000-000000000053", "A later answer that must not replace the recovered selection.", 3, first.id);
  const records: AttemptRecord[] = [newest, { ...failed, status: "failed", evaluation: undefined, provenance: undefined }, first];
  failed.evaluation!.comparison = { summary: "Feedback for the recovered earlier attempt.", changes: [], nextFocus: "Add a workload example." };
  await page.route("**/api/practice/evaluate", async (route) => {
    expect(route.request().postDataJSON().submissionId).toBe(failed.id);
    const attempt = { ...failed };
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ attempt }) });
  });
  await history(page, records);
  await page.getByRole("button", { name: "Reopen saved answer" }).click();
  await page.getByRole("button", { name: "Evaluate my retry" }).click();
  await expect(page.getByRole("region", { name: "Retry feedback" })).toContainText("Feedback for the recovered earlier attempt.");
  await expect(page.getByRole("region", { name: "Attempt comparison" }).getByRole("heading", { name: "Attempt 2", exact: true })).toBeVisible();
  await page.getByText("Earlier attempts (1)", { exact: true }).click();
  await page.getByRole("button", { name: "View feedback for attempt 3" }).click();
  await expect(page.getByRole("region", { name: "Attempt comparison" }).getByRole("heading", { name: "Attempt 3", exact: true })).toBeVisible();
});
