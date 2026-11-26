import { expect, test, type Page } from "@playwright/test";
import {
  demoAudioAssets,
  getDemoAudio,
  getSampleContent,
} from "../../src/content/questions/demo-audio";
import { findQuestion } from "../../src/content/questions/starter-bank";
import { makeFollowUpQuestion } from "../../src/domain/interview/follow-up";
import { DemoPracticeEvaluator } from "../../src/infrastructure/ai/demo/practice-evaluator";
import type { AttemptRecord } from "../../src/domain/interview/attempt-record";

const behavior = findQuestion("behavioral-project")!;
const swe = findQuestion("swe-hash-map")!;
const first =
  "For a club roster I would choose a hash map to find the member associated with an email.";
const revised = `${first} For ordered scans I would use a sorted array.`;
const draft = (page: Page) =>
  page.getByRole("textbox", { name: "Your answer", exact: true });
const button = (page: Page, name: string) =>
  page.getByRole("button", { name, exact: true });
async function submit(page: Page, text: string, action = "Get feedback") {
  await draft(page).fill(text);
  const response = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/practice/evaluate") &&
      r.request().method() === "POST",
  );
  await button(page, action).click();
  expect((await response).ok()).toBe(true);
  await expect(button(page, "Edit answer")).toBeVisible();
}

async function makeRecord(
  question = swe,
  index = 1,
  answer = first,
  extra: Partial<AttemptRecord> = {},
): Promise<AttemptRecord> {
  return {
    id: `a0000000-0000-4000-8000-00000000000${index}`,
    questionId: question.id,
    status: "completed",
    questionSnapshot: question,
    answer,
    submittedAt: `2026-01-01T00:00:0${index}.000Z`,
    provenance: {
      mode: "demo",
      model: "recap-fixture",
      promptVersion: "test",
      rubricVersion: "1",
    },
    evaluation: await new DemoPracticeEvaluator().evaluate(question, answer),
    ...extra,
  };
}

test("session recap starts hidden, shows loaded groups and older attempts, then preserves the draft and handles empty history", async ({
  page,
}) => {
  const root = await makeRecord();
  const latest = await makeRecord(swe, 3, revised, {
    previousAttemptId: root.id,
  });
  const other = await makeRecord(
    behavior,
    2,
    "In a fictional class project I wrote the scheduler that assigned workshop slots.",
  );
  const followUp = makeFollowUpQuestion(
    swe,
    latest.id,
    latest.evaluation!.followUp!,
  );
  const child = await makeRecord(
    followUp,
    4,
    "For a concrete example I would choose a range scan of all names starting with the same letter.",
    {
      followUpOfAttemptId: latest.id,
      rootQuestionId: swe.id,
    },
  );
  const cursor = { submittedAt: other.submittedAt, id: other.id };
  let populated = false,
    loadedOlder = false;
  await page.route(/\/api\/practice\/attempts(?:\?.*)?$/, (route) => {
    if (new URL(route.request().url()).searchParams.has("cursor")) {
      loadedOlder = true;
      return route.fulfill({ json: { records: [root], cursor: null } });
    }
    return route.fulfill({
      json: populated
        ? { records: [child, latest, other], cursor }
        : { records: [], cursor: null },
    });
  });
  await page.goto("/practice?track=swe");
  const recap = button(page, "Session recap");
  await expect(draft(page)).toBeVisible();
  await expect(recap).toHaveCount(0);
  populated = true;
  await page.reload();
  await button(page, "Edit answer").click();
  await draft(page).fill(
    "A saved local draft that I have not submitted for feedback.",
  );
  await recap.click();
  const main = page.getByRole("main");
  await expect(
    main.getByRole("heading", { name: "Session recap" }),
  ).toBeFocused();
  await expect(
    main.getByText(
      "From this session's temporary history. No scores or assessments.",
    ),
  ).toBeVisible();
  await expect(main.getByRole("heading", { level: 2 })).toHaveText([
    "Software engineering · Follow-up · 1 attempt",
    "Software engineering · 1 attempt",
    "Behavioral · 1 attempt",
  ]);
  await expect(main.getByText("Showing recent attempts.")).toBeVisible();
  await button(page, "Load older attempts").click();
  await expect(
    main.getByRole("heading", {
      name: "Software engineering · 2 attempts",
      exact: true,
    }),
  ).toBeVisible();
  await expect(main.getByText(first, { exact: true })).toBeVisible();
  await expect(main.getByText(revised, { exact: true })).toBeVisible();
  const sweSummary = main
    .locator("section")
    .filter({
      has: page.getByRole("heading", {
        name: "Software engineering · 2 attempts",
        exact: true,
      }),
    });
  await expect(
    sweSummary.getByText(swe.rubric.expectedConcepts[0], { exact: true }),
  ).toBeVisible();
  expect(loadedOlder).toBe(true);
  await expect(
    main.getByRole("link", { name: "Start 3-question mock interview" }),
  ).toHaveAttribute("href", "/mock-interview");
  await button(page, "Back to practice").click();
  await expect(main.getByRole("heading", { level: 1 })).toBeFocused();
  await expect(draft(page)).toHaveValue(
    "A saved local draft that I have not submitted for feedback.",
  );
  await recap.click();
  populated = false;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(
    main.getByText("Your session history is empty. It may have reset."),
  ).toBeVisible();
  await button(page, "Back to practice").click();
  await expect(recap).toHaveCount(0);
  await expect(draft(page)).toHaveValue(
    "A saved local draft that I have not submitted for feedback.",
  );
});

test("only technical starters show polished sample text; missing audio never leaves a dead control", async ({
  page,
}) => {
  await page.goto("/practice");
  if (!getDemoAudio(behavior.id, "question"))
    await expect(button(page, "Listen to the question")).toHaveCount(0);
  await submit(
    page,
    "In a fictional project I built a catalog page and checked the design with two classmates.",
  );
  await expect(
    page.getByRole("heading", { name: "Structure outline" }),
  ).toBeVisible();
  const polished = page.getByRole("region", {
    name: "Sample polished answer",
    exact: true,
  });
  await expect(polished).toHaveCount(0);
  await button(page, "Software engineering").click();
  await submit(page, first);
  const sample = getSampleContent(swe.id)!;
  await expect(polished).toBeVisible();
  for (const text of sample.polishedAnswer!)
    await expect(polished.getByText(text, { exact: true })).toBeVisible();
  if (!getDemoAudio(swe.id, "answer"))
    await expect(button(page, "Play sample polished answer")).toHaveCount(0);
  await button(page, "Answer follow-up").click();
  await expect(polished).toHaveCount(0);
  await expect(button(page, "Listen to the question")).toHaveCount(0);
  await submit(page, revised);
  await expect(polished).toHaveCount(0);

  const archived = {
    ...swe,
    id: "retired-technical-fixture",
    competency: "Historical technical prompt",
  };
  const record = await makeRecord(archived);
  await page.route(/\/api\/practice\/attempts(?:\?.*)?$/, (route) =>
    route.fulfill({ json: { records: [record], cursor: null } }),
  );
  await page.goto("/practice?track=swe");
  await page.getByText("Earlier questions (1)", { exact: true }).click();
  await page
    .getByRole("button", { name: /Historical technical prompt/ })
    .click();
  await expect(polished).toHaveCount(0);
  await button(page, "Edit answer").click();
  await expect(button(page, "Listen to the question")).toHaveCount(0);
});

test("default demo fixture becomes the current starter transcript without changing the server response", async ({
  page,
}) => {
  await page.goto("/practice?track=swe");
  await button(page, "Record answer").click();
  await expect(page.getByText(/Recording:.*0:01/)).toBeVisible();
  await button(page, "Stop recording").click();
  const route = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/practice/transcriptions") &&
      r.request().method() === "POST",
  );
  await button(page, "Transcribe (demo)").click();
  expect((await (await route).json()).transcription.text).not.toBe(
    getSampleContent(swe.id)!.sampleTranscript,
  );
  await expect(
    page.getByLabel("Review and edit demo transcript before applying"),
  ).toHaveValue(getSampleContent(swe.id)!.sampleTranscript);
});

test.describe("bundled prerecorded audio", () => {
  test.skip(
    demoAudioAssets.length === 0,
    "Run in a disposable tree with the silent AAC fixture manifest or reviewed audio.",
  );

  test("plays on demand, pauses, resets at the end, and yields to the other player", async ({
    page,
  }) => {
    const requests: string[] = [];
    page.on("request", (request) => {
      if (new URL(request.url()).pathname.startsWith("/audio/"))
        requests.push(new URL(request.url()).pathname);
    });
    await page.goto("/practice?track=swe");
    const listen = button(page, "Listen to the question"),
      pause = button(page, "Pause question audio");
    await expect(listen).toBeVisible();
    await expect(
      page.getByRole("progressbar", { name: "Question audio progress" }),
    ).toHaveAttribute("aria-valuenow", "0");
    expect(requests).toEqual([]);
    await listen.click();
    await expect(pause).toBeVisible();
    await pause.click();
    await expect(listen).toBeVisible();
    await listen.click();
    await expect(pause).toBeVisible();
    await page.locator("audio").evaluate((a: HTMLAudioElement) => {
      a.currentTime = a.duration - 0.1;
    });
    await expect(listen).toBeVisible();
    await expect(
      page.getByRole("progressbar", { name: "Question audio progress" }),
    ).toHaveAttribute("aria-valuenow", "0");
    await listen.click();
    await expect(pause).toBeVisible();
    await submit(page, first);
    await button(page, "Edit answer").click();
    const playAnswer = button(page, "Play sample polished answer"),
      pauseAnswer = button(page, "Pause sample polished answer");
    await listen.click();
    await expect(pause).toBeVisible();
    await playAnswer.click();
    await expect(pauseAnswer).toBeVisible();
    await expect(listen).toBeVisible();
    await listen.click();
    await expect(pause).toBeVisible();
    await expect(playAnswer).toBeVisible();
    await button(page, "Session recap").click();
    await expect(page.locator("audio")).toHaveCount(0);
    await button(page, "Back to practice").click();
    await expect(listen).toBeVisible();
    await listen.click();
    await expect(pause).toBeVisible();
    await button(page, "Record answer").click();
    await expect(listen).toBeVisible();
    await button(page, "Discard").click();
    await playAnswer.click();
    await expect(pauseAnswer).toBeVisible();
    await button(page, "Answer follow-up").click();
    await expect(page.locator("audio")).toHaveCount(0);
  });

  test("replaces failed question and sample audio with focused statuses and preserves text and typing", async ({
    page,
  }) => {
    await page.route("**/audio/**", (route) =>
      route.fulfill({ status: 404, body: "Fixture audio not available." }),
    );
    await page.goto("/practice?track=swe");
    await button(page, "Listen to the question").click();
    const unavailable = page
      .getByRole("status")
      .filter({ hasText: "Audio isn't available right now." });
    await expect(unavailable).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toBeFocused();
    await expect(button(page, "Listen to the question")).toHaveCount(0);
    await submit(page, first);
    await button(page, "Play sample polished answer").click();
    const card = page.getByRole("region", {
      name: "Sample polished answer",
      exact: true,
    });
    await expect(card.getByRole("status")).toBeVisible();
    await expect(card.getByRole("heading")).toBeFocused();
    await expect(
      card.getByText("constant time on average", { exact: true }),
    ).toBeVisible();
    await expect(button(page, "Play sample polished answer")).toHaveCount(0);
  });

  test("changing a question, track or selected attempt stops the current clip", async ({
    page,
  }) => {
    await page.goto("/practice?track=swe");
    const listen = button(page, "Listen to the question"),
      pause = button(page, "Pause question audio");
    await listen.click();
    await expect(pause).toBeVisible();
    await button(page, "Debugging and testing").click();
    await expect(listen).toBeVisible();
    await listen.click();
    await expect(pause).toBeVisible();
    await button(page, "Behavioral").click();
    await expect(listen).toBeVisible();
    await button(page, "Software engineering").click();
    await submit(page, first);
    await button(page, "Edit answer").click();
    await submit(page, revised, "Evaluate my retry");
    const play = button(page, "Play sample polished answer");
    await play.click();
    await expect(button(page, "Pause sample polished answer")).toBeVisible();
    await button(page, "Attempt 1").click();
    await expect(play).toBeVisible();
    await expect(page.locator("audio")).toHaveJSProperty("paused", true);
  });

  test("mock turn transitions stop audio without making app API requests", async ({
    page,
  }) => {
    const calls: string[] = [];
    await page.route("**/api/**", (route) => {
      calls.push(route.request().url());
      return route.abort();
    });
    await page.goto("/mock-interview");
    await button(page, "Start mock interview").click();
    const listen = button(page, "Listen to the question"),
      pause = button(page, "Pause question audio");
    await listen.click();
    await expect(pause).toBeVisible();
    await draft(page).fill(first);
    await button(page, "Save and continue").click();
    await expect(listen).toBeVisible();
    await listen.click();
    await expect(pause).toBeVisible();
    await button(page, "Skip question").click();
    await listen.click();
    await expect(pause).toBeVisible();
    await button(page, "End round early").click();
    await expect(page.locator("audio")).toHaveCount(0);
    page.once("dialog", (dialog) => dialog.accept());
    await button(page, "Start new round").click();
    await button(page, "Start mock interview").click();
    await listen.click();
    await expect(pause).toBeVisible();
    await button(page, "Discard round").click();
    await expect(page.locator("audio")).toHaveCount(0);
    expect(calls).toEqual([]);
  });
});
