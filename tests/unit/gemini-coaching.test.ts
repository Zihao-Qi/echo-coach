import { test } from "node:test";
import assert from "node:assert/strict";
import { GenerateContentResponse } from "@google/genai";
import { GeminiPracticeEvaluator, MAX_EVALUATION_OUTPUT_TOKENS } from "../../src/infrastructure/ai/gemini/practice-evaluator";
import { DemoPracticeEvaluator } from "../../src/infrastructure/ai/demo/practice-evaluator";
import { starterQuestions } from "../../src/content/questions/starter-bank";
import { evaluateAttempt } from "../../src/application/workflows/evaluate-attempt";
import { LocalGeminiBudget, requireLocalGeminiRequest } from "../../src/infrastructure/ai/gemini/local-evaluation";

const question = starterQuestions[2];
const answer = "Hash maps have expected constant-time lookup, but sorted arrays preserve ordering.";
function response(text: string, finishReason = "STOP") {
  return Object.assign(new GenerateContentResponse(), { candidates: [{ content: { parts: [{ text }] }, finishReason }], usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 200, thoughtsTokenCount: 30, totalTokenCount: 330 } });
}

test("Gemini receives question, rubric, structured schema, and bounded output with usage provenance", async () => {
  const result = await new DemoPracticeEvaluator().evaluate(question, answer);
  const evaluator = new GeminiPracticeEvaluator("candidate-model", "unused-key", async (request) => {
    assert.equal(request.model, "candidate-model");
    const input = JSON.parse(request.contents as string);
    assert.equal(input.question.prompt, question.prompt);
    assert.deepEqual(input.question.rubric, question.rubric);
    assert.equal(input.candidateAnswer, answer);
    assert.equal(input.previousAnswer, null);
    assert.equal(request.config?.maxOutputTokens, MAX_EVALUATION_OUTPUT_TOKENS);
    assert.equal(request.config?.thinkingConfig?.thinkingLevel, "LOW");
    assert.ok(request.config?.responseJsonSchema);
    assert.match(request.config?.systemInstruction as string, /untrusted data/);
    return response(JSON.stringify(result));
  });
  const attempt = await evaluateAttempt(question, { questionId: question.id, answer }, evaluator);
  assert.equal(attempt.answer, answer);
  assert.equal(attempt.provenance.thinkingLevel, "low");
  assert.equal(attempt.provenance.usage?.thinkingTokens, 30);
  assert.ok(attempt.evaluation.criteria);
});

test("Gemini retry input includes only the server-resolved earlier answer", async () => {
  const fixture = await new DemoPracticeEvaluator().evaluate(question, answer);
  const previous = { id: "server-owned-id", questionId: question.id, answer: "An earlier answer with incorrect complexity." };
  const evaluator = new GeminiPracticeEvaluator("test", "unused", async (request) => {
    const input = JSON.parse(request.contents as string);
    assert.deepEqual(input.previousAnswer, { answer: previous.answer });
    assert.match(request.config?.systemInstruction as string, /Do not compare model answers or assume a retry improved/);
    return response(JSON.stringify(fixture));
  });
  await evaluator.evaluate(question, answer, previous);
});

test("malformed, truncated, and invented-quotation responses are rejected without fallback coaching", async () => {
  for (const invalid of [response("not JSON"), response("{}"), response("{}", "MAX_TOKENS")]) {
    const evaluator = new GeminiPracticeEvaluator("test", "unused", async () => invalid);
    await assert.rejects(evaluateAttempt(question, { questionId: question.id, answer }, evaluator));
  }
  const fixture = await new DemoPracticeEvaluator().evaluate(question, answer);
  fixture.criteria!.correctness.excerpt = "I am a world expert";
  const evaluator = new GeminiPracticeEvaluator("test", "unused", async () => response(JSON.stringify(fixture)));
  await assert.rejects(evaluateAttempt(question, { questionId: question.id, answer }, evaluator), /not present/);
});

test("behavioral model rewrites cannot introduce unsupported personal outcomes", async () => {
  const behavioral = starterQuestions[0];
  const fixture = await new DemoPracticeEvaluator().evaluate(behavioral, answer);
  fixture.suggestedAnswer = "I delivered 99% test coverage and passed all required tests.";
  const evaluator = new GeminiPracticeEvaluator("test", "unused", async () => response(JSON.stringify(fixture)));
  const attempt = await evaluateAttempt(behavioral, { questionId: behavioral.id, answer }, evaluator);
  assert.equal(attempt.answer, answer);
  assert.equal(attempt.evaluation.criteria?.correctness.status, "not-assessable");
  assert.doesNotMatch(attempt.evaluation.suggestedAnswer, /99%|passed all required/);
  assert.match(attempt.evaluation.suggestedAnswer, /No automatic personal-story rewrite/);
});

function localEnv(action: () => void) {
  const old = { NODE_ENV: process.env.NODE_ENV, ALLOW_LOCAL_GEMINI: process.env.ALLOW_LOCAL_GEMINI, AUTH_URL: process.env.AUTH_URL };
  Object.assign(process.env, { NODE_ENV: "development", ALLOW_LOCAL_GEMINI: "true", AUTH_URL: "http://localhost:3000" });
  try { action(); } finally { for (const [key, value] of Object.entries(old)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } }
}
test("local paid-mode opt-in cannot work in production or cross-origin/non-loopback requests", () => localEnv(() => {
  const request = (url = "http://localhost:3000/api/practice/evaluate", origin = "http://localhost:3000", host = "localhost:3000") => new Request(url, { headers: { Origin: origin, Host: host } });
  assert.doesNotThrow(() => requireLocalGeminiRequest(request()));
  assert.throws(() => requireLocalGeminiRequest(request(undefined, "https://attacker.example")), /loopback/);
  assert.throws(() => requireLocalGeminiRequest(request(undefined, undefined, "attacker.example")), /loopback/);
  assert.throws(() => requireLocalGeminiRequest(request("https://public.example/api/practice/evaluate")), /loopback/);
  Object.assign(process.env, { NODE_ENV: "production" });
  assert.throws(() => requireLocalGeminiRequest(request()), /local development/);
  Object.assign(process.env, { NODE_ENV: "development" }); delete process.env.ALLOW_LOCAL_GEMINI;
  assert.throws(() => requireLocalGeminiRequest(request()), /explicit local/);
}));

test("local request budget bounds calls across sessions, including failed calls", async () => {
  let time = 0, calls = 0;
  const budget = new LocalGeminiBudget(() => time);
  for (let index = 0; index < 10; index++) {
    time += 3001;
    if (index === 0) await assert.rejects(budget.run(async () => { calls++; throw new Error("provider failure"); }));
    else await budget.run(async () => { calls++; });
  }
  time += 3001;
  await assert.rejects(budget.run(async () => { calls++; }), /limit reached/);
  assert.equal(calls, 10);
});

test("local evaluation prevents concurrent provider calls and too-fast retries", async () => {
  let finish!: () => void;
  const budget = new LocalGeminiBudget(() => 10000);
  const running = budget.run(() => new Promise<void>((resolve) => { finish = resolve; }));
  await assert.rejects(budget.run(async () => {}), /active/);
  finish(); await running;
  await assert.rejects(budget.run(async () => {}), /just started/);
});
