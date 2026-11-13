import { PracticeWorkflowError } from "../../../application/workflows/submit-practice-attempt";
import { AccessError } from "../../auth/practice-access";

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);
export function localGeminiRequested() { return process.env.ALLOW_LOCAL_GEMINI === "true"; }

// This is a development-only opt-in, never a hosted authentication bypass.
// Run the dev server bound to localhost, not 0.0.0.0 or a public tunnel.
export function requireLocalGeminiRequest(request: Request) {
  if (!localGeminiRequested() || process.env.NODE_ENV !== "development") throw new AccessError("Login-free Gemini evaluation is allowed only in explicit local development mode.", 403);
  const canonical = new URL(process.env.AUTH_URL || "http://localhost:3000");
  const requested = new URL(request.url);
  if (!LOOPBACK.has(canonical.hostname) || !LOOPBACK.has(requested.hostname) || canonical.origin !== requested.origin || request.headers.get("host") !== canonical.host || request.headers.get("origin") !== canonical.origin || request.headers.get("sec-fetch-site") === "cross-site") {
    throw new AccessError("Local Gemini requests must originate from the configured loopback app.", 403);
  }
}

export const LOCAL_GEMINI_CALL_LIMIT = 10;
const MIN_CALL_INTERVAL_MS = 3000;
// Shared by every demo cookie on this server process. Restart resets this guard;
// it is not a dollar cap, provider billing quota, or durable multi-instance budget.
export class LocalGeminiBudget {
  private calls = 0;
  private active = false;
  private lastStartedAt = -Infinity;
  constructor(private readonly now = () => Date.now()) {}
  async run<T>(call: () => Promise<T>): Promise<T> {
    if (this.calls >= LOCAL_GEMINI_CALL_LIMIT) throw new PracticeWorkflowError("Your answer is saved. Local Gemini limit reached (10 provider attempts per server process). Review usage before restarting.", 429);
    if (this.active || this.now() - this.lastStartedAt < MIN_CALL_INTERVAL_MS) throw new PracticeWorkflowError("Your answer is saved. A local evaluation is active or was just started. Wait a few seconds before retrying.", 429);
    this.calls++; this.active = true; this.lastStartedAt = this.now();
    try { return await call(); } finally { this.active = false; }
  }
}
declare global { var __echoLocalGeminiBudget: LocalGeminiBudget | undefined }
export function localGeminiBudget() { return globalThis.__echoLocalGeminiBudget ??= new LocalGeminiBudget(); }
