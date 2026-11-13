import { test } from "node:test";
import assert from "node:assert/strict";
import { practiceAuthMode, practiceStorageMode, isMockEvaluationMode } from "../../src/infrastructure/config/practice-runtime";

function settings(values: Record<string, string | undefined>, action: () => void) {
  const keys = ["USE_MOCK", "PRACTICE_AUTH_MODE", "PRACTICE_STORAGE"];
  const before = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  try {
    for (const key of keys) { if (values[key] === undefined) delete process.env[key]; else process.env[key] = values[key]; }
    action();
  } finally { for (const key of keys) { if (before[key] === undefined) delete process.env[key]; else process.env[key] = before[key]; } }
}

test("Google sign-in can run with mock evaluation and memory-only history", () => settings({ USE_MOCK: "true", PRACTICE_AUTH_MODE: "google", PRACTICE_STORAGE: "memory" }, () => {
  assert.equal(practiceAuthMode(), "google"); assert.equal(practiceStorageMode(), "memory"); assert.equal(isMockEvaluationMode(), true);
}));

test("existing demo and real defaults remain explicit", () => {
  settings({ USE_MOCK: "true" }, () => { assert.equal(practiceAuthMode(), "demo"); assert.equal(practiceStorageMode(), "memory"); });
  settings({ USE_MOCK: "false" }, () => { assert.equal(practiceAuthMode(), "google"); assert.equal(practiceStorageMode(), "firestore"); });
});

test("invalid mode settings and unauthenticated durable storage fail closed", () => {
  settings({ PRACTICE_AUTH_MODE: "typo" }, () => assert.throws(practiceAuthMode, /demo or google/));
  settings({ PRACTICE_AUTH_MODE: "google", PRACTICE_STORAGE: "typo" }, () => assert.throws(practiceStorageMode, /memory or firestore/));
  settings({ PRACTICE_AUTH_MODE: "demo", PRACTICE_STORAGE: "firestore" }, () => assert.throws(practiceStorageMode, /requires Google/));
});
