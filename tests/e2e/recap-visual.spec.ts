import { expect, test } from "@playwright/test";

async function waitForStatus(page: import("@playwright/test").Page, label: string) {
  await expect(page.locator("header").getByText(label, { exact: true })).toBeVisible();
}

test("captures recap card visuals", async ({ page }, testInfo) => {
  await page.goto("/legacy");

  await page.getByRole("button", { name: "Start Interview Practice" }).click();
  await expect(page).toHaveURL(/\/session\/[^/]+$/);
  await waitForStatus(page, "Ready to answer");

  await page.getByRole("button", { name: "Coach this answer" }).click();
  await waitForStatus(page, "Ready to Practice");

  await page.getByRole("button", { name: "End Session" }).click();
  await expect(page).toHaveURL(/\/session\/[^/]+\/recap$/);
  await expect(page.getByRole("heading", { name: "Interview Session Recap" })).toBeVisible();

  await page.screenshot({ path: testInfo.outputPath("recap-page.png"), fullPage: true });

  const card = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "Momentum Card" }) })
    .locator("img");
  await expect(card).toBeVisible();
  await card.screenshot({ path: testInfo.outputPath("recap-card.png") });
});
