import { z } from "zod";

const googleProfileSchema = z.object({
  sub: z.string().min(1).max(256),
  email: z.email(),
  email_verified: z.literal(true),
});
export function allowedPracticeEmails() {
  return (process.env.PRACTICE_ALLOWED_EMAILS || "").split(",").map((value) => value.trim().toLowerCase()).filter(Boolean);
}
export function approvedGoogleProfile(provider: string | undefined, profile: unknown) {
  if (provider !== "google") return null;
  const result = googleProfileSchema.safeParse(profile);
  if (!result.success || !allowedPracticeEmails().includes(result.data.email.toLowerCase())) return null;
  return result.data;
}
export function authConfigurationError() {
  if (!process.env.AUTH_GOOGLE_ID || !process.env.AUTH_GOOGLE_SECRET || !process.env.AUTH_SECRET || !process.env.AUTH_URL || !allowedPracticeEmails().length) return "Configure Google OAuth credentials, AUTH_SECRET, AUTH_URL, and your personal email allowlist.";
  if (process.env.AUTH_SECRET.length < 32) return "AUTH_SECRET must be at least 32 characters.";
  try {
    const url = new URL(process.env.AUTH_URL);
    if (url.username || url.password || url.search || url.hash || url.pathname !== "/") return "AUTH_URL must be a canonical origin without credentials, path, query, or fragment.";
    if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))) return "AUTH_URL must use HTTPS except for local development.";
  } catch { return "AUTH_URL must be a valid canonical origin."; }
  return null;
}
