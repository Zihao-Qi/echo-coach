import assert from "node:assert/strict";
import test from "node:test";
import type { AttemptRecord } from "../../src/domain/interview/attempt-record";
import { validatePublicDemo } from "../../src/infrastructure/config/public-demo-runtime";
import { PublicDemoAdmission } from "../../src/infrastructure/http/public-demo-admission";
import { DemoCapacityError, MemoryAttemptRepository, MEMORY_EVALUATION_LEASE_MS, PUBLIC_DEMO_IDLE_MS } from "../../src/infrastructure/persistence/memory-attempt-repository";

const record = (id: string): AttemptRecord => ({
  id, questionId: "fictional", answer: "A made-up practice answer.", submittedAt: "2026-01-01T00:00:00.000Z", status: "pending",
});
const isCapacity = (scope: DemoCapacityError["scope"]) => (e: unknown) => e instanceof DemoCapacityError && e.scope === scope;

test("public demo requires matching build and runtime settings and no provider credentials", () => {
  const env = {
    ECHO_PUBLIC_DEMO: "true", NODE_ENV: "production", USE_MOCK: "true", PRACTICE_AUTH_MODE: "demo", PRACTICE_STORAGE: "memory",
    PRACTICE_TRANSCRIPTION_MODE: "disabled", ALLOW_LOCAL_GEMINI: "false", ALLOW_LOCAL_TRANSCRIPTION: "false", AUTH_URL: "https://demo.example",
  };
  assert.doesNotThrow(() => validatePublicDemo(env, true));
  assert.doesNotThrow(() => validatePublicDemo({}, false));
  assert.throws(() => validatePublicDemo(env, false));
  for (const name of Object.keys(env)) assert.throws(() => validatePublicDemo({ ...env, [name]: undefined }, true), name);
  for (const name of ["GEMINI_API_KEY", "GOOGLE_API_KEY", "GOOGLE_APPLICATION_CREDENTIALS", "AUTH_GOOGLE_ID", "AUTH_GOOGLE_SECRET", "AUTH_SECRET"]) {
    assert.throws(() => validatePublicDemo({ ...env, [name]: "synthetic-value" }, true), (e: unknown) => e instanceof Error && !e.message.includes("synthetic-value"));
  }
  assert.throws(() => validatePublicDemo({ ...env, AUTH_URL: "http://demo.example" }, true));
});

test("the rolling rate gate admits 120, never stores refusals and expires the oldest admissions first", () => {
  let now = 0;
  const gate = new PublicDemoAdmission(() => now);
  for (let i = 0; i < 60; i++) assert.equal(gate.retryAfterSeconds(), null);
  now = 20_000;
  for (let i = 0; i < 60; i++) assert.equal(gate.retryAfterSeconds(), null);
  assert.equal(gate.retryAfterSeconds(), 40);
  now = 59_999;
  for (let i = 0; i < 250; i++) assert.equal(gate.retryAfterSeconds(), 1);
  now = 60_000;
  for (let i = 0; i < 60; i++) assert.equal(gate.retryAfterSeconds(), null);
  assert.equal(gate.retryAfterSeconds(), 20);
});

test("demo reads do not allocate slots or keep expired sessions alive", async () => {
  let now = 0;
  const repo = new MemoryAttemptRepository(true, () => now);
  for (let i = 0; i < 300; i++) {
    const owner = `reader-${i}`;
    assert.equal(await repo.get(owner, "0"), null);
    assert.deepEqual(await repo.list(owner), { records: [], cursor: null });
  }
  for (let i = 0; i < 256; i++) await repo.create(`writer-${i}`, record("0"));
  await assert.rejects(repo.create("extra", record("0")), isCapacity("shared"));
  now = PUBLIC_DEMO_IDLE_MS - 1;
  assert.equal((await repo.list("writer-0")).records.length, 1);
  await repo.create("writer-1", record("1"));
  now++;
  assert.equal(await repo.get("writer-0", "0"), null);
  assert.equal((await repo.list("writer-1")).records.length, 2);
  await repo.create("extra", record("0"));
  assert.equal(await repo.get("writer-1", "not-mine"), null);
});

test("attempt limits leave active sessions intact and expired storage and counters are reusable", async () => {
  let now = 0;
  const repo = new MemoryAttemptRepository(true, () => now);
  for (let owner = 0; owner < 10; owner++) {
    for (let i = 0; i < 100; i++) await repo.create(String(owner), record(String(i)));
  }
  await assert.rejects(repo.create("0", record("extra")), isCapacity("visitor"));
  await assert.rejects(repo.create("new", record("extra")), isCapacity("shared"));
  assert.equal((await repo.claim("0", "0", 1)).kind, "claimed");
  assert.equal((await repo.claim("0", "0", 1)).kind, "busy");
  now = MEMORY_EVALUATION_LEASE_MS;
  assert.equal((await repo.claim("0", "0", 1)).kind, "limited");
  assert.equal((await repo.list("0")).records.length, 50);
  now = PUBLIC_DEMO_IDLE_MS;
  await repo.create("0", record("fresh"));
  assert.equal((await repo.claim("0", "fresh", 1)).kind, "claimed");
  await repo.create("new", record("fresh"));
  assert.equal(await repo.get("0", "0"), null);
});
