import { NextResponse, type NextRequest } from "next/server";
import { PUBLIC_DEMO_BUILD } from "./infrastructure/config/public-demo";
import { publicDemoRequested, validatePublicDemo } from "./infrastructure/config/public-demo-runtime";
import { PublicDemoAdmission } from "./infrastructure/http/public-demo-admission";

// Kept in the proxy runtime only: no sharing state with React or route handlers.
const admission = new PublicDemoAdmission();

function publicDemoProxy(path: string) {
  const headers = { "Cache-Control": "private, no-store", Vary: "Cookie, Authorization" };
  try { validatePublicDemo(); }
  catch { return NextResponse.json({ error: "Public demo unavailable." }, { status: 503, headers }); }
  const practiceApi = /^\/api\/practice\/(?:access|evaluate|attempts(?:\/[0-9a-fA-F-]+)?)$/.test(path);
  const allowed = practiceApi || path === "/" || path === "/practice" || path === "/practice/" ||
    path === "/favicon.ico" || path.startsWith("/_next/static/");
  if (!allowed) return NextResponse.json({ error: "This page is not available in the public demo." }, { status: 404, headers });
  if (practiceApi) {
    const retry = admission.retryAfterSeconds();
    if (retry !== null) {
      console.info("Public demo refused a request at the rate limit.");
      return NextResponse.json({ error: "The demo is busy. Wait a moment and try again; your draft is still here." }, {
        status: 429, headers: { ...headers, "Retry-After": String(retry) },
      });
    }
  }
  return NextResponse.next();
}

// The legacy API has no owner-scoped persistence. Keep its mock presentation flow,
// but prevent accidentally exposing real history or paid generation in production.
export function proxy(request?: NextRequest) {
  const path = request?.nextUrl.pathname ?? "/api/session";
  if (PUBLIC_DEMO_BUILD || publicDemoRequested()) return publicDemoProxy(path);
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
