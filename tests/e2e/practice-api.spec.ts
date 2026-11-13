import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";

test("saved attempts are idempotent, private to the demo session, and recoverable after refresh", async ({ page, browser }) => {
  await page.goto("/practice");
  await expect(page.getByRole("button", { name: "Get feedback" })).toBeVisible();
  // Carry Secure browser cookies explicitly in API checks over local HTTP.
  const cookie = (await page.context().cookies()).map((item) => `${item.name}=${item.value}`).join("; ");
  const headers = { Cookie: cookie };
  const input = { questionId: "behavioral-project", submissionId: randomUUID(), answer: "I built a course project, implemented its API, and wrote integration tests." };
  const first = await page.request.post("/api/practice/evaluate", { data: input, headers });
  expect(first.status()).toBe(200);
  const second = await page.request.post("/api/practice/evaluate", { data: input, headers });
  expect(second.status()).toBe(200);
  expect((await first.json()).attempt.id).toBe((await second.json()).attempt.id);
  const conflict = await page.request.post("/api/practice/evaluate", { data: { ...input, answer: `${input.answer} A different answer.` }, headers });
  expect(conflict.status()).toBe(409);
  const history = await page.request.get("/api/practice/attempts", { headers });
  expect((await history.json()).records).toHaveLength(1);
  const baseline = await page.request.get(`/api/practice/attempts/${input.submissionId}`, { headers });
  expect(baseline.status()).toBe(200);
  const baselinePayload = await baseline.json();
  expect(baselinePayload.record.answer).toBe(input.answer);
  expect(baselinePayload.record.leaseId).toBeUndefined();
  const malformed = await page.request.get("/api/practice/attempts/not-a-uuid", { headers });
  expect(malformed.status()).toBe(400);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Attempt 1", exact: true })).toBeVisible();

  const otherContext = await browser.newContext();
  try {
    const missingSession = await otherContext.request.get("http://127.0.0.1:3100/api/practice/attempts");
    expect(missingSession.status()).toBe(401);
    const access = await otherContext.request.get("http://127.0.0.1:3100/api/practice/access");
    const otherHeaders = { Cookie: access.headers()["set-cookie"].split(";")[0] };
    const otherHistory = await otherContext.request.get("http://127.0.0.1:3100/api/practice/attempts", { headers: otherHeaders });
    expect((await otherHistory.json()).records).toEqual([]);
    const deniedBaseline = await otherContext.request.get(`http://127.0.0.1:3100/api/practice/attempts/${input.submissionId}`, { headers: otherHeaders });
    expect(deniedBaseline.status()).toBe(404);
    const invalidRetry = await otherContext.request.post("http://127.0.0.1:3100/api/practice/evaluate", { data: { ...input, submissionId: randomUUID(), previousAttemptId: input.submissionId }, headers: otherHeaders });
    expect(invalidRetry.status()).toBe(400);
  } finally { await otherContext.close(); }
});
