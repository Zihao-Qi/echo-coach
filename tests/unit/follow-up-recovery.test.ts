import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { MemoryAttemptRepository } from "../../src/infrastructure/persistence/memory-attempt-repository";
import { practiceRepository } from "../../src/infrastructure/persistence/practice-repository";
import { DemoPracticeEvaluator } from "../../src/infrastructure/ai/demo/practice-evaluator";
import { starterQuestions } from "../../src/content/questions/starter-bank";
import { submitPracticeAttempt } from "../../src/application/workflows/submit-practice-attempt";
import { resolveQuestionSeed } from "../../src/application/workflows/resolve-question-seed";
import { POST } from "../../src/app/api/practice/evaluate/route";
import { newDemoSession, readDemoOwner } from "../../src/infrastructure/auth/practice-access";

const root = starterQuestions[0];
const answer = "I wrote the API routes for a class project and learned to test error cases.";
const demo = new DemoPracticeEvaluator();

test("legacy failed recovery initializes snapshot before generation, once only", async () => {
  const repository = new MemoryAttemptRepository();
  const submissionId = randomUUID();
  await repository.create("alice", { id: submissionId, questionId: root.id, answer, status: "failed", submittedAt: "2026-01-01T00:00:00.000Z" });
  const submission = { submissionId, questionId: root.id, answer };
  await assert.rejects(submitPracticeAttempt("alice", root, submission, repository, { mode: "demo", model: "fail", evaluate: async () => {
    assert.equal((await repository.get("alice", submissionId))?.questionSnapshot?.prompt, root.prompt);
    throw new Error("Offline fixture failure");
  } }, 20));
  const edited = { ...root, prompt: "A different current catalog prompt." };
  const result = await submitPracticeAttempt("alice", edited, submission, repository, demo, 20);
  const stored = await repository.get("alice", submissionId);
  assert.equal(result.questionSnapshot!.prompt, root.prompt);
  assert.deepEqual(result.questionSnapshot, stored!.questionSnapshot);
  assert.equal(result.rootQuestionId, stored!.rootQuestionId);
});

test("snapshot initialization cannot poison another target or rewrite completed legacy history", async () => {
  const repository = new MemoryAttemptRepository();
  const id = randomUUID();
  await repository.create("alice", { id, questionId: root.id, answer, status: "failed", submittedAt: new Date().toISOString() });
  await assert.rejects(submitPracticeAttempt("alice", starterQuestions[1], { submissionId: id, questionId: starterQuestions[1].id, answer }, repository, demo, 20), /different answer/);
  assert.equal((await repository.get("alice", id))!.questionSnapshot, undefined);
  const completed = randomUUID();
  await repository.create("alice", { id: completed, questionId: root.id, answer, status: "completed", submittedAt: new Date().toISOString(), evaluation: await demo.evaluate(root, answer), provenance: { mode: "demo", model: "old", promptVersion: "old", rubricVersion: "1" } });
  await repository.initializeSnapshot("alice", completed, root, root.id);
  assert.equal((await repository.get("alice", completed))!.questionSnapshot, undefined);
});

test("saved root and follow-up references resolve after catalog removal without crossing owners", async () => {
  const repository = new MemoryAttemptRepository();
  const source = await submitPracticeAttempt("alice", root, { submissionId: randomUUID(), questionId: root.id, answer }, repository, demo, 20);
  const child = await submitPracticeAttempt("alice", root, { submissionId: randomUUID(), questionId: root.id, followUpOfAttemptId: source.id, answer }, repository, demo, 20);
  const inputs = [
    { submissionId: source.id, questionId: root.id },
    { submissionId: randomUUID(), questionId: root.id, previousAttemptId: source.id },
    { submissionId: randomUUID(), questionId: root.id, followUpOfAttemptId: source.id },
    { submissionId: child.id, questionId: root.id, followUpOfAttemptId: source.id },
  ];
  for (const input of inputs) assert.equal((await resolveQuestionSeed("alice", input, repository, () => undefined))?.prompt, root.prompt);
  assert.equal(await resolveQuestionSeed("bob", inputs[1], repository, () => undefined), undefined);
});

test("a follow-up with a snapshot-less legacy root survives catalog removal", async () => {
  const repository = new MemoryAttemptRepository();
  const sourceId = randomUUID();
  await repository.create("alice", { id: sourceId, questionId: root.id, answer, status: "completed", submittedAt: new Date().toISOString(), evaluation: await demo.evaluate(root, answer), provenance: { mode: "demo", model: "legacy", promptVersion: "legacy", rubricVersion: "1" } });
  const submission = { submissionId: randomUUID(), questionId: root.id, answer, followUpOfAttemptId: sourceId };
  const child = await submitPracticeAttempt("alice", root, submission, repository, demo, 20);
  const seed = await resolveQuestionSeed("alice", submission, repository, () => undefined);
  assert.equal(seed?.id, child.questionId);
  assert.equal(seed?.origin, "follow-up");
  const replay = await submitPracticeAttempt("alice", seed!, submission, repository, demo, 20);
  assert.equal(replay.id, child.id);
  const retryInput = { ...submission, submissionId: randomUUID(), previousAttemptId: child.id };
  const retrySeed = await resolveQuestionSeed("alice", retryInput, repository, () => undefined);
  const retry = await submitPracticeAttempt("alice", retrySeed!, retryInput, repository, demo, 20);
  assert.deepEqual(retry.questionSnapshot, child.questionSnapshot);
});

test("API can replay saved snapshots for a question absent from the current catalog", async () => {
  const keys = ["USE_MOCK", "PRACTICE_AUTH_MODE", "PRACTICE_STORAGE"];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  Object.assign(process.env, { USE_MOCK: "true", PRACTICE_AUTH_MODE: "demo", PRACTICE_STORAGE: "memory" });
  try {
    const cookie = `echo-practice-demo=${newDemoSession()}`;
    const request = new Request("http://localhost/api/practice/evaluate", { headers: { Cookie: cookie } });
    const owner = readDemoOwner(request)!;
    const removed = { ...root, id: `removed-${randomUUID()}` };
    const submission = { submissionId: randomUUID(), questionId: removed.id, answer };
    const result = await submitPracticeAttempt(owner, removed, submission, practiceRepository(), demo, 20);
    const response = await POST(new Request(request.url, { method: "POST", headers: { Cookie: cookie, "Content-Type": "application/json" }, body: JSON.stringify(submission) }));
    assert.equal(response.status, 200);
    assert.equal((await response.json()).attempt.id, result.id);
    const retry = await POST(new Request(request.url, { method: "POST", headers: { Cookie: cookie, "Content-Type": "application/json" }, body: JSON.stringify({ ...submission, submissionId: randomUUID(), previousAttemptId: result.id }) }));
    assert.equal(retry.status, 200);
    assert.equal((await retry.json()).attempt.questionSnapshot.prompt, root.prompt);
  } finally { for (const key of keys) { if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]; } }
});
