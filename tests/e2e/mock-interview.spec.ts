import { expect, test, type Page } from "@playwright/test";
import { MOCK_PROMPTS } from "../../src/features/mock-interview/round";

function guardPracticeRequests(page: Page) {
  const requests: string[] = [];
  return page.route("**/api/**", (route) => {
    requests.push(route.request().url());
    return route.abort();
  }).then(() => requests);
}

const first = "I owned the API contract.\nI tested the failure path.";
const third = "I would reproduce the production split and check for leakage.";

test("round runs three unaided turns and allows revisiting any reached turn after debrief", async ({ page }, testInfo) => {
  const requests = await guardPracticeRequests(page);
  await page.goto("/");
  await page.getByRole("link", { name: /try a three-question mock interview/i }).click();
  await expect(page).toHaveURL(/\/mock-interview$/);
  await page.getByRole("button", { name: "Start mock interview", exact: true }).click();
  const answer = page.getByLabel("Your answer", { exact: true });
  for (const [index, question] of MOCK_PROMPTS.entries()) {
    const heading = page.getByRole("heading", { name: question.prompt, exact: true });
    await expect(heading).toBeFocused();
    const step = page.getByRole("list", { name: "Round progress" }).getByRole("listitem").nth(index);
    await expect(step).toHaveAttribute("aria-current", "step");
    if (index === 0) await expect(page.getByText("Up next", { exact: true })).toHaveCount(2);
    await expect(page.getByText(`Question ${index + 1} of 3`, { exact: true })).toBeVisible();
    await expect(page.getByText(question.hints[0], { exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Open debrief" })).toHaveCount(0);
    if (index === 1) {
      await expect(answer).toHaveValue("");
      await page.getByRole("button", { name: "Skip question", exact: true }).click();
    } else {
      const advance = page.getByRole("button", { name: index === 0 ? "Save and continue" : "Finish round", exact: true });
      await expect(advance).toBeDisabled();
      await answer.fill(index === 0 ? first : third);
      await expect(answer).toBeFocused();
      if (index === 2) await expect(page.getByRole("button", { name: "End round early", exact: true })).toHaveCount(0);
      await advance.click();
    }
  }
  await expect(page.getByText(first, { exact: true })).toBeVisible();
  await expect(page.getByText(third, { exact: true })).toBeVisible();
  const progress = page.getByRole("list", { name: "Round progress" });
  await expect(progress.getByText("Answered", { exact: true })).toHaveCount(2);
  await expect(progress.getByText("Skipped", { exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name:"Round answers" }).getByText("Skipped", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Revisit question 1" })).toHaveCount(0);
  await page.getByRole("button", { name: "Open debrief", exact: true }).click();
  const debrief = page.getByRole("region", { name: "Self-review debrief" });
  await expect(debrief.getByRole("heading").first()).toBeFocused();
  await expect(debrief.getByText("Which answer felt hardest?", { exact: true })).toBeVisible();
  const revision = debrief.getByRole("textbox", { name: /revision/i });
  await expect(revision).toHaveCount(0);
  for (const question of MOCK_PROMPTS) await expect(debrief.getByText(question.hints[0], { exact: true })).toHaveCount(0);
  await debrief.getByRole("button", { name: "Revisit question 2", exact: true }).click();
  await expect(debrief.getByText(MOCK_PROMPTS[1].hints[0], { exact: true })).toBeVisible();
  await debrief.getByRole("button", { name: "Revisit question 3", exact: true }).click();
  await expect(debrief.getByText(MOCK_PROMPTS[2].hints[0], { exact: true })).toBeVisible();
  const reveal = debrief.getByRole("button", { name: "Reveal another hint", exact: true });
  const secondHint = debrief.getByText(MOCK_PROMPTS[2].hints[1], { exact: true });
  await expect(reveal).toHaveAttribute("aria-expanded", "false");
  await expect(reveal).toHaveAttribute("aria-controls", "extra-hint-2");
  await expect(secondHint).toBeHidden();
  await reveal.focus();
  await page.keyboard.press("Enter");
  const hide = debrief.getByRole("button", { name: "Hide extra hint", exact: true });
  await expect(hide).toBeFocused();
  await expect(hide).toHaveAttribute("aria-expanded", "true");
  await expect(secondHint).toBeVisible();
  await revision.fill("I would also examine preprocessing at the train-serving boundary.");
  await expect(page.getByRole("region", { name: "Round answers" }).getByText(third, { exact: true })).toBeVisible();
  await debrief.getByRole("button", { name: "Revisit question 1", exact: true }).click();
  await expect(revision).not.toHaveValue("I would also examine preprocessing at the train-serving boundary.");
  await expect(debrief.getByText(MOCK_PROMPTS[0].hints[1], { exact: true })).toBeHidden();
  await expect(reveal).toHaveAttribute("aria-expanded", "false");
  await debrief.getByRole("button", { name: "Revisit question 3", exact: true }).click();
  await expect(revision).toHaveValue("I would also examine preprocessing at the train-serving boundary.");
  await expect(secondHint).toBeVisible();
  await hide.click();
  await expect(secondHint).toBeHidden();
  await expect(revision).toHaveValue("I would also examine preprocessing at the train-serving boundary.");
  await page.screenshot({ path: testInfo.outputPath("mock-round-desktop.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("mock-round-mobile.png"), fullPage: true });
  expect(requests).toEqual([]);
});

test("a completed round waits for the candidate to choose the hardest answer", async ({ page }) => {
  const requests = await guardPracticeRequests(page);
  await page.goto("/mock-interview");
  await page.getByRole("button", { name: "Start mock interview", exact: true }).click();
  for (const index of [0, 1, 2]) {
    await page.getByLabel("Your answer", { exact: true }).fill(`Synthetic answer for question ${index + 1}.`);
    await page.getByRole("button", { name: index === 2 ? "Finish round" : "Save and continue", exact: true }).click();
  }
  await page.getByRole("button", { name: "Open debrief", exact: true }).click();
  const debrief = page.getByRole("region", { name: "Self-review debrief" });
  await expect(debrief.getByText("Which answer felt hardest?", { exact: true })).toBeVisible();
  await expect(debrief.getByRole("button", { pressed: true })).toHaveCount(0);
  await expect(debrief.getByRole("textbox")).toHaveCount(0);
  const choice = debrief.getByRole("button", { name: "Revisit question 3", exact: true });
  await choice.click();
  await expect(choice).toHaveAttribute("aria-pressed", "true");
  await expect(debrief.getByRole("textbox", { name: /revision for question 3/i })).toBeVisible();
  expect(requests).toEqual([]);
});

test("a fresh round keeps navigation in tab order and an empty exit offers restart", async ({ page }) => {
  const requests = await guardPracticeRequests(page);
  await page.goto("/mock-interview");
  const intro = page.getByRole("heading", { name: "Three-question mock interview", exact: true });
  await expect(intro).not.toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "echocoach", exact: true })).toBeFocused();
  await page.getByRole("button", { name: "Start mock interview", exact: true }).click();
  await page.getByRole("button", { name: "End round early", exact: true }).click();
  await expect(page.getByRole("button", { name: "Open debrief" })).toHaveCount(0);
  await expect(page.getByRole("list", { name: "Round progress" }).getByText("Not included", { exact: true })).toHaveCount(3);
  await page.getByRole("button", { name: "Start new round", exact: true }).click();
  await expect(intro).toBeFocused();
  expect(requests).toEqual([]);
});

test("ending early keeps the current answer; declining to discard keeps the round", async ({ page }) => {
  const requests = await guardPracticeRequests(page);
  await page.goto("/mock-interview");
  await page.getByRole("button", { name: "Start mock interview", exact: true }).click();
  const answer = page.getByLabel("Your answer", { exact: true });
  await answer.fill(first);
  await page.getByRole("button", { name: "Save and continue", exact: true }).click();
  await answer.fill("I would compare ordering and lookup cost.");
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("link", { name: "Practice", exact: true }).click();
  await expect(page).toHaveURL(/\/mock-interview$/);
  await expect(answer).toHaveValue("I would compare ordering and lookup cost.");
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "Skip question", exact: true }).click();
  await expect(answer).toHaveValue("I would compare ordering and lookup cost.");
  await page.getByRole("button", { name: "End round early", exact: true }).click();
  await expect(page.getByText(first, { exact: true })).toBeVisible();
  await expect(page.getByText("I would compare ordering and lookup cost.", { exact: true })).toBeVisible();
  await expect(page.getByText(MOCK_PROMPTS[2].prompt, { exact: true })).toHaveCount(0);
  const discard = page.getByRole("button", { name: "Start new round", exact: true });
  page.once("dialog", (dialog) => dialog.dismiss());
  await discard.click();
  await expect(page.getByText(first, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Open debrief", exact: true }).click();
  await expect(page.getByRole("button", { name: "Revisit question 3", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Revisit question 1", exact: true }).click();
  await page.getByRole("button", { name: "Reveal another hint", exact: true }).click();
  await expect(page.getByText(MOCK_PROMPTS[0].hints[1], { exact: true })).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await discard.click();
  await expect(page.getByRole("button", { name: "Start mock interview", exact: true })).toBeVisible();
  await expect(page.getByText(first, { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Start mock interview", exact: true }).click();
  await answer.fill("A different round starts with no remembered hint visibility.");
  await page.getByRole("button", { name: "End round early", exact: true }).click();
  await page.getByRole("button", { name: "Open debrief", exact: true }).click();
  await expect(page.getByRole("button", { pressed: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Revisit question 1", exact: true }).click();
  await expect(page.getByRole("button", { name: "Reveal another hint", exact: true })).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByText(MOCK_PROMPTS[0].hints[1], { exact: true })).toBeHidden();
  expect(requests).toEqual([]);
});
