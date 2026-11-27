import { NextResponse, type NextRequest } from "next/server";
import { isPublicDemoPage, isPublicDemoPathAllowed, isPublicPracticeApi } from "./infrastructure/http/public-demo-paths";
import { PUBLIC_DEMO_BUILD } from "./infrastructure/config/public-demo";
import { publicDemoRequested, validatePublicDemo } from "./infrastructure/config/public-demo-runtime";
import { PublicDemoAdmission } from "./infrastructure/http/public-demo-admission";

// Kept in the proxy runtime only: no sharing state with React or route handlers.
const admission = new PublicDemoAdmission();

const PERMISSIONS_POLICY = "microphone=(self), camera=(), geolocation=()";
const REFERRER_POLICY = "strict-origin-when-cross-origin";

function requestArrivedOverHttps(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
  return forwarded === "https" || request.nextUrl.protocol === "https:";
}

function contentSecurityPolicy(nonce: string, https: boolean) {
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

// No script-src fallback: a page without its request cannot get a nonce.
function securePublicPage(request: NextRequest | undefined) {
  if (!request) throw new Error("A public demo page needs the request so its nonce can be applied.");
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const policy = contentSecurityPolicy(nonce, requestArrivedOverHttps(request));
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", policy);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", policy);
  response.headers.set("Permissions-Policy", PERMISSIONS_POLICY);
  response.headers.set("Referrer-Policy", REFERRER_POLICY);
  return response;
}

function publicDemoProxy(request: NextRequest | undefined, path: string) {
  const headers = { "Cache-Control": "private, no-store", Vary: "Cookie, Authorization" };
  try { validatePublicDemo(); }
  catch { return NextResponse.json({ error: "Public demo unavailable." }, { status: 503, headers }); }
  if (!isPublicDemoPathAllowed(path)) return NextResponse.json({ error: "This page is not available in the public demo." }, { status: 404, headers });
  if (isPublicPracticeApi(path)) {
    const retry = admission.retryAfterSeconds();
    if (retry !== null) {
      console.info("Public demo refused a request at the rate limit.");
      return NextResponse.json({ error: "The demo is busy. Wait a moment and try again; your draft is still here." }, {
        status: 429, headers: { ...headers, "Retry-After": String(retry) },
      });
    }
  }
  if (isPublicDemoPage(path)) return securePublicPage(request);
  return NextResponse.next();
}

// The legacy API has no owner-scoped persistence. Keep its mock presentation flow,
// but prevent accidentally exposing real history or paid generation in production.
export function proxy(request?: NextRequest) {
  const path = request?.nextUrl.pathname ?? "/api/session";
  // No matcher: skipping /api or prefetch here would bypass the allowlist and the rate limiter.
  if (PUBLIC_DEMO_BUILD || publicDemoRequested()) return publicDemoProxy(request, path);
  if (path !== "/api/history" && path !== "/api/session" && !path.startsWith("/api/session/")) return NextResponse.next();
  const configured = process.env.NEXT_PUBLIC_USE_MOCK ?? process.env.USE_MOCK;
  const legacyMock = configured === "true" || (configured !== "false" && process.env.NODE_ENV !== "production");
  // The bounded local evaluator must not accidentally activate uncapped legacy
  // audio/image calls through the original-demo link or a direct API request.
  const boundedLocalEvaluation = process.env.ALLOW_LOCAL_GEMINI === "true";
  const transcriptionMode = process.env.PRACTICE_TRANSCRIPTION_MODE;
  const transcriptionOptIn = process.env.ALLOW_LOCAL_TRANSCRIPTION;
  // Invalid selections also fail closed instead of reopening uncapped legacy calls.
  const transcriptionSelected = (transcriptionMode !== undefined && transcriptionMode !== "demo") ||
    (transcriptionOptIn !== undefined && transcriptionOptIn !== "false");
  if ((process.env.NODE_ENV === "production" || boundedLocalEvaluation || transcriptionSelected) && !legacyMock) return NextResponse.json({ error: "Legacy real-mode APIs are disabled for hosted and bounded local practice. Use /practice instead." }, { status: 410 });
  return NextResponse.next();
}
