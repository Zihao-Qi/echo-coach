import { expect, test, type Page } from "@playwright/test";
import { findQuestion } from "../../src/content/questions/starter-bank";

const source = findQuestion("swe-pagination")!;
const destination = findQuestion("swe-hash-map")!;
const shortcutName = `Try another question in Software engineering: ${destination.competency}`;
const first = "I would sort submissions by time, then by a unique identifier to break ties.";
const revision = `${first} I would test a boundary where three submissions have the same time.`;
const destinationAnswer = "I would choose a sorted array for ordered traversal in a read-heavy workload.";
const sidebar = (page: Page, name: string) => page.getByRole("button", { name: new RegExp(`^${name} \\d+ attempts`) });
const draft = (page: Page) => page.getByLabel("Your answer", { exact: true });
const shortcut = (page: Page) => page.getByRole("button", { name: shortcutName, exact: true });

async function submit(page: Page, text: string, retry = false) {
  await draft(page).fill(text);
  const response = page.waitForResponse(r => r.url().endsWith("/api/practice/evaluate") && r.request().method() === "POST");
  await page.getByRole("button", { name: retry ? "Evaluate my retry" : "Get feedback", exact: true }).click();
  expect((await response).ok()).toBe(true);
  await expect(page.getByRole("button", { name: "Evaluate my retry", exact: true })).toBeEnabled();
}

for (const width of [320, 1280]) {
  test(`post-retry shortcut wraps without losing drafts or generating requests at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/practice?track=swe");
    await submit(page, destinationAnswer);
    const unsent = width === 320 ? "" : "A separate unsent destination revision.";
    // Reload clears page-memory drafts but keeps the destination's submitted attempt.
    if (unsent) await draft(page).fill(unsent);
    else {
      await page.reload();
      await expect(page.getByRole("region", { name: "Attempt comparison" })).toContainText(destinationAnswer);
      await expect(draft(page)).toHaveValue("");
    }
    await sidebar(page, source.competency).click();
    await submit(page, first);
    await expect(shortcut(page)).toHaveCount(0);
    const requests: string[] = [];
    page.on("request", r => { if (new URL(r.url()).pathname.startsWith("/api/")) requests.push(`${r.method()} ${new URL(r.url()).pathname}`); });
    await submit(page, revision, true);
    const button = shortcut(page);
    await expect(button).toHaveCount(1);
    await expect(button).not.toBeFocused();
    await button.focus();
    await expect(button).toBeInViewport();
    expect(await button.evaluate(el => el.getBoundingClientRect().right <= innerWidth && el.getBoundingClientRect().left >= 0 && el.scrollWidth <= el.clientWidth)).toBe(true);
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { name: destination.prompt, exact: true })).toBeFocused();
    await expect(page.getByText(`Selected question: ${destination.prompt}`, { exact: true })).toBeVisible();
    await expect(draft(page)).toHaveValue(unsent);
    await expect(page.getByRole("region", { name: "Attempt comparison" })).toContainText(destinationAnswer);
    await expect(button).toHaveCount(0);
    await sidebar(page, source.competency).click();
    await expect(draft(page)).toHaveValue(revision);
    await expect(page.getByRole("region", { name: "Attempt comparison" })).toContainText(first);
    expect(requests).toEqual(["POST /api/practice/evaluate"]);
  });
}

test("post-retry shortcut respects evaluation and voice locks and cancelable discard", async ({ page }) => {
  await page.goto("/practice?track=swe");
  await draft(page).fill(destinationAnswer);
  await sidebar(page, source.competency).click();
  await submit(page, first);
  await submit(page, revision, true);
  const button = shortcut(page);
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/practice/evaluate", async route => { await gate; await route.continue(); });
  const pending = page.waitForRequest(r => r.url().endsWith("/api/practice/evaluate"));
  const updated = `${revision} I would also check the first and last pages.`;
  await draft(page).fill(updated);
  await page.getByRole("button", { name: "Evaluate my retry", exact: true }).click();
  await pending;
  try { await expect(button).toBeDisabled(); } finally { release(); }
  await expect(button).toBeEnabled();
  const writes: string[] = [];
  page.on("request", r => { if (r.method() === "POST") writes.push(r.url()); });
  await page.getByRole("button", { name: "Record answer", exact: true }).click();
  await expect(page.getByText(/Recording:.*0:01/)).toBeVisible();
  await expect(button).toBeDisabled();
  await page.getByRole("button", { name: "Stop recording", exact: true }).click();
  const send = page.getByRole("button", { name: "Transcribe (demo)", exact: true });
  await expect(send).toBeVisible();
  page.once("dialog", d => d.dismiss());
  await button.click();
  await expect(send).toBeVisible();
  await expect(draft(page)).toHaveValue(updated);
  page.once("dialog", d => d.accept());
  await button.click();
  await expect(page.getByRole("heading", { name: destination.prompt, exact: true })).toBeFocused();
  await expect(draft(page)).toHaveValue(destinationAnswer);
  await expect(send).toHaveCount(0);
  await sidebar(page, source.competency).click();
  await expect(draft(page)).toHaveValue(updated);
  expect(writes).toEqual([]);
});
