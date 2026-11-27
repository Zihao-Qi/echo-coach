import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";

delete process.env.NEXT_PUBLIC_ECHO_PUBLIC_DEMO;
delete process.env.ECHO_PUBLIC_DEMO;

test("the default profile adds none of the public security headers", async () => {
  const { proxy } = await import("../../src/proxy");
  for (const path of ["/", "/practice", "/practice/", "/mock-interview", "/mock-interview/"]) {
    const response = proxy(new NextRequest(`http://127.0.0.1:3000${path}`));
    assert.equal(response.status, 200, path);
    assert.equal(response.headers.get("content-security-policy"), null);
    assert.equal(response.headers.get("permissions-policy"), null);
    assert.equal(response.headers.get("referrer-policy"), null);
    assert.equal(response.headers.get("x-middleware-request-x-nonce"), null);
    assert.equal(response.headers.get("x-middleware-request-content-security-policy"), null);
  }

  // A runtime demo flag without the public build is refused and still gets no new headers.
  process.env.ECHO_PUBLIC_DEMO = "true";
  const refused = proxy(new NextRequest("http://127.0.0.1:3000/practice"));
  delete process.env.ECHO_PUBLIC_DEMO;
  assert.equal(refused.status, 503);
  assert.equal(refused.headers.get("content-security-policy"), null);
  assert.equal(refused.headers.get("permissions-policy"), null);
  assert.equal(refused.headers.get("referrer-policy"), null);
});
