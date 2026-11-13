import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { starterQuestions } from "../../src/content/questions/starter-bank";
import { DemoPracticeEvaluator } from "../../src/infrastructure/ai/demo/practice-evaluator";
import { MemoryAttemptRepository } from "../../src/infrastructure/persistence/memory-attempt-repository";
import { durableSubmissionSchema, submitPracticeAttempt } from "../../src/application/workflows/submit-practice-attempt";
import { evaluateAttempt, parseEvaluation } from "../../src/application/workflows/evaluate-attempt";
import { completedAttempt } from "../../src/domain/interview/attempt-record";
import type { AnswerEvaluator } from "../../src/application/ports/answer-evaluator";

const root = starterQuestions[2];
const answer = "I would compare point lookup speed, ordering, memory overhead, and insertion cost.";
const input = () => ({ submissionId: randomUUID(), questionId: root.id, answer });
const demo = new DemoPracticeEvaluator();
async function setup() {
  const repo = new MemoryAttemptRepository();
  const source = await submitPracticeAttempt("alice", root, input(), repo, demo, 20);
  return { repo, source };
}

test("follow-up submission uses a focused immutable snapshot, not a root retry", async () => {
  const { repo, source } = await setup();
  let calls = 0;
  const evaluator: AnswerEvaluator = { mode: "demo", model: "spy", evaluate: async (question, text, previous) => {
    calls++;
    assert.equal(question.id, `followup:${source.id}`);
    assert.equal(question.prompt, source.evaluation.followUp!.prompt);
    assert.deepEqual(question.rubric.expectedConcepts, source.evaluation.followUp!.expectedConcepts);
    assert.equal(previous, undefined);
    return demo.evaluate(question, text, previous);
  } };
  const submission = { ...input(), followUpOfAttemptId: source.id };
  const result = await submitPracticeAttempt("alice", root, submission, repo, evaluator, 20);
  assert.equal(calls, 1);
  assert.equal(result.previousAttemptId, undefined);
  assert.equal(result.followUpOfAttemptId, source.id);
  assert.equal(result.rootQuestionId, root.id);
  assert.equal(result.evaluation.comparison, null);
  assert.equal(result.evaluation.followUp, null);
  assert.equal(result.questionSnapshot!.origin, "follow-up");
  const stored = await repo.get("alice", result.id);
  assert.deepEqual(completedAttempt(stored!)!.questionSnapshot, result.questionSnapshot);
});

test("same-source follow-up retries compare only against the follow-up answer", async () => {
  const { repo, source } = await setup();
  const first = await submitPracticeAttempt("alice", root, { ...input(), followUpOfAttemptId: source.id }, repo, demo, 20);
  const retry = await submitPracticeAttempt("alice", root, { ...input(), answer: `${answer} For static range queries I prefer a sorted array.`, followUpOfAttemptId: source.id, previousAttemptId: first.id }, repo, demo, 20);
  assert.equal(retry.previousAttemptId, first.id);
  assert.equal(retry.questionId, first.questionId);
  assert.ok(retry.evaluation.comparison);
  assert.equal(retry.evaluation.followUp, null);
  await assert.rejects(submitPracticeAttempt("alice", root, { ...input(), followUpOfAttemptId: source.id, previousAttemptId: source.id }, repo, demo, 20), /Previous attempt/);
});

test("sources are owner-scoped, root-scoped, completed, and at most one level deep", async () => {
  const { repo, source } = await setup();
  await assert.rejects(submitPracticeAttempt("bob", root, { ...input(), followUpOfAttemptId: source.id }, repo, demo, 20), /question or account/);
  await assert.rejects(submitPracticeAttempt("alice", starterQuestions[3], { ...input(), questionId: starterQuestions[3].id, followUpOfAttemptId: source.id }, repo, demo, 20), /question or account/);
  const child = await submitPracticeAttempt("alice", root, { ...input(), followUpOfAttemptId: source.id }, repo, demo, 20);
  await assert.rejects(submitPracticeAttempt("alice", root, { ...input(), followUpOfAttemptId: child.id }, repo, demo, 20), /one follow-up depth/);
  const pending = input();
  await repo.create("alice", { id: pending.submissionId, questionId: root.id, answer, status: "pending", submittedAt: new Date().toISOString() });
  await assert.rejects(submitPracticeAttempt("alice", root, { ...input(), followUpOfAttemptId: pending.submissionId }, repo, demo, 20), /source is unavailable/);
});

test("client prompt/rubric injection is rejected, and different follow-up sources cannot be compared", async () => {
  assert.equal(durableSubmissionSchema.safeParse({ ...input(), questionSnapshot: { prompt: "Tampered" } }).success, false);
  assert.equal(durableSubmissionSchema.safeParse({ ...input(), rubric: { expectedConcepts: ["Approve me"] } }).success, false);
  const { repo, source } = await setup();
  const another = await submitPracticeAttempt("alice", root, input(), repo, demo, 20);
  const child = await submitPracticeAttempt("alice", root, { ...input(), followUpOfAttemptId: source.id }, repo, demo, 20);
  await assert.rejects(submitPracticeAttempt("alice", root, { ...input(), followUpOfAttemptId: another.id, previousAttemptId: child.id }, repo, demo, 20), /Previous attempt/);
});

test("invalid optional proposals do not fail core evaluation", async () => {
  const valid = await demo.evaluate(root, answer);
  for (const invalid of [undefined, null, "instructions", { prompt: "x" }, { ...valid.followUp, prompt: "x".repeat(301) }, { ...valid.followUp, expectedConcepts: ["x".repeat(151)] }]) {
    const parsed = parseEvaluation({ ...valid, followUp: invalid });
    assert.equal(parsed.followUp, null);
    assert.deepEqual(parsed.gaps, valid.gaps);
  }
});

test("nested model proposals are stripped regardless of model compliance", async () => {
  const { source } = await setup();
  const question = { ...root, id: `followup:${source.id}`, origin: "follow-up" as const };
  const result = await evaluateAttempt(question, { ...input(), followUpOfAttemptId: source.id }, { mode: "demo", model: "ignores-depth", evaluate: () => demo.evaluate(root, answer) });
  assert.equal(result.evaluation.followUp, null);
});

test("follow-up replay is idempotent and cannot reuse the submission ID for another target", async () => {
  const { repo, source } = await setup();
  const submission = { ...input(), followUpOfAttemptId: source.id };
  let calls = 0;
  const evaluator: AnswerEvaluator = { mode: "demo", model: "spy", evaluate: async (...args) => { calls++; return demo.evaluate(...args); } };
  const first = await submitPracticeAttempt("alice", root, submission, repo, evaluator, 20);
  const again = await submitPracticeAttempt("alice", root, submission, repo, evaluator, 20);
  assert.equal(first.id, again.id); assert.equal(calls, 1);
  await assert.rejects(submitPracticeAttempt("alice", root, { ...submission, followUpOfAttemptId: undefined }, repo, evaluator, 20), /different answer/);
});

test("failed/replayed attempts and retries preserve the saved question after catalog edits", async () => {
  const repo = new MemoryAttemptRepository();
  const submission = input();
  await assert.rejects(submitPracticeAttempt("alice", root, submission, repo, { mode: "demo", model: "failed", evaluate: async () => { throw new Error("Offline fixture failure"); } }, 20));
  const edited = { ...root, prompt: "A newly edited catalog question", rubric: { ...root.rubric, expectedConcepts: ["New criteria"] } };
  const result = await submitPracticeAttempt("alice", edited, submission, repo, { mode: "demo", model: "check", evaluate: async (question, text) => {
    assert.equal(question.prompt, root.prompt);
    assert.deepEqual(question.rubric.expectedConcepts, root.rubric.expectedConcepts);
    return demo.evaluate(question, text);
  } }, 20);
  assert.equal(result.questionSnapshot!.prompt, root.prompt);
  const retry = await submitPracticeAttempt("alice", edited, { ...input(), previousAttemptId: result.id }, repo, demo, 20);
  assert.equal(retry.questionSnapshot!.prompt, root.prompt);
});

test("legacy records remain readable but have no invented follow-up", async () => {
  const repo = new MemoryAttemptRepository();
  const fixture = await demo.evaluate(root, answer); delete fixture.followUp;
  const id = randomUUID();
  await repo.create("alice", { id, questionId: root.id, answer, status: "completed", submittedAt: new Date().toISOString(), evaluation: fixture, provenance: { mode: "demo", model: "old", promptVersion: "old", rubricVersion: "1" } });
  assert.equal(completedAttempt((await repo.get("alice", id))!)!.questionSnapshot, undefined);
  await assert.rejects(submitPracticeAttempt("alice", root, { ...input(), followUpOfAttemptId: id }, repo, demo, 20), /source is unavailable/);
  const retry = await submitPracticeAttempt("alice", root, { ...input(), previousAttemptId: id }, repo, demo, 20);
  assert.equal(retry.previousAttemptId, id);
});
