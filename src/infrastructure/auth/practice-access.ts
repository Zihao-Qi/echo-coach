import { createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { practiceAuthMode, practiceStorageMode } from "../config/practice-runtime";
import { allowedPracticeEmails, authConfigurationError } from "./google-policy";
import { readPracticeSession, type PracticeSessionReader } from "./auth-session";

export class AccessError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}
export const DEMO_COOKIE = "echo-practice-demo";
declare global { var __echoPracticeDemoKey: string | undefined }
function demoKey() {
  // Demo sessions intentionally expire on process restart unless explicitly configured.
  return process.env.DEMO_SESSION_SECRET || (globalThis.__echoPracticeDemoKey ??= randomBytes(32).toString("hex"));
}
function sign(id: string) { return createHmac("sha256", demoKey()).update(id).digest("hex"); }
export function isDemoMode() { return practiceAuthMode() === "demo"; }
export function newDemoSession() {
  const payload = `${randomUUID()}.${Date.now() + 30 * 24 * 60 * 60 * 1000}`;
  return `${payload}.${sign(payload)}`;
}
export function readDemoOwner(request: Request) {
  const value = request.headers.get("cookie")?.split(";").map((item) => item.trim()).find((item) => item.startsWith(`${DEMO_COOKIE}=`))?.slice(DEMO_COOKIE.length + 1);
  if (!value) return null;
  const [id, expiresAt, signature, extra] = value.split(".");
  if (extra || !/^[0-9a-f-]{36}$/.test(id || "") || !/^\d{13}$/.test(expiresAt || "") || !/^[0-9a-f]{64}$/.test(signature || "")) return null;
  if (Number(expiresAt) <= Date.now()) return null;
  if (!timingSafeEqual(Buffer.from(signature), Buffer.from(sign(`${id}.${expiresAt}`)))) return null;
  return `demo:${id}`;
}
export async function requirePracticeOwner(request: Request, readSession: PracticeSessionReader = readPracticeSession): Promise<string> {
  if (isDemoMode()) {
    const owner = readDemoOwner(request);
    if (!owner) throw new AccessError("Initialize a demo session before practicing.", 401);
    return owner;
  }
  const storage = practiceStorageMode();
  const configurationError = authConfigurationError();
  if (configurationError || (storage === "firestore" && !process.env.GOOGLE_CLOUD_PROJECT)) throw new AccessError(configurationError || "Configure GOOGLE_CLOUD_PROJECT for durable storage.", 503);
  const session = await readSession();
  const user = session?.user;
  if (!user?.id || user.provider !== "google" || user.googleEmailVerified !== true || !user.email) throw new AccessError("Sign in with a verified Google account to access your practice history.", 401);
  // Check the allowlist on every request: removing an email revokes app access immediately.
  if (!allowedPracticeEmails().includes(user.email.toLowerCase())) throw new AccessError("This personal workspace is not available to this account.", 403);
  return `google:${user.id}`;
}

export function requirePracticeWriteOrigin(request: Request) {
  if (isDemoMode()) return;
  const configurationError = authConfigurationError();
  if (configurationError) throw new AccessError(configurationError, 503);
  const allowedOrigin = new URL(process.env.AUTH_URL!).origin;
  if (request.headers.get("origin") !== allowedOrigin || request.headers.get("sec-fetch-site") === "cross-site") throw new AccessError("Cross-origin practice writes are not permitted.", 403);
}
