import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { encode } from "next-auth/jwt";
import { handlers } from "../../src/auth";

// Exercise the actual Auth.js session handler, not a mocked token verifier.
// No Google OAuth network calls or credentials are involved.
test("Auth.js validates encrypted cookies and rejects expired or wrongly encrypted sessions", async () => {
  const values = { AUTH_URL: "http://localhost:3000", AUTH_SECRET: "test-session-key-".repeat(4), AUTH_GOOGLE_ID: "test-client", AUTH_GOOGLE_SECRET: "test-secret", PRACTICE_ALLOWED_EMAILS: "owner@example.com" };
  const before = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  Object.assign(process.env, values);
  try {
    const cookieName = "authjs.session-token";
    const token = { sub: "google-id", googleSubject: "google-id", email: "owner@example.com", emailVerified: true, provider: "google" };
    async function getSession(secret: string, maxAge = 3600) {
      const encrypted = await encode({ token, secret, salt: cookieName, maxAge });
      const response = await handlers.GET(new NextRequest("http://localhost:3000/api/auth/session", { headers: { Cookie: `${cookieName}=${encrypted}` } }));
      return response.json();
    }
    const valid = await getSession(values.AUTH_SECRET);
    assert.equal(valid.user.id, "google-id");
    assert.equal(valid.user.googleEmailVerified, true);
    assert.equal(valid.user.provider, "google");
    assert.equal(await getSession("wrong-key-".repeat(4)), null);
    assert.equal(await getSession(values.AUTH_SECRET, -120), null);
  } finally { for (const [key, value] of Object.entries(before)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } }
});
