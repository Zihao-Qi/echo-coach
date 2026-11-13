import { test } from "node:test";
import assert from "node:assert/strict";
import { proxy } from "../../src/proxy";

test("production legacy real APIs fail closed, but mock presentation remains available", () => {
  const before = { NODE_ENV: process.env.NODE_ENV, USE_MOCK: process.env.USE_MOCK, NEXT_PUBLIC_USE_MOCK: process.env.NEXT_PUBLIC_USE_MOCK, ALLOW_LOCAL_GEMINI: process.env.ALLOW_LOCAL_GEMINI };
  try {
    Object.assign(process.env, { NODE_ENV: "production", USE_MOCK: "false" });
    delete process.env.NEXT_PUBLIC_USE_MOCK;
    delete process.env.ALLOW_LOCAL_GEMINI;
    assert.equal(proxy().status, 410);
    process.env.USE_MOCK = "true";
    assert.equal(proxy().status, 200);
    delete process.env.USE_MOCK;
    assert.equal(proxy().status, 410);
    Object.assign(process.env, { NODE_ENV: "development", USE_MOCK: "false" });
    assert.equal(proxy().status, 200);
    process.env.ALLOW_LOCAL_GEMINI = "true";
    assert.equal(proxy().status, 410); // Old voice/image flows cannot bypass the local call cap.
    process.env.USE_MOCK = "true";
    assert.equal(proxy().status, 200);
  } finally {
    for (const [key, value] of Object.entries(before)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
});
