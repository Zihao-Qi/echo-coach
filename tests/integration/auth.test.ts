import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { encode } from "next-auth/jwt";
import { randomUUID } from "node:crypto";
import { encodeCanonicalWav } from "../../src/domain/audio/canonical-wav";

// Real Next.js request context + Auth.js validation, with synthetic cookies only.
// Never calls Google OAuth, Gemini, or Firestore. Build before running this test.
for (const [mockMode, localOptIn] of [["false", "false"], ["true", "false"], ["false", "true"]]) {
test(`Google-authenticated HTTP access with USE_MOCK=${mockMode}, ALLOW_LOCAL_GEMINI=${localOptIn}`, { timeout: 45000 }, async () => {
  const listener = createServer();
  listener.listen(0, "127.0.0.1");
  await once(listener, "listening");
  const address = listener.address();
  assert.ok(address && typeof address !== "string");
  const port = address.port;
  await new Promise<void>((resolve) => listener.close(() => resolve()));
  const origin = `http://localhost:${port}`;
  const url = `http://127.0.0.1:${port}`;
  const secret = "synthetic-integration-session-key-".repeat(3);
  const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)], {
    env: {
      ...process.env, NODE_ENV: "production", USE_MOCK: mockMode, ALLOW_LOCAL_GEMINI: localOptIn, PRACTICE_AUTH_MODE: "google", PRACTICE_STORAGE: "memory", NEXT_PUBLIC_USE_MOCK: "false", AUTH_URL: origin, AUTH_SECRET: secret,
      AUTH_GOOGLE_ID: "synthetic-client", AUTH_GOOGLE_SECRET: "synthetic-secret", PRACTICE_ALLOWED_EMAILS: "owner@example.com",
      GOOGLE_CLOUD_PROJECT: "", GEMINI_API_KEY: "", GEMINI_EVALUATION_MODEL: "",
      PRACTICE_TRANSCRIPTION_MODE: localOptIn === "true" ? "gemini" : "demo", ALLOW_LOCAL_TRANSCRIPTION: localOptIn,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let log = "";
  for (const stream of [server.stdout, server.stderr]) stream?.on("data", (chunk) => { log = (log + chunk.toString()).slice(-3000); });
  try {
    let ready = false;
    for (let index = 0; index < 100; index++) {
      if (server.exitCode !== null) throw new Error(`Integration server exited: ${log}`);
      try { const response = await fetch(`${url}/api/practice/access`); if (response.status === 200) { ready = true; break; } } catch {}
      await delay(100);
    }
    assert.ok(ready, `Integration server did not become ready: ${log}`);
    const absent = await fetch(`${url}/api/practice/access`);
    assert.equal((await absent.json()).user, null);
    const bearerOnly = await fetch(`${url}/api/practice/access`, { headers: { Authorization: "Bearer untrusted" } });
    assert.equal((await bearerOnly.json()).user, null);
    async function cookie(email = "owner@example.com", signingSecret = secret, maxAge = 3600) {
      const encrypted = await encode({ token: { sub: "google-subject", googleSubject: "google-subject", email, emailVerified: true, provider: "google" }, secret: signingSecret, salt: "authjs.session-token", maxAge });
      return `authjs.session-token=${encrypted}`;
    }
    const validCookie = await cookie();
    const valid = await fetch(`${url}/api/practice/access`, { headers: { Cookie: validCookie } });
    assert.equal(valid.status, 200);
    assert.equal((await valid.json()).user.id, "google:google-subject");
    const denied = await fetch(`${url}/api/practice/access`, { headers: { Cookie: await cookie("stranger@example.com") } });
    assert.equal(denied.status, 403);
    for (const invalid of [await cookie("owner@example.com", "wrong-secret".repeat(5)), await cookie("owner@example.com", secret, -120)]) {
      const response = await fetch(`${url}/api/practice/access`, { headers: { Cookie: invalid } });
      assert.equal((await response.json()).user, null);
    }
    const headers = { Cookie: validCookie, "Content-Type": "application/json" };
    const blocked = await fetch(`${url}/api/practice/evaluate`, { method: "POST", headers: { ...headers, Origin: "https://attacker.example" }, body: "{}" });
    assert.equal(blocked.status, 403);
    const missingOrigin = await fetch(`${url}/api/practice/evaluate`, { method: "POST", headers, body: "{}" });
    assert.equal(missingOrigin.status, 403);
    const unsigned = await fetch(`${url}/api/practice/evaluate`, { method: "POST", headers: { "Content-Type": "application/json", Origin: origin }, body: "{}" });
    assert.equal(unsigned.status, 401);
    // Valid identity/origin reaches input validation, without making a storage/model call.
    const malformed = await fetch(`${url}/api/practice/evaluate`, { method: "POST", headers: { ...headers, Origin: origin }, body: "{" });
    assert.equal(malformed.status, 400);
    const submission = { submissionId: randomUUID(), questionId: "behavioral-project", answer: "I built a class project and wrote integration tests for the API." };
    const evaluated = await fetch(`${url}/api/practice/evaluate`, { method: "POST", headers: { ...headers, Origin: origin }, body: JSON.stringify(submission) });
    if (mockMode === "true") {
      assert.equal(evaluated.status, 200);
      const result = await evaluated.json();
      assert.equal(result.attempt.provenance.mode, "demo");
      const history = await fetch(`${url}/api/practice/attempts`, { headers: { Cookie: validCookie } });
      assert.equal((await history.json()).records[0].id, submission.submissionId);
    } else if (localOptIn === "true") {
      assert.equal(evaluated.status, 403);
      assert.match((await evaluated.json()).error, /local development/);
    } else {
      assert.equal(evaluated.status, 503); // Paid generation cannot use memory-only storage.
      assert.match((await evaluated.json()).error, /requires Google sign-in and durable Firestore storage/);
    }
    const audioHeaders = { Cookie: validCookie, Origin: origin, "Content-Type": "audio/wav", "Idempotency-Key": randomUUID(), "X-Transcription-Intent": "start" };
    const wav = encodeCanonicalWav(Float32Array.of(0.25, -0.25));
    const badAudioOrigin = await fetch(`${url}/api/practice/transcriptions`, { method: "POST", headers: { ...audioHeaders, Origin: "https://attacker.example" }, body: new Uint8Array(wav) });
    assert.equal(badAudioOrigin.status, 403);
    const transcript = await fetch(`${url}/api/practice/transcriptions`, { method: "POST", headers: audioHeaders, body: new Uint8Array(wav) });
    if (localOptIn === "true") {
      assert.equal(transcript.status, 503); // No flag can enable hosted real transcription.
      assert.equal((await transcript.json()).code, "disabled");
    } else {
      assert.equal(transcript.status, 200); // Demo transcription is independent of real evaluation.
      assert.equal((await transcript.json()).transcription.mode, "demo");
    }
    const legacy = await fetch(`${url}/api/session`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    assert.equal(legacy.status, 410);
  } finally {
    server.kill("SIGTERM");
    await Promise.race([once(server, "exit"), delay(5000, undefined, { ref: false })]);
    if (server.exitCode === null) server.kill("SIGKILL");
  }
});
}
