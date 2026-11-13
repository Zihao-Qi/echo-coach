import { NextResponse } from "next/server";

// The legacy API has no owner-scoped persistence. Keep its mock presentation flow,
// but prevent accidentally exposing real history or paid generation in production.
export function proxy() {
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

export const config = { matcher: ["/api/session/:path*", "/api/history"] };
