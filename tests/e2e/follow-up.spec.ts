import { expect, test, type Page } from "@playwright/test";
import { starterQuestions } from "../../src/content/questions/starter-bank";
import { DemoPracticeEvaluator } from "../../src/infrastructure/ai/demo/practice-evaluator";
import { makeFollowUpQuestion } from "../../src/domain/interview/follow-up";
import type { AnswerAttempt, InterviewQuestion } from "../../src/domain/interview/practice";
import type { AttemptRecord } from "../../src/domain/interview/attempt-record";

const root = starterQuestions[0];
const original = "I built a class project, wrote the API, and tested its error handling.";
const focused = "I chose integration tests to check how the API and database behave together.";
const demo = new DemoPracticeEvaluator();
const parentId = "00000000-0000-4000-8000-000000000101";
async function fixtures(question: InterviewQuestion = root) {
  const parent: AttemptRecord = {
    id: parentId, questionId: question.id, rootQuestionId: question.id, questionSnapshot: question,
    answer: original, submittedAt: "2026-01-01T00:00:00.000Z", status: "completed",
    evaluation: await demo.evaluate(question, original), provenance: { mode: "demo", model: "fixture", promptVersion: "test", rubricVersion: "1" },
  };
  const snapshot = makeFollowUpQuestion(question, parent.id, parent.evaluation!.followUp!);
  const child: AttemptRecord = {
    id: "00000000-0000-4000-8000-000000000102", questionId: snapshot.id, rootQuestionId: question.id,
    questionSnapshot: snapshot, followUpOfAttemptId: parent.id, answer: focused,
    submittedAt: "2026-01-01T00:00:01.000Z", status: "completed",
    evaluation: await demo.evaluate(snapshot, focused), provenance: parent.provenance,
  };
  return { parent, child };
}
async function history(page: Page, records: AttemptRecord[]) {
  await page.route(/\/api\/practice\/attempts(?:\?.*)?$/, (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ records, cursor: null }) }));
  await page.goto("/practice");
}
async function evaluate(page: Page, label: string) {
  const response = page.waitForResponse((response) => response.url().endsWith("/api/practice/evaluate") && response.request().method() === "POST");
  await page.getByRole("button", { name: label, exact: true }).click();
  return (await (await response).json()).attempt as AnswerAttempt;
}
async function startRoot(page: Page) {
  await page.goto("/practice");
  await page.getByLabel("Your answer", { exact: true }).fill(original);
  return evaluate(page, "Get feedback");
}

test("root and follow-up drafts are isolated; first child and retry keep distinct lineage", async ({ page }, testInfo) => {
  const requests: Record<string, unknown>[] = [];
  page.on("request", (request) => { if (request.url().endsWith("/api/practice/evaluate") && request.method() === "POST") requests.push(request.postDataJSON()); });
  const parent = await startRoot(page);
  await page.getByLabel("Your answer", { exact: true }).fill(`${original} This is an unsent root revision.`);
  await page.getByRole("button", { name: "Answer follow-up", exact: true }).click();
  await expect(page.getByRole("region", { name: "Follow-up context" })).toBeVisible();
  await expect(page.getByLabel("Your answer", { exact: true })).toHaveValue("");
  await expect(page.getByRole("button", { name: "Give me a hint", exact: true })).toHaveCount(0);
  await page.getByLabel("Your answer", { exact: true }).fill(focused);
  await page.getByRole("button", { name: "Return to original question", exact: true }).click();
  await expect(page.getByLabel("Your answer", { exact: true })).toHaveValue(`${original} This is an unsent root revision.`);
  await page.getByRole("button", { name: "Answer follow-up", exact: true }).click();
  await expect(page.getByLabel("Your answer", { exact: true })).toHaveValue(focused);
  const firstChild = await evaluate(page, "Get feedback");
  expect(requests[1]).toMatchObject({ questionId: root.id, followUpOfAttemptId: parent.id, answer: focused });
  expect(requests[1].previousAttemptId).toBeUndefined();
  expect(firstChild.questionId).toBe(`followup:${parent.id}`);
  expect(firstChild.evaluation.followUp).toBeNull();
  await expect(page.getByRole("button", { name: "Answer follow-up", exact: true })).toHaveCount(0);
  await page.getByLabel("Your answer", { exact: true }).fill(`${focused} I would also test a failed database write.`);
  await evaluate(page, "Evaluate my retry");
  expect(requests[2]).toMatchObject({ questionId: root.id, followUpOfAttemptId: parent.id, previousAttemptId: firstChild.id });
  await expect(page.getByRole("region", { name: "Retry feedback" })).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: /^Open saved follow-up 1:/ }).click();
  await expect(page.getByRole("region", { name: "Follow-up context" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Retry feedback" })).toBeVisible();
  expect(requests).toHaveLength(3); // Navigation/reload did not generate.
  await page.screenshot({ path: testInfo.outputPath("follow-up-desktop.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const focusedHeading = page.getByRole("heading", { name: "Which decision in this project was yours, and why did you make it?", exact: true });
  await focusedHeading.scrollIntoViewIfNeeded();
  await expect(focusedHeading).toBeInViewport();
  await page.screenshot({ path: testInfo.outputPath("follow-up-mobile.png") });
  expect(requests).toHaveLength(3);
});

test("pending follow-up evaluation locks navigation without extra generation", async ({ page }) => {
  await startRoot(page);
  await page.getByRole("button", { name: "Answer follow-up", exact: true }).click();
  await page.getByLabel("Your answer", { exact: true }).fill(focused);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/practice/evaluate", async (route) => { await gate; await route.continue(); });
  const response = page.waitForResponse((response) => response.url().endsWith("/api/practice/evaluate"));
  await page.getByRole("button", { name: "Get feedback", exact: true }).click();
  try {
    await expect(page.getByRole("button", { name: "Reviewing your answer…", exact: true })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Return to original question", exact: true })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Software engineering", exact: true })).toBeDisabled();
    await expect(page.getByRole("button", { name: /^Ownership and impact/ })).toBeDisabled();
    await expect(page.getByRole("link", { name: "Home", exact: true })).toHaveAttribute("aria-disabled", "true");
    await expect(page.getByRole("link", { name: "Original voice demo", exact: true })).toHaveAttribute("aria-disabled", "true");
    await page.getByRole("link", { name: "Home", exact: true }).focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/practice$/);
  } finally { release(); }
  await response;
  await expect(page.getByRole("button", { name: "Evaluate my retry", exact: true })).toBeEnabled();
});

test("a failed source keeps its submission identity while another follow-up succeeds", async ({ page }) => {
  const parentA = await startRoot(page);
  let failedId: string | undefined;
  let failOnce = true;
  await page.route("**/api/practice/evaluate", (route) => {
    const body = route.request().postDataJSON();
    if (body.followUpOfAttemptId === parentA.id && failOnce) {
      failOnce = false; failedId = body.submissionId;
      return route.fulfill({ status: 502, contentType: "application/json", body: JSON.stringify({ error: "Synthetic source A failure." }) });
    }
    return route.continue();
  });
  await page.getByRole("button", { name: "Answer follow-up", exact: true }).click();
  await page.getByLabel("Your answer", { exact: true }).fill(focused);
  await page.getByRole("button", { name: "Get feedback", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Synthetic source A failure.");
  await page.getByRole("button", { name: "Return to original question", exact: true }).click();
  await page.getByLabel("Your answer", { exact: true }).fill(`${original} A revised root answer creates another follow-up source.`);
  const parentB = await evaluate(page, "Evaluate my retry");
  expect(parentB.id).not.toBe(parentA.id);
  await page.getByRole("button", { name: "Answer follow-up", exact: true }).click();
  await page.getByLabel("Your answer", { exact: true }).fill(`${focused} This answer is for source B.`);
  await evaluate(page, "Get feedback");
  await page.getByRole("button", { name: "Return to original question", exact: true }).click();
  await page.getByRole("button", { name: "View feedback for attempt 1", exact: true }).click();
  await page.getByRole("button", { name: "Answer follow-up", exact: true }).click();
  await expect(page.getByLabel("Your answer", { exact: true })).toHaveValue(focused);
  const recovered = await evaluate(page, "Get feedback");
  expect(recovered.id).toBe(failedId);
});

test("legacy root feedback without a proposal remains readable", async ({ page }) => {
  const { parent } = await fixtures();
  delete parent.evaluation!.followUp;
  await history(page, [parent]);
  await expect(page.getByRole("heading", { name: "Your next step, not a final score.", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Answer follow-up", exact: true })).toHaveCount(0);
});

test("removed root and snapshot-less parent do not prevent reopening a saved focused answer", async ({ page }) => {
  const removed = { ...root, id: "archived-root", prompt: "An archived original question." };
  const { parent, child } = await fixtures(removed);
  delete parent.questionSnapshot;
  child.evaluation!.followUp = (await demo.evaluate(root, original)).followUp; // Historical malformed nested proposal must stay hidden.
  await page.route(`**/api/practice/attempts/${parent.id}`, (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ record: parent }) }));
  await history(page, [child]);
  await page.getByRole("button", { name: /^Open saved follow-up 1:/ }).click();
  await expect(page.getByRole("region", { name: "Follow-up context" })).toContainText("Original question is unavailable");
  await expect(page.getByRole("button", { name: "Return to original question", exact: true })).toBeDisabled();
  await expect(page.getByRole("heading", { name: child.questionSnapshot!.prompt, exact: true })).toBeVisible();
  await expect(page.getByLabel("Your answer", { exact: true })).toHaveValue(focused);
  await expect(page.getByRole("button", { name: "Answer follow-up", exact: true })).toHaveCount(0);
});

test("remote parent snapshot outranks changed live catalog on return", async ({ page }) => {
  const historical = { ...root, prompt: "Historical project question before the catalog changed." };
  const { parent, child } = await fixtures(historical);
  await page.route(`**/api/practice/attempts/${parent.id}`, (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ record: parent }) }));
  await history(page, [child]);
  await page.getByRole("button", { name: /^Open saved follow-up 1:/ }).click();
  await expect(page.getByRole("region", { name: "Follow-up context" })).toContainText(historical.prompt);
  await page.getByRole("button", { name: "Return to original question", exact: true }).click();
  await expect(page.getByRole("heading", { name: historical.prompt, exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Your next step, not a final score.", exact: true })).toBeVisible();
});

test("failed follow-up recovery reuses its ID, root/source, and baseline", async ({ page }) => {
  const { parent, child } = await fixtures();
  const failed = { ...child, status: "failed" as const, evaluation: undefined, provenance: undefined };
  await page.route(`**/api/practice/attempts/${parent.id}`, (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ record: parent }) }));
  let payload: Record<string, unknown> | undefined;
  await page.route("**/api/practice/evaluate", (route) => {
    payload = route.request().postDataJSON();
    return route.fulfill({ contentType: "application/json", body: JSON.stringify({ attempt: child }) });
  });
  await history(page, [failed]);
  await page.getByRole("button", { name: "Reopen saved answer", exact: true }).click();
  await expect(page.getByLabel("Your answer", { exact: true })).toHaveValue(focused);
  await evaluate(page, "Get feedback");
  expect(payload).toMatchObject({ submissionId: child.id, questionId: root.id, followUpOfAttemptId: parent.id, answer: focused });
  expect(payload!.previousAttemptId).toBeUndefined();
  await expect(page.getByRole("region", { name: "Follow-up context" })).toBeVisible();
});
