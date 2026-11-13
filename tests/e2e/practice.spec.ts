import { expect, test } from "@playwright/test";

test("text practice reveals hints, preserves retries, and does not preload legacy speech", async ({ page }) => {
  const legacySpeechCalls: string[] = [];
  page.on("request", (request) => { if (request.url().includes("/api/session/speak")) legacySpeechCalls.push(request.url()); });
  await page.goto("/practice");
  await expect(page.getByRole("heading", { name: "Build a better answer." })).toBeVisible();
  await page.getByRole("button", { name: "Give me a hint" }).click();
  await expect(page.getByText(/Hint 1:/)).toBeVisible();
  const first = "I built a course project and implemented the API with tests for invalid inputs.";
  await page.getByLabel("Your answer", { exact: true }).fill(first);
  await page.getByRole("button", { name: "Get feedback" }).click();
  await expect(page.getByText("Illustrative demo feedback", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Content accuracy", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Reasoning", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Structure and clarity", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Specific evidence", exact: true })).toBeVisible();
  await page.getByLabel("Your answer", { exact: true }).fill(`${first} I learned to test failures before deployment.`);
  await page.getByRole("button", { name: "Evaluate my retry" }).click();
  await expect(page.getByRole("heading", { name: "Attempt 2", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Attempt 1", exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Retry feedback" })).toContainText("Illustrative comparison only");
  await expect(page.getByRole("region", { name: "Retry feedback" })).toContainText("What changed since Attempt 1?");
  await page.reload();
  await expect(page.getByRole("heading", { name: "Attempt 2", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Attempt 1", exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Retry feedback" })).toContainText("What changed since Attempt 1?");
  // Submitted attempts survive refresh in the demo server; unsubmitted drafts do not.
  await page.getByLabel("Your answer", { exact: true }).fill(`${first} I learned to test failures before deployment.`);
  expect(legacySpeechCalls).toEqual([]);
  await page.getByRole("button", { name: "AI / ML", exact: true }).click();
  await expect(page.getByRole("heading", { name: /Your model performs very well offline/ })).toBeVisible();
  await page.getByRole("button", { name: "Behavioral", exact: true }).click();
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
