import { expect, test, type Page } from "@playwright/test";
import {
  findQuestion,
  starterQuestions,
} from "../../src/content/questions/starter-bank";
import type { AttemptRecord } from "../../src/domain/interview/attempt-record";
import type { AnswerAttempt } from "../../src/domain/interview/practice";
import { DemoPracticeEvaluator } from "../../src/infrastructure/ai/demo/practice-evaluator";

const question = findQuestion("swe-hash-map")!;
const draft =
  "A hash map offers expected constant-time lookup; a sorted array lets me traverse in order.";
const revised = `${draft} I would prefer the array for repeated range scans.`;
const edit = (page: Page) =>
  page.getByRole("button", { name: "Edit answer", exact: true });
const answer = (page: Page) =>
  page.getByRole("textbox", { name: "Your answer" });
async function submit(page: Page, text: string, label = "Get feedback") {
  await answer(page).fill(text);
  const response = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/practice/evaluate") &&
      r.request().method() === "POST",
  );
  await page.getByRole("button", { name: label, exact: true }).press("Enter");
  expect((await response).ok()).toBe(true);
}

test("typed technical feedback collapses the composer and spans the full width", async ({
  page,
}) => {
  await page.goto("/practice?track=swe");
  await expect(page.locator("h1")).toHaveCount(1);
  await submit(page, draft);
  const feedback = page.getByRole("region", { name: "Answer feedback" });
  await expect(
    feedback.getByRole("heading", { name: "Sample feedback" }),
  ).toBeFocused();
  await expect(page.locator("h1")).toHaveCount(1);
  await expect(answer(page)).toHaveCount(0);
  await expect(
    feedback.getByRole("heading", { name: "Structure outline" }),
  ).toHaveCount(0);
  const card = feedback
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "What to build on" }) });
  expect((await card.boundingBox())!.width).toBe(
    (await feedback.boundingBox())!.width,
  );
  await edit(page).click();
  await expect(answer(page)).toBeFocused();
  await expect(answer(page)).toHaveValue(draft);
  await submit(page, revised, "Evaluate my retry");
  const attempts = page.getByRole("group", { name: "Attempts" });
  const first = attempts.getByRole("button", {
    name: "Attempt 1",
    exact: true,
  });
  const second = attempts.getByRole("button", {
    name: "Attempt 2",
    exact: true,
  });
  await expect(second).toHaveAttribute("aria-pressed", "true");
  await first.click();
  await expect(first).toHaveAttribute("aria-pressed", "true");
  await expect(second).toBeVisible();
  await feedback.getByText("Your answer", { exact: true }).click();
  await expect(feedback.getByText(draft, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Behavioral", exact: true }).click();
  await expect(answer(page)).toBeVisible();
  await page
    .getByRole("button", { name: "Software engineering", exact: true })
    .click();
  await expect(edit(page)).toBeVisible();
  await expect(answer(page)).toHaveCount(0);
});

async function fixture(q = question): Promise<AttemptRecord> {
  return {
    id: "00000000-0000-4000-8000-000000000711",
    questionId: q.id,
    questionSnapshot: q,
    answer: draft,
    status: "completed",
    submittedAt: "2026-01-01T00:00:01.000Z",
    evaluation: await new DemoPracticeEvaluator().evaluate(q, draft),
    provenance: {
      mode: "demo",
      model: "fixture",
      promptVersion: "test",
      rubricVersion: "1",
    },
  };
}
test("overflow controls and the mobile selector preserve an earlier question", async ({
  page,
}) => {
  const questions = starterQuestions.filter((q) => q.track === "swe");
  const archived = {
    ...question,
    id: "archived-for-ui",
    competency: "Historical complexity",
  };
  const records = [await fixture(archived)];
  for (const [index, q] of questions.entries())
    records.push({
      ...(await fixture(q)),
      id: `00000000-0000-4000-8000-00000000072${index}`,
    });
  await page.route(/\/api\/practice\/attempts(?:\?.*)?$/, (route) =>
    route.fulfill({ json: { records, cursor: null } }),
  );
  await page.setViewportSize({ width: 640, height: 900 });
  await page.goto("/practice?track=swe");
  const left = page.getByRole("button", { name: "Scroll questions left" }),
    right = page.getByRole("button", { name: "Scroll questions right" });
  await expect(left).toBeDisabled();
  await right.click();
  await expect(left).toBeEnabled();
  await expect(right).toBeDisabled();
  await left.click();
  await expect(left).toBeDisabled();
  await page.setViewportSize({ width: 390, height: 900 });
  const select = page.getByRole("combobox", { name: "Choose a question" });
  await expect(right).toBeHidden();
  await expect(select).toHaveValue(question.id);
  const earlier = page.getByRole("button", { name: /Historical complexity/ });
  await expect(earlier).toBeHidden();
  await page.getByText("Earlier questions (1)", { exact: true }).click();
  await earlier.click();
  await expect(select).toHaveValue(archived.id);
  await expect(
    select.getByRole("option", { name: archived.competency }),
  ).toBeDisabled();
  await select.selectOption(questions[1].id);
  await expect(select).toHaveValue(questions[1].id);
  await expect(page.locator("h1")).toHaveCount(1);
});

export async function routeRealFeedback(page: Page) {
  const initial = await fixture();
  const e = initial.evaluation!;
  Object.assign(e, {
    criteria: {
      correctness: {
        status: "effective",
        observation: "Identifies expected lookup cost.",
        excerpt: "expected constant-time",
      },
      reasoning: {
        status: "partial",
        observation: "Explain the trade-off.",
        excerpt: "",
      },
      structure: {
        status: "needs-work",
        observation: "Separate the workloads.",
        excerpt: "",
      },
      evidence: {
        status: "not-assessable",
        observation: "No example given.",
        excerpt: "",
      },
    },
    uncertainty: ["This example assumes ordinary hashing."],
    suggestedAnswer:
      "For an equality query, prefer a hash map; for ordered traversal, choose a sorted array.",
  });
  initial.provenance = {
    mode: "gemini",
    model: "routed-fixture",
    promptVersion: "test",
    rubricVersion: "1",
    usage: {
      inputTokens: 15,
      outputTokens: 20,
      thinkingTokens: 5,
      totalTokens: 40,
    },
  };
  await page.route(/\/api\/practice\/attempts(?:\?.*)?$/, (route) =>
    route.fulfill({ json: { records: [initial], cursor: null } }),
  );
  await page.route("**/api/practice/evaluate", (route) => {
    const body = route.request().postDataJSON();
    const attempt: AnswerAttempt = {
      ...initial,
      id: body.submissionId,
      previousAttemptId: body.previousAttemptId,
      answer: body.answer,
      submittedAt: "2026-01-01T00:00:02.000Z",
      provenance: initial.provenance!,
      evaluation: {
        ...e,
        comparison: {
          summary: "Adds a concrete workload.",
          changes: [
            {
              kind: "improvement",
              observation: "Explains why order matters.",
              beforeExcerpt: "traverse in order",
              afterExcerpt: "repeated range scans",
            },
          ],
          nextFocus: "Discuss worst-case lookup.",
        },
      },
    };
    return route.fulfill({ json: { attempt } });
  });
}
test("routed real feedback preserves criteria, detailed comparison and suggested answer", async ({
  page,
}) => {
  await routeRealFeedback(page);
  await page.goto("/practice?track=swe");
  await edit(page).click();
  await submit(page, revised, "Evaluate my retry");
  await expect(
    page.getByRole("heading", { name: "Feedback", exact: true }),
  ).toBeFocused();
  await expect(page.getByText("Gemini · routed-fixture")).toBeVisible();
  for (const status of ["effective", "partial", "needs work", "not assessable"])
    await expect(page.getByText(status, { exact: true })).toBeVisible();
  const compare = page.getByRole("region", { name: "Retry feedback" });
  await expect(compare).toContainText("Adds a concrete workload.");
  await expect(compare).toContainText("Explains why order matters.");
  await expect(compare).toContainText("repeated range scans");
  await expect(page.getByRole("heading", { name: "Limits" })).toBeVisible();
  await page
    .getByText("Optional suggested answer · try improving yours first", {
      exact: true,
    })
    .click();
  await expect(page.getByText(/For an equality query/)).toBeVisible();
  await expect(
    page.getByText(/Provider-reported tokens: 15 input/),
  ).toBeVisible();
});
