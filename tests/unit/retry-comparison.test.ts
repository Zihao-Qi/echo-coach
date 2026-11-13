import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { AnswerEvaluation, PreviousAnswer, RetryComparison } from "../../src/domain/interview/practice";
import { starterQuestions } from "../../src/content/questions/starter-bank";
import { DemoPracticeEvaluator } from "../../src/infrastructure/ai/demo/practice-evaluator";
import { MemoryAttemptRepository } from "../../src/infrastructure/persistence/memory-attempt-repository";
import { evaluateAttempt } from "../../src/application/workflows/evaluate-attempt";
import { orderAttempts } from "../../src/domain/interview/attempt-order";
import { submitPracticeAttempt } from "../../src/application/workflows/submit-practice-attempt";

const question = starterQuestions[2];
const before = "A sorted array has O(1) binary search and constant-time insertion.";
const after = "A sorted array has O(log n) binary search and O(n) insertion due to shifts.";
const previous = (): PreviousAnswer => ({ id: randomUUID(), questionId: question.id, answer: before });
const comparison = (): RetryComparison => ({
  summary: "Lookup and insertion costs are corrected in this answer.",
  changes: [{ kind: "improvement", observation: "Binary search complexity is now logarithmic.", beforeExcerpt: "O(1) binary search", afterExcerpt: "O(log n) binary search" }],
  nextFocus: "Explain when ordering matters for the workload.",
});
async function evaluatorFor(answer: string, retry: RetryComparison | null) {
  const fixture = await new DemoPracticeEvaluator().evaluate(question, answer);
  return { mode: "gemini" as const, model: "offline-fixture", evaluate: async () => ({ ...fixture, comparison: retry }) };
}

test("comparison uses exact excerpts from their respective submitted answers", async () => {
  const base = previous();
  const evaluator = await evaluatorFor(after, comparison());
  const result = await evaluateAttempt(question, { questionId: question.id, answer: after, previousAttemptId: base.id }, evaluator, base);
  assert.equal(result.previousAttemptId, base.id);
  assert.equal(result.evaluation.comparison?.changes[0].kind, "improvement");
});

test("fabricated or swapped before/after excerpts are rejected", async () => {
  const base = previous();
  for (const changes of [
    [{ ...comparison().changes[0], beforeExcerpt: "I deployed a production system" }],
    [{ ...comparison().changes[0], beforeExcerpt: "O(log n) binary search", afterExcerpt: "O(1) binary search" }],
  ]) {
    const evaluator = await evaluatorFor(after, { ...comparison(), changes });
    await assert.rejects(evaluateAttempt(question, { questionId: question.id, answer: after, previousAttemptId: base.id }, evaluator, base), /correct answer/);
  }
});

test("first attempts and identical answers cannot claim retry gains", async () => {
  const evaluator = await evaluatorFor(after, comparison());
  const first = await evaluateAttempt(question, { questionId: question.id, answer: after }, evaluator);
  assert.equal(first.evaluation.comparison, null);
  const base = { ...previous(), answer: after };
  const unchanged = await evaluateAttempt(question, { questionId: question.id, answer: after, previousAttemptId: base.id }, evaluator, base);
  assert.equal(unchanged.evaluation.comparison, null);
});

test("identical quoted evidence cannot be labeled improved or regressed", async () => {
  const base = previous();
  const retry = comparison(); retry.changes[0].beforeExcerpt = "A sorted array"; retry.changes[0].afterExcerpt = "A sorted array";
  const evaluator = await evaluatorFor(after, retry);
  await assert.rejects(evaluateAttempt(question, { questionId: question.id, answer: after, previousAttemptId: base.id }, evaluator, base), /identical evidence/);
});

test("whitespace cannot fake evidence changes or count as quoted content", async () => {
  const base = previous();
  const formatted = before.replace("O(1)", " O(1)") + " This extra sentence is unrelated.";
  for (const [beforeExcerpt, afterExcerpt, message] of [
    ["O(1) binary search", " O(1) binary search", /identical evidence/],
    [" ", " ", /non-whitespace/],
  ] as const) {
    const retry = comparison(); retry.changes[0].beforeExcerpt = beforeExcerpt; retry.changes[0].afterExcerpt = afterExcerpt;
    const evaluator = await evaluatorFor(formatted, retry);
    await assert.rejects(evaluateAttempt(question, { questionId: question.id, answer: formatted, previousAttemptId: base.id }, evaluator, base), message);
  }
  const whitespaceOnly = before.replaceAll(" ", "  ");
  const result = await evaluateAttempt(question, { questionId: question.id, answer: whitespaceOnly, previousAttemptId: base.id }, await evaluatorFor(whitespaceOnly, comparison()), base);
  assert.equal(result.evaluation.comparison, null);
});

test("parent-before-child ordering resolves timestamp ties without relying on UUID order", async () => {
  const fixture = await new DemoPracticeEvaluator().evaluate(question, before);
  const parent = { id: "z-parent", questionId: question.id, answer: before, submittedAt: "2026-01-01T00:00:00.000Z", evaluation: fixture, provenance: { mode: "demo" as const, model: "test", promptVersion: "test", rubricVersion: "1" } };
  const child = { ...parent, id: "a-child", previousAttemptId: parent.id, answer: after };
  assert.deepEqual(orderAttempts([child, parent]).map((attempt) => attempt.id), [parent.id, child.id]);
});

test("regressions remain regressions; the application never assumes a retry improved", async () => {
  const base = { ...previous(), answer: after };
  const retry = comparison(); retry.changes[0] = { ...retry.changes[0], kind: "regression", beforeExcerpt: "O(log n) binary search", afterExcerpt: "O(1) binary search" };
  retry.summary = "This retry introduces an incorrect lookup complexity.";
  const evaluator = await evaluatorFor(before, retry);
  const result = await evaluateAttempt(question, { questionId: question.id, answer: before, previousAttemptId: base.id }, evaluator, base);
  assert.equal(result.evaluation.comparison?.changes[0].kind, "regression");
});

test("missing, mismatched, and cross-question baseline contexts fail before evaluation", async () => {
  const base = previous();
  const evaluator = await evaluatorFor(after, comparison());
  const input = { questionId: question.id, answer: after, previousAttemptId: base.id };
  await assert.rejects(evaluateAttempt(question, input, evaluator), /validated previous/);
  await assert.rejects(evaluateAttempt(question, input, evaluator, { ...base, id: randomUUID() }), /validated previous/);
  await assert.rejects(evaluateAttempt(question, input, evaluator, { ...base, questionId: "another-question" }), /validated previous/);
  await assert.rejects(evaluateAttempt(question, { questionId: question.id, answer: after }, evaluator, base), /Unexpected previous/);
});

test("repository-resolved baseline is passed in the existing single provider call", async () => {
  const repository = new MemoryAttemptRepository();
  const firstId = randomUUID(), secondId = randomUUID();
  let calls = 0;
  const inputs: (PreviousAnswer | undefined)[] = [];
  const demo = new DemoPracticeEvaluator();
  const evaluator = {
    mode: "demo" as const, model: "test",
    evaluate: async (q: typeof question, answer: string, baseline?: PreviousAnswer): Promise<AnswerEvaluation> => {
      calls++; inputs.push(baseline); return demo.evaluate(q, answer, baseline);
    },
  };
  await submitPracticeAttempt("alice", question, { submissionId: firstId, questionId: question.id, answer: before }, repository, evaluator, 10);
  const second = { submissionId: secondId, questionId: question.id, answer: after, previousAttemptId: firstId };
  const result = await submitPracticeAttempt("alice", question, second, repository, evaluator, 10);
  await submitPracticeAttempt("alice", question, second, repository, evaluator, 10);
  assert.equal(calls, 2);
  assert.equal(inputs[0], undefined);
  assert.deepEqual(inputs[1], { id: firstId, questionId: question.id, answer: before });
  assert.match(result.evaluation.comparison!.summary, /Illustrative comparison only/);
  const stored = await repository.get("alice", secondId);
  assert.equal(stored?.previousAttemptId, firstId);
  assert.ok(stored?.evaluation?.comparison);
});
