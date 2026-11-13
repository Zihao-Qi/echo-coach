import { expect, test } from "@playwright/test";

test("redesigned home opens the selected track without legacy audio preloading", async ({ page }, testInfo) => {
  const legacyCalls: string[] = [];
  page.on("request", (request) => { if (request.url().includes("/api/session/")) legacyCalls.push(request.url()); });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Good answers are built/ })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("home-desktop.png"), fullPage: true });
  await page.getByRole("link", { name: /03 AI \/ ML/ }).click();
  await expect(page).toHaveURL(/\/practice\?track=ai-ml$/);
  await expect(page.getByRole("heading", { name: /Your model performs very well offline/ })).toBeVisible();
  expect(legacyCalls).toEqual([]);
});

test("home and practice fit a mobile viewport", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Good answers are built/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("home-mobile.png"), fullPage: true });
  await page.getByRole("link", { name: "Start a focused practice round →", exact: true }).click();
  await expect(page.getByLabel("Your answer", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("practice-mobile.png"), fullPage: true });
});
