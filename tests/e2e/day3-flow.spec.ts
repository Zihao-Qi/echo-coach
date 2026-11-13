import { expect, test, type Page } from "@playwright/test";

async function waitForStatus(page: Page, label: string) {
  await expect(page.locator("header").getByText(label, { exact: true })).toBeVisible();
}

test.describe("Echo Coach local mock flow", () => {
  test("completes the interview rewrite loop and keeps recap aligned with the coached answer", async ({
    page,
  }) => {
    await page.goto("/legacy");

    await page.getByRole("button", { name: "Start Interview Practice" }).click();

    await expect(page).toHaveURL(/\/session\/[^/]+$/);
    await expect(page.getByRole("heading", { name: "Interview Practice" })).toBeVisible();

    await waitForStatus(page, "Ready to answer");

    await page.getByRole("button", { name: "Coach this answer" }).click();
    await waitForStatus(page, "Ready to Practice");
    await expect(page.getByRole("heading", { name: "Polished answer ready" })).toBeVisible();

    const originalAnswer = (await page.getByTestId("original-transcript").textContent())?.trim();
    const polishedAnswer = (await page.getByTestId("polished-answer").textContent())?.trim();

    expect(originalAnswer).toContain("I think I am a good fit");
    expect(polishedAnswer).toContain("I am a strong fit");

    await expect(page.getByRole("button", { name: "Next question" })).toBeEnabled();
    await page.getByRole("button", { name: "Play polished version" }).click();
    await page.getByRole("button", { name: "Next question" }).click();
    await expect(
      page.getByRole("heading", {
        name: "Can you walk me through a recent project where you made a measurable impact?",
      })
    ).toBeVisible();
    await expect(page.getByText("Question 2 of 3")).toBeVisible();
    await waitForStatus(page, "Ready to answer");

    await page.getByRole("button", { name: "Coach this answer" }).click();
    await waitForStatus(page, "Ready to Practice");

    const secondOriginalAnswer = (
      await page.getByTestId("original-transcript").textContent()
    )?.trim();
    const secondPolishedAnswer = (
      await page.getByTestId("polished-answer").textContent()
    )?.trim();

    expect(secondOriginalAnswer).toContain("I helped with onboarding");
    expect(secondPolishedAnswer).toContain("customer onboarding project");

    await page.getByRole("button", { name: "Play polished version" }).click();

    await page.getByRole("button", { name: "End Session" }).click();
    await expect(page).toHaveURL(/\/session\/[^/]+\/recap$/);
    await expect(
      page.getByRole("heading", { name: "Interview Session Recap" })
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "All coached answers from this session" })).toBeVisible();
    await expect(page.getByText("Question 1")).toBeVisible();
    await expect(page.getByText("Question 2")).toBeVisible();

    const recapPolishedAnswer = (
      await page.getByTestId("recap-polished-answer").textContent()
    )?.trim();
    const recapFocus = (await page.getByTestId("recap-primary-focus").textContent())?.trim();

    expect(recapPolishedAnswer).toContain("customer onboarding project");
    expect(recapFocus).toContain("More concrete example");

    await page.getByRole("link", { name: "Start New Session" }).click();
    await expect(page).toHaveURL("/legacy");
    await expect(page.getByRole("heading", { name: "Saved interview recaps" })).toBeVisible();
    await expect(page.getByText("More concrete example")).toBeVisible();
    await page.getByRole("link", { name: /Open recap/ }).first().click();
    await expect(page).toHaveURL(/\/session\/[^/]+\/recap$/);
  });

  test("redirects invalid or stale session routes back to the home page", async ({ page }) => {
    await page.goto("/session/test-session");
    await expect(page).toHaveURL("/");

    await page.goto("/session/test-session/recap");
    await expect(page).toHaveURL("/");
  });

  test("keeps the recap route working after refresh because recap is persisted", async ({
    page,
  }) => {
    await page.goto("/legacy");
    await page.getByRole("button", { name: "Start Interview Practice" }).click();

    await expect(page).toHaveURL(/\/session\/[^/]+$/);
    await waitForStatus(page, "Ready to answer");

    await expect(page.getByRole("button", { name: "Next question" })).toBeEnabled();
    await page.getByRole("button", { name: "Next question" }).click();
    await expect(page.getByText("Question 2 of 3")).toBeVisible();
    await waitForStatus(page, "Ready to answer");

    await page.getByRole("button", { name: "Coach this answer" }).click();
    await waitForStatus(page, "Ready to Practice");

    await page.getByRole("button", { name: "End Session" }).click();
    await expect(page).toHaveURL(/\/session\/[^/]+\/recap$/);

    await page.reload();
    await expect(page).toHaveURL(/\/session\/[^/]+\/recap$/);
    await expect(
      page.getByRole("heading", { name: "Interview Session Recap" })
    ).toBeVisible();
    await expect(page.getByTestId("recap-polished-answer")).toContainText(
      "customer onboarding project"
    );
  });
});
