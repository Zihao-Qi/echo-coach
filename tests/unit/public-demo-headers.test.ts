import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest, type NextResponse } from "next/server";
import { demoAudioPaths } from "../../src/content/questions/demo-audio";

// This file is the public build. The runner isolates test files, so the flag is
// fixed before proxy.ts reads it.
Object.assign(process.env, {
  NEXT_PUBLIC_ECHO_PUBLIC_DEMO: "true",
  ECHO_PUBLIC_DEMO: "true",
  NODE_ENV: "production",
  USE_MOCK: "true",
  PRACTICE_AUTH_MODE: "demo",
  PRACTICE_STORAGE: "memory",
  PRACTICE_TRANSCRIPTION_MODE: "disabled",
  ALLOW_LOCAL_GEMINI: "false",
  ALLOW_LOCAL_TRANSCRIPTION: "false",
  AUTH_URL: "https://demo.example",
});
for (const name of ["GEMINI_API_KEY", "GOOGLE_API_KEY", "GOOGLE_APPLICATION_CREDENTIALS", "AUTH_GOOGLE_ID", "AUTH_GOOGLE_SECRET", "AUTH_SECRET"]) {
  delete process.env[name];
}

const PERMISSIONS_POLICY = "microphone=(self), camera=(), geolocation=()";
const REFERRER_POLICY = "strict-origin-when-cross-origin";

function policyFor(nonce: string, https: boolean) {
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    `style-src 'self' 'nonce-${nonce}'`,
    "style-src-attr 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "media-src 'self' blob:",
    "worker-src 'self' blob:",
    "connect-src 'self' https://generativelanguage.googleapis.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "frame-src 'none'",
  ];
  if (https) directives.push("upgrade-insecure-requests");
  return directives.join("; ");
}

function nonceFrom(policy: string | null) {
  const match = policy?.match(/^default-src 'self'; script-src 'self' 'nonce-([^']+)' 'strict-dynamic'; style-src 'self' 'nonce-([^']+)'/);
  assert.ok(match, policy ?? "missing content-security-policy");
  assert.equal(match[1], match[2]);
  assert.match(match[1], /^[A-Za-z0-9+/_-]+={0,2}$/);
  return match[1];
}

function expectPage(response: NextResponse, https: boolean) {
  const policy = response.headers.get("content-security-policy");
  const nonce = nonceFrom(policy);
  assert.equal(policy, policyFor(nonce, https));
  assert.equal(response.headers.get("x-middleware-request-x-nonce"), nonce);
  assert.equal(response.headers.get("x-middleware-request-content-security-policy"), policy);
  assert.equal(response.headers.get("permissions-policy"), PERMISSIONS_POLICY);
  assert.equal(response.headers.get("referrer-policy"), REFERRER_POLICY);
  assert.equal(response.headers.get("x-nonce"), null);
  const scriptSrc = policy?.split("; ").find((directive) => directive.startsWith("script-src "));
  assert.ok(scriptSrc);
  assert.equal(scriptSrc.split(/\s+/).includes("'unsafe-inline'"), false);
  return nonce;
}

function expectNoSecurityHeaders(response: NextResponse) {
  assert.equal(response.headers.get("content-security-policy"), null);
  assert.equal(response.headers.get("permissions-policy"), null);
  assert.equal(response.headers.get("referrer-policy"), null);
  assert.equal(response.headers.get("x-middleware-request-x-nonce"), null);
  assert.equal(response.headers.get("x-middleware-request-content-security-policy"), null);
}

test("public pages get a fresh nonce and the stage 1 headers; other responses stay unchanged", async () => {
  const proxyModule = await import("../../src/proxy");
  assert.equal("config" in proxyModule, false);
  assert.equal("matcher" in proxyModule, false);
  const { proxy } = proxyModule;
  const pages = ["/", "/practice", "/practice/", "/mock-interview", "/mock-interview/"];
  const nonces = new Set<string>();
  for (const path of pages) {
    const first = proxy(new NextRequest(`http://127.0.0.1:3000${path}`));
    const second = proxy(new NextRequest(`http://127.0.0.1:3000${path}`));
    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    const nonce = expectPage(first, false);
    const again = expectPage(second, false);
    assert.notEqual(nonce, again);
    nonces.add(nonce);
    nonces.add(again);
  }
  assert.equal(nonces.size, pages.length * 2);

  const queried = proxy(new NextRequest("http://127.0.0.1:3000/practice?track=swe"));
  expectPage(queried, false);
  const https = proxy(new NextRequest("https://demo.example/"));
  expectPage(https, true);
  const forwarded = proxy(new NextRequest("http://127.0.0.1:8080/mock-interview", { headers: { "x-forwarded-proto": "https" } }));
  expectPage(forwarded, true);
  const plain = proxy(new NextRequest("http://127.0.0.1:8080/practice", { headers: { "x-forwarded-proto": "http" } }));
  expectPage(plain, false);
  expectPage(proxy(new NextRequest("http://127.0.0.1:8080/", { headers: { "x-forwarded-proto": "HTTPS" } })), true);
  expectPage(proxy(new NextRequest("http://127.0.0.1:8080/", { headers: { "x-forwarded-proto": "https, http" } })), true);
  expectPage(proxy(new NextRequest("http://127.0.0.1:8080/practice", { headers: { "x-forwarded-proto": "http, https" } })), false);

  const audio = demoAudioPaths.values().next().value;
  assert.ok(audio);
  for (const path of ["/api/practice/access", "/favicon.ico", "/_next/static/chunks/main.js", audio]) {
    const response = proxy(new NextRequest(`http://127.0.0.1:3000${path}`));
    assert.equal(response.status, 200, path);
    expectNoSecurityHeaders(response);
  }

  const prefetch = { "next-router-prefetch": "1", purpose: "prefetch" };
  const prefetchedApi = proxy(new NextRequest("http://127.0.0.1:3000/api/practice/access", { headers: prefetch }));
  assert.equal(prefetchedApi.status, 200);
  expectNoSecurityHeaders(prefetchedApi);
  const prefetchedPage = proxy(new NextRequest("http://127.0.0.1:3000/legacy", { headers: prefetch }));
  assert.equal(prefetchedPage.status, 404);
  expectNoSecurityHeaders(prefetchedPage);

  const missing = proxy(new NextRequest("http://127.0.0.1:3000/legacy"));
  assert.equal(missing.status, 404);
  assert.equal(missing.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(await missing.json(), { error: "This page is not available in the public demo." });
  expectNoSecurityHeaders(missing);

  delete process.env.ECHO_PUBLIC_DEMO;
  const unavailable = proxy(new NextRequest("http://127.0.0.1:3000/"));
  process.env.ECHO_PUBLIC_DEMO = "true";
  assert.equal(unavailable.status, 503);
  assert.equal(unavailable.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(await unavailable.json(), { error: "Public demo unavailable." });
  expectNoSecurityHeaders(unavailable);

  let limited: NextResponse | undefined;
  for (let i = 0; i < 200; i++) {
    limited = proxy(new NextRequest("http://127.0.0.1:3000/api/practice/attempts"));
    if (limited.status === 429) break;
    assert.equal(limited.status, 200);
    expectNoSecurityHeaders(limited);
  }
  assert.equal(limited?.status, 429);
  assert.ok(Number(limited?.headers.get("retry-after")) > 0);
  assert.deepEqual(await limited!.json(), { error: "The demo is busy. Wait a moment and try again; your draft is still here." });
  expectNoSecurityHeaders(limited!);
  const prefetchedLimit = proxy(new NextRequest("http://127.0.0.1:3000/api/practice/attempts", { headers: { "next-router-prefetch": "1", purpose: "prefetch" } }));
  assert.equal(prefetchedLimit.status, 429);
  expectNoSecurityHeaders(prefetchedLimit);
});
