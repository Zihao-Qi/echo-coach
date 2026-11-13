import { test } from "node:test";
import assert from "node:assert/strict";
import { starterQuestions } from "../../src/content/questions/starter-bank";
import { evaluateAttempt, submissionSchema, evaluationSchema } from "../../src/application/workflows/evaluate-attempt";
import { DemoPracticeEvaluator } from "../../src/infrastructure/ai/demo/practice-evaluator";
import { POST } from "../../src/app/api/practice/evaluate/route";
import { GET as initializeAccess } from "../../src/app/api/practice/access/route";
import { randomUUID } from "node:crypto";

const question = starterQuestions[0];
const answer = "I built a course project and implemented its API, then tested error handling.";

test("starter bank has unique IDs and coverage for all three tracks", () => {
  assert.equal(new Set(starterQuestions.map((q) => q.id)).size, starterQuestions.length);
  for (const track of ["behavioral", "swe", "ai-ml"]) assert.ok(starterQuestions.some((q) => q.track === track));
});

test("submissions reject short answers, extra fields, and invalid retry IDs", () => {
  assert.equal(submissionSchema.safeParse({ questionId: question.id, answer: "short" }).success, false);
  assert.equal(submissionSchema.safeParse({ questionId: question.id, answer, model: "untrusted" }).success, false);
  assert.equal(submissionSchema.safeParse({ questionId: question.id, answer, previousAttemptId: "bad" }).success, false);
});

test("retry keeps distinct attempts and unchanged submitted evidence", async () => {
  const evaluator = new DemoPracticeEvaluator();
  const first = await evaluateAttempt(question, { questionId: question.id, answer }, evaluator);
  const second = await evaluateAttempt(question, { questionId: question.id, answer: `${answer} I learned to validate inputs.`, previousAttemptId: first.id }, evaluator, first);
  assert.notEqual(first.id, second.id);
  assert.equal(second.previousAttemptId, first.id);
  assert.equal(first.answer, answer);
  assert.equal(first.provenance.mode, "demo");
  assert.equal(first.provenance.rubricVersion, question.rubric.version);
});

test("structured outputs and verbatim evidence are enforced", async () => {
  assert.equal(evaluationSchema.safeParse({ strengths: [] }).success, false);
  const base = await new DemoPracticeEvaluator().evaluate(question, answer);
  await assert.rejects(evaluateAttempt(question, { questionId: question.id, answer }, {
    mode: "gemini", model: "test", evaluate: async () => ({ ...base, strengths: [{ observation: "Invented", excerpt: "I increased revenue 90%" }] }),
  }), /not present/);
});

test("API validates unknown questions, malformed JSON, and actual body size", async () => {
  const session = await initializeAccess(new Request("http://localhost/api/practice/access"));
  const cookie = session.headers.get("set-cookie")!.split(";")[0];
  const call = (body: string) => POST(new Request("http://localhost/api/practice/evaluate", { method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie }, body }));
  const savedMock = process.env.USE_MOCK;
  process.env.USE_MOCK = "true";
  try {
    assert.equal((await call("{")).status, 400);
    assert.equal((await call(JSON.stringify({ questionId: "unknown", answer, submissionId: randomUUID() }))).status, 404);
    assert.equal((await call("x".repeat(50001))).status, 413);
    const response = await call(JSON.stringify({ questionId: question.id, answer, submissionId: randomUUID() }));
    assert.equal(response.status, 200);
    assert.equal((await response.json()).attempt.answer, answer);
    assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  } finally {
    if (savedMock === undefined) delete process.env.USE_MOCK; else process.env.USE_MOCK = savedMock;
  }
});
