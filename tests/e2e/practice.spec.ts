import { expect, test } from "@playwright/test";
import { findQuestion } from "../../src/content/questions/starter-bank";

for (const [id, answer] of [
  ["behavioral-clarify", "I showed two sketches to our student club and asked which task they wanted to finish first."],
  ["swe-pagination", "I would sort by timestamp and ID and test a page boundary where three rows share a timestamp."],
  ["ml-label-audit", "I would ask two reviewers to label both agreement and disagreement cases without seeing the old labels."],
]) {
  test(`new practice drill ${id} exposes staged hints and evaluates the selected question`, async ({ page }) => {
    const q = findQuestion(id)!;
    await page.goto(`/practice?track=${q.track}`);
    await page.getByRole("button", { name: q.competency, exact: true }).click();
    await expect(page.getByRole("heading", { name: q.prompt, exact: true })).toBeVisible();
    const firstHint = page.getByText(`Hint 1: ${q.hints[0]}`, { exact: true });
    const secondHint = page.getByText(`Hint 2: ${q.hints[1]}`, { exact: true });
    await expect(firstHint).toBeHidden();
    await page.getByRole("button", { name: "Give me a hint" }).click();
    await expect(firstHint).toBeVisible();
    await expect(secondHint).toBeHidden();
    await page.getByRole("button", { name: "Reveal another hint" }).click();
    await expect(secondHint).toBeVisible();
    await page.getByLabel("Your answer", { exact: true }).fill(answer);
    const feedback = page.waitForResponse((r) => r.url().endsWith("/api/practice/evaluate") && r.request().method() === "POST");
    await page.getByRole("button", { name: "Get feedback", exact: true }).click();
    const response = await feedback;
    expect(response.ok()).toBe(true);
    expect((await response.json()).attempt).toMatchObject({ questionId: id, answer, provenance: { mode: "demo" } });
    await page.getByRole("button", { name:"Edit answer" }).click();
    await expect(page.getByRole("button", { name: "Evaluate my retry", exact: true })).toBeEnabled();
  });
}

test("text practice reveals hints, preserves retries, and does not preload legacy speech", async ({ page }) => {
  const legacySpeechCalls: string[] = [];
  page.on("request", (request) => { if (request.url().includes("/api/session/speak")) legacySpeechCalls.push(request.url()); });
  await page.goto("/practice");
  await expect(page.getByRole("heading", { name: findQuestion("behavioral-project")!.prompt })).toBeVisible();
  await page.getByRole("button", { name: "Give me a hint" }).click();
  await expect(page.getByText(/Hint 1:/)).toBeVisible();
  const first = "I built a course project and implemented the API with tests for invalid inputs.";
  await page.getByLabel("Your answer", { exact: true }).fill(first);
  await page.getByRole("button", { name: "Get feedback" }).press("Enter");
  await expect(page.getByRole("heading", { name:"Sample feedback" })).toBeFocused();
  await expect(page.getByLabel("Your answer", {exact:true})).toHaveCount(0);
  await expect(page.getByRole("heading", {name:"Structure outline"})).toBeVisible();
  await page.getByRole("button", {name:"Retry original answer"}).click();
  await expect(page.getByLabel("Your answer", {exact:true})).toBeFocused();
  await expect(page.getByRole("heading", { name: "Criteria", exact: true })).toHaveCount(0);
  await page.getByLabel("Your answer", { exact: true }).fill(`${first} I learned to test failures before deployment.`);
  await page.getByRole("button", { name: "Evaluate my retry" }).click();
  await expect(page.getByRole("heading", { name: "Attempt 2", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Attempt 1", exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Retry feedback" })).not.toContainText("Illustrative comparison only");
  await expect(page.getByRole("region", { name: "Retry feedback" })).toContainText("Focus for the next retry:");
  await page.reload();
  await expect(page.getByRole("heading", { name: "Attempt 2", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Attempt 1", exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Retry feedback" })).toContainText("Focus for the next retry:");
  await page.getByRole("button", { name:"Edit answer" }).click();
  // Submitted attempts survive refresh in the demo server; unsubmitted drafts do not.
  await page.getByLabel("Your answer", { exact: true }).fill(`${first} I learned to test failures before deployment.`);
  expect(legacySpeechCalls).toEqual([]);
  await page.getByRole("button", { name: "AI / ML", exact: true }).click();
  await expect(page.getByRole("heading", { name: /Your model performs very well offline/ })).toBeVisible();
  await page.getByRole("button", { name: "Behavioral", exact: true }).click();
  await page.getByRole("button", { name:"Edit answer" }).click();
  await expect(page.getByLabel("Your answer", { exact: true })).toHaveValue(`${first} I learned to test failures before deployment.`);
});

test("failed evaluation preserves the draft and allows retry", async ({ page }) => {
  await page.route("**/api/practice/evaluate", (route) => route.fulfill({ status: 502, contentType: "application/json", body: JSON.stringify({ error: "Evaluation unavailable. Please retry." }) }));
  await page.goto("/practice");
  const answer = "I implemented the API for a class project and wrote integration tests.";
  await page.getByLabel("Your answer", { exact: true }).fill(answer);
  await page.getByRole("button", { name: "Get feedback" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toHaveText("Evaluation unavailable. Please retry.");
  await expect(page.getByLabel("Your answer", { exact: true })).toHaveValue(answer);
  await expect(page.getByRole("button", { name: "Get feedback" })).toBeEnabled();
});
