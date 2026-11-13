import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { MemoryAttemptRepository } from "../../src/infrastructure/persistence/memory-attempt-repository";
import { submitPracticeAttempt } from "../../src/application/workflows/submit-practice-attempt";
import { DemoPracticeEvaluator } from "../../src/infrastructure/ai/demo/practice-evaluator";
import { starterQuestions } from "../../src/content/questions/starter-bank";
import { newDemoSession, readDemoOwner, requirePracticeOwner } from "../../src/infrastructure/auth/practice-access";
import { firestoreClient } from "../../src/infrastructure/persistence/firestore-client";

const question = starterQuestions[0];
const input = () => ({ submissionId: randomUUID(), questionId: question.id, answer: "I built a class project, implemented its API, and wrote integration tests." });

test("attempt is persisted before evaluation; failed evaluation is recoverable", async () => {
  const repository = new MemoryAttemptRepository();
  const submission = input();
  await assert.rejects(submitPracticeAttempt("alice", question, submission, repository, {
    mode: "demo", model: "failing", evaluate: async () => {
      assert.equal((await repository.get("alice", submission.submissionId))?.answer, submission.answer);
      throw new Error("Provider unavailable");
    },
  }, 10), /answer is saved/);
  assert.equal((await repository.get("alice", submission.submissionId))?.status, "failed");
  const result = await submitPracticeAttempt("alice", question, submission, repository, new DemoPracticeEvaluator(), 10);
  assert.equal(result.id, submission.submissionId);
  const history = await repository.list("alice");
  assert.equal(history.records.length, 1);
  assert.equal(history.records[0].id, submission.submissionId);
});

test("idempotency prevents duplicate calls and replacement of evidence", async () => {
  const repository = new MemoryAttemptRepository();
  const submission = input();
  let calls = 0;
  const demo = new DemoPracticeEvaluator();
  const evaluator = { mode: "demo" as const, model: "test", evaluate: async (...args: Parameters<typeof demo.evaluate>) => { calls++; return demo.evaluate(...args); } };
  const first = await submitPracticeAttempt("alice", question, submission, repository, evaluator, 10);
  const second = await submitPracticeAttempt("alice", question, submission, repository, evaluator, 10);
  assert.equal(first.id, second.id); assert.equal(calls, 1);
  await assert.rejects(submitPracticeAttempt("alice", question, { ...submission, answer: `${submission.answer} Changed.` }, repository, evaluator, 10), /different answer/);
});

test("owner and question boundaries prevent cross-account retry references", async () => {
  const repository = new MemoryAttemptRepository();
  const submission = input();
  await submitPracticeAttempt("alice", question, submission, repository, new DemoPracticeEvaluator(), 10);
  assert.equal(await repository.get("bob", submission.submissionId), null);
  assert.equal((await repository.list("bob")).records.length, 0);
  await assert.rejects(submitPracticeAttempt("bob", question, { ...input(), previousAttemptId: submission.submissionId }, repository, new DemoPracticeEvaluator(), 10), /account/);
  await assert.rejects(submitPracticeAttempt("alice", starterQuestions[1], { ...input(), previousAttemptId: submission.submissionId }, repository, new DemoPracticeEvaluator(), 10), /question/);
});

test("concurrent claims and daily budget are atomic; stale leases cannot replace results", async () => {
  const repository = new MemoryAttemptRepository();
  const submission = input();
  await repository.create("alice", { id: submission.submissionId, questionId: question.id, answer: submission.answer, status: "pending", submittedAt: new Date().toISOString() });
  const claims = await Promise.all([repository.claim("alice", submission.submissionId, 1), repository.claim("alice", submission.submissionId, 1)]);
  assert.equal(claims.filter((claim) => claim.kind === "claimed").length, 1);
  assert.equal(claims.filter((claim) => claim.kind === "busy").length, 1);
  await assert.rejects(repository.finish("alice", submission.submissionId, "wrong-lease", { evaluation: await new DemoPracticeEvaluator().evaluate(question, submission.answer), provenance: { mode: "demo", model: "demo", promptVersion: "1", rubricVersion: "1" } }), /lease/);
  const claimed = claims.find((claim) => claim.kind === "claimed")!;
  if (claimed.kind === "claimed") await repository.fail("alice", submission.submissionId, claimed.leaseId);
  assert.deepEqual(await repository.claim("alice", submission.submissionId, 1), { kind: "limited" });
});

test("history pagination uses timestamp plus ID and never skips tied timestamps", async () => {
  const repository = new MemoryAttemptRepository();
  for (let index = 0; index < 55; index++) await repository.create("alice", { id: randomUUID(), questionId: question.id, answer: input().answer, status: "pending", submittedAt: "2026-01-01T00:00:00.000Z" });
  const first = await repository.list("alice");
  const second = await repository.list("alice", first.cursor!);
  assert.equal(first.records.length, 50); assert.equal(second.records.length, 5);
  assert.equal(new Set([...first.records, ...second.records].map((record) => record.id)).size, 55);
  assert.equal(second.cursor, null);
});

test("demo session signatures reject tampering and missing sessions", async () => {
  const session = newDemoSession();
  const request = (value: string) => new Request("http://localhost", { headers: { Cookie: `echo-practice-demo=${value}` } });
  assert.match(readDemoOwner(request(session))!, /^demo:/);
  assert.equal(readDemoOwner(request(`${session.slice(0, -1)}${session.endsWith("0") ? "1" : "0"}`)), null);
  assert.equal(readDemoOwner(new Request("http://localhost")), null);
  const mock = process.env.USE_MOCK;
  process.env.USE_MOCK = "true";
  try { await assert.rejects(requirePracticeOwner(new Request("http://localhost")), /Initialize/); }
  finally { if (mock === undefined) delete process.env.USE_MOCK; else process.env.USE_MOCK = mock; }
});

test("firestoreClient enables ignoreUndefinedProperties without making database calls", () => {
  const previousProject = process.env.GOOGLE_CLOUD_PROJECT;
  process.env.GOOGLE_CLOUD_PROJECT = "unit-test-no-database";
  try {
    const client = firestoreClient() as unknown as { _settings?: { ignoreUndefinedProperties?: boolean } };
    assert.equal(client._settings?.ignoreUndefinedProperties, true);
  } finally {
    if (previousProject === undefined) delete process.env.GOOGLE_CLOUD_PROJECT;
    else process.env.GOOGLE_CLOUD_PROJECT = previousProject;
  }
});
