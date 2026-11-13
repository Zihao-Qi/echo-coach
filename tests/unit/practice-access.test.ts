import { test } from "node:test";
import assert from "node:assert/strict";
import type { Session } from "next-auth";
import { GET as getPracticeAccess } from "../../src/app/api/practice/access/route";
import { requirePracticeOwner, requirePracticeWriteOrigin } from "../../src/infrastructure/auth/practice-access";
import { approvedGoogleProfile, authConfigurationError } from "../../src/infrastructure/auth/google-policy";

async function withRealConfig(action: () => Promise<void>) {
  const values = { USE_MOCK: "false", PRACTICE_AUTH_MODE: "google", PRACTICE_STORAGE: "firestore", GOOGLE_CLOUD_PROJECT: "test-project", AUTH_GOOGLE_ID: "test-id", AUTH_GOOGLE_SECRET: "test-secret", AUTH_SECRET: "a".repeat(64), AUTH_URL: "http://localhost:3000", PRACTICE_ALLOWED_EMAILS: "owner@example.com" };
  const before = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  Object.assign(process.env, values);
  try { await action(); }
  finally { for (const [key, value] of Object.entries(before)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } }
}
const session = (email = "owner@example.com"): Session => ({ user: { id: "google-id", email, googleEmailVerified: true, provider: "google" }, expires: new Date(Date.now() + 3600000).toISOString() });

test("verified Google sessions receive stable owner IDs and allowlist checks on every request", async () => withRealConfig(async () => {
  const request = new Request("http://localhost");
  assert.equal(await requirePracticeOwner(request, async () => session()), "google:google-id");
  await assert.rejects(requirePracticeOwner(request, async () => session("other@example.com")), (error: unknown) => error instanceof Error && "status" in error && error.status === 403);
  process.env.PRACTICE_ALLOWED_EMAILS = "different@example.com";
  await assert.rejects(requirePracticeOwner(request, async () => session()), /not available/);
}));

test("missing, unverified, and wrong-provider sessions fail closed", async () => withRealConfig(async () => {
  const request = new Request("http://localhost", { headers: { Authorization: "Bearer not-a-session" } });
  await assert.rejects(requirePracticeOwner(request, async () => null), /Sign in/);
  const unverified = session(); unverified.user.googleEmailVerified = false;
  await assert.rejects(requirePracticeOwner(request, async () => unverified), /verified Google/);
  const wrongProvider = session(); wrongProvider.user.provider = undefined;
  await assert.rejects(requirePracticeOwner(request, async () => wrongProvider), /verified Google/);
}));

test("OAuth sign-in only allows verified, allowlisted Google profiles", async () => withRealConfig(async () => {
  const profile = { sub: "google-id", email: "OWNER@example.com", email_verified: true };
  assert.ok(approvedGoogleProfile("google", profile));
  assert.equal(approvedGoogleProfile("other", profile), null);
  assert.equal(approvedGoogleProfile("google", { ...profile, email_verified: false }), null);
  assert.equal(approvedGoogleProfile("google", { ...profile, sub: "" }), null);
  assert.equal(approvedGoogleProfile("google", { ...profile, email: "stranger@example.com" }), null);
}));

test("real cookie-authenticated writes require the canonical Origin", async () => withRealConfig(async () => {
  const request = (origin?: string, fetchSite?: string) => new Request("http://localhost:3000/api/practice/evaluate", { method: "POST", headers: { ...(origin ? { Origin: origin } : {}), ...(fetchSite ? { "Sec-Fetch-Site": fetchSite } : {}) } });
  assert.doesNotThrow(() => requirePracticeWriteOrigin(request("http://localhost:3000", "same-origin")));
  assert.throws(() => requirePracticeWriteOrigin(request()), /Cross-origin/);
  assert.throws(() => requirePracticeWriteOrigin(request("https://attacker.example")), /Cross-origin/);
  assert.throws(() => requirePracticeWriteOrigin(request("http://localhost:3000", "cross-site")), /Cross-origin/);
}));

test("missing auth configuration fails closed before reading a session", async () => withRealConfig(async () => {
  let read = false;
  delete process.env.PRACTICE_ALLOWED_EMAILS;
  await assert.rejects(requirePracticeOwner(new Request("http://localhost"), async () => { read = true; return session(); }), /allowlist/);
  assert.equal(read, false);
}));

test("canonical auth configuration rejects unsafe origins and weak secrets", async () => withRealConfig(async () => {
  assert.equal(authConfigurationError(), null);
  process.env.AUTH_URL = "http://production.example";
  assert.match(authConfigurationError()!, /HTTPS/);
  process.env.AUTH_URL = "https://example.com/api/auth";
  assert.match(authConfigurationError()!, /canonical origin/);
  process.env.AUTH_URL = "https://example.com";
  process.env.AUTH_SECRET = "short";
  assert.match(authConfigurationError()!, /32 characters/);
}));

test("google auth with memory storage does not require GOOGLE_CLOUD_PROJECT, while firestore storage does before reading session", async () => withRealConfig(async () => {
  process.env.PRACTICE_STORAGE = "memory";
  delete process.env.GOOGLE_CLOUD_PROJECT;
  const request = new Request("http://localhost");
  assert.equal(await requirePracticeOwner(request, async () => session()), "google:google-id");
  await assert.rejects(requirePracticeOwner(request, async () => session("stranger@example.com")), (error: unknown) => error instanceof Error && "status" in error && error.status === 403);
  const unverified = session(); unverified.user.googleEmailVerified = false;
  await assert.rejects(requirePracticeOwner(request, async () => unverified), (error: unknown) => error instanceof Error && "status" in error && error.status === 401);

  process.env.PRACTICE_STORAGE = "firestore";
  let read = false;
  await assert.rejects(
    requirePracticeOwner(request, async () => { read = true; return session(); }),
    (error: unknown) => error instanceof Error && "status" in error && error.status === 503 && /GOOGLE_CLOUD_PROJECT/.test(error.message),
  );
  assert.equal(read, false);
}));

test("GET /api/practice/access returns sanitized 503 JSON on invalid config and keeps 200 in demo mode", async () => withRealConfig(async () => {
  process.env.PRACTICE_AUTH_MODE = "demo";
  process.env.PRACTICE_STORAGE = "memory";
  delete process.env.GOOGLE_CLOUD_PROJECT;
  const demo = await getPracticeAccess(new Request("http://localhost/api/practice/access"));
  assert.equal(demo.status, 200);
  const demoBody = await demo.json() as { mode: string; storage: string };
  assert.equal(demoBody.mode, "demo");
  assert.equal(demoBody.storage, "memory");

  for (const invalidEnv of [
    { PRACTICE_AUTH_MODE: "demo", PRACTICE_STORAGE: "firestore" },
    { PRACTICE_AUTH_MODE: "invalid", PRACTICE_STORAGE: "memory" },
    { PRACTICE_AUTH_MODE: "google", PRACTICE_STORAGE: "invalid" },
  ]) {
    process.env.PRACTICE_AUTH_MODE = invalidEnv.PRACTICE_AUTH_MODE;
    process.env.PRACTICE_STORAGE = invalidEnv.PRACTICE_STORAGE;
    const response = await getPracticeAccess(new Request("http://localhost/api/practice/access"));
    assert.equal(response.status, 503);
    const body = await response.json() as { error: string };
    assert.equal(body.error, "Practice storage is unavailable. Please keep your draft and try again.");
  }
}));
