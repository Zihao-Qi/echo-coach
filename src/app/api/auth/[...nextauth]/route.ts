import type { NextRequest } from "next/server";
import { handlers } from "../../../../auth";
import { authConfigurationError } from "../../../../infrastructure/auth/google-policy";
import { isDemoMode } from "../../../../infrastructure/auth/practice-access";
import { practiceJson } from "../../../../infrastructure/http/practice-http";

export const runtime = "nodejs";
function configured() {
  if (isDemoMode()) return practiceJson({ error: "Google sign-in is not used in demo mode." }, 404);
  const error = authConfigurationError();
  return error ? practiceJson({ error }, 503) : null;
}
export async function GET(request: NextRequest) { return configured() || handlers.GET(request); }
export async function POST(request: NextRequest) { return configured() || handlers.POST(request); }
