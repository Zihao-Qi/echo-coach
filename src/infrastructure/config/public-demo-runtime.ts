import { PUBLIC_DEMO_BUILD } from "./public-demo";

export function validatePublicDemo(env: Record<string, string | undefined> = process.env, demoBuild = PUBLIC_DEMO_BUILD) {
  if (!demoBuild && env.ECHO_PUBLIC_DEMO === undefined) return;
  if (!demoBuild || env.ECHO_PUBLIC_DEMO !== "true" || env.NODE_ENV !== "production") {
    throw new Error("Public demo requires matching build and production runtime flags.");
  }
  if (env.USE_MOCK !== "true" || env.PRACTICE_AUTH_MODE !== "demo" || env.PRACTICE_STORAGE !== "memory" ||
      env.PRACTICE_TRANSCRIPTION_MODE !== "disabled" || env.ALLOW_LOCAL_GEMINI !== "false" ||
      env.ALLOW_LOCAL_TRANSCRIPTION !== "false") {
    throw new Error("Public demo requires mock feedback, anonymous memory sessions, and disabled audio and local providers.");
  }
  if (["GEMINI_API_KEY", "GOOGLE_API_KEY", "GOOGLE_APPLICATION_CREDENTIALS", "AUTH_GOOGLE_ID", "AUTH_GOOGLE_SECRET", "AUTH_SECRET"]
    .some((name) => env[name])) throw new Error("Public demo must not be given provider or account credentials.");
  try {
    const origin = new URL(env.AUTH_URL ?? "");
    if (origin.protocol !== "https:" || origin.origin !== env.AUTH_URL) throw new Error();
  } catch {
    throw new Error("Public demo requires an exact HTTPS browser origin in AUTH_URL.");
  }
}
