import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { POST } from "../../src/app/api/practice/evaluate/route";
import { newDemoSession } from "../../src/infrastructure/auth/practice-access";
import { LocalGeminiBudget } from "../../src/infrastructure/ai/gemini/local-evaluation";
import { DemoPracticeEvaluator } from "../../src/infrastructure/ai/demo/practice-evaluator";
import { starterQuestions } from "../../src/content/questions/starter-bank";

test("local API counts actual provider attempts across demo cookies and preserves idempotency", async () => {
  const values = { NODE_ENV: "development", USE_MOCK: "false", PRACTICE_AUTH_MODE: "demo", PRACTICE_STORAGE: "memory", ALLOW_LOCAL_GEMINI: "true", AUTH_URL: "http://localhost:3000", GEMINI_API_KEY: "synthetic-key-never-sent", GEMINI_EVALUATION_MODEL: "synthetic-model" };
  const before = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  const oldFetch = globalThis.fetch;
  const oldBudget = globalThis.__echoLocalGeminiBudget;
  let now = 0, providerCalls = 0;
  Object.assign(process.env, values);
  globalThis.__echoLocalGeminiBudget = new LocalGeminiBudget(() => now);
  const answer = "I implemented the API for a class project and wrote integration tests.";
  const question = starterQuestions[0];
  const fixture = await new DemoPracticeEvaluator().evaluate(question, answer);
  // SDK's only network boundary is intercepted. These tests never contact Gemini.
  globalThis.fetch = async () => {
    providerCalls++;
    if (providerCalls === 1) return new Response(JSON.stringify({ error: { code: 429, message: "Synthetic quota failure", status: "RESOURCE_EXHAUSTED" } }), { status: 429, headers: { "Content-Type": "application/json" } });
    return new Response(JSON.stringify({ candidates: [{ content: { role: "model", parts: [{ text: JSON.stringify(fixture) }] }, finishReason: "STOP" }] }), { headers: { "Content-Type": "application/json" } });
  };
  const sessions = [newDemoSession(), newDemoSession()];
  const call = (submissionId: string, session: string, origin = "http://localhost:3000") => POST(new Request("http://localhost:3000/api/practice/evaluate", {
    method: "POST", headers: { Cookie: `echo-practice-demo=${session}`, Origin: origin, Host: "localhost:3000", "Content-Type": "application/json" },
    body: JSON.stringify({ submissionId, questionId: question.id, answer }),
  }));
  try {
    assert.equal((await call(randomUUID(), sessions[0], "https://attacker.example")).status, 403);
    assert.equal(providerCalls, 0);
    const firstId = randomUUID();
    assert.equal((await call(firstId, sessions[0])).status, 502);
    assert.equal(providerCalls, 1); // SDK did not automatically retry the 429.
    now += 3001;
    assert.equal((await call(firstId, sessions[0])).status, 200);
    assert.equal((await call(firstId, sessions[0])).status, 200);
    assert.equal(providerCalls, 2);
    for (let index = 2; index < 10; index++) {
      now += 3001;
      assert.equal((await call(randomUUID(), sessions[index % 2])).status, 200);
    }
    now += 3001;
    const blocked = await call(randomUUID(), sessions[1]);
    assert.equal(blocked.status, 429);
    assert.match((await blocked.json()).error, /answer is saved.*limit reached/);
    assert.equal(providerCalls, 10);
  } finally {
    globalThis.fetch = oldFetch;
    globalThis.__echoLocalGeminiBudget = oldBudget;
    for (const [key, value] of Object.entries(before)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
});
