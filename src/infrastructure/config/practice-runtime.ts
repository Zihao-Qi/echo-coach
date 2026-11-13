// Authentication, persistence, and model execution are separate capabilities.
// In particular, real Google sign-in must not require paid AI/database calls.
export function isMockEvaluationMode() { return process.env.USE_MOCK !== "false"; }
export function practiceAuthMode(): "demo" | "google" {
  const mode = process.env.PRACTICE_AUTH_MODE || (isMockEvaluationMode() ? "demo" : "google");
  if (mode !== "demo" && mode !== "google") throw new Error("PRACTICE_AUTH_MODE must be demo or google.");
  return mode;
}
export function practiceStorageMode(): "memory" | "firestore" {
  const mode = process.env.PRACTICE_STORAGE || (isMockEvaluationMode() ? "memory" : "firestore");
  if (mode !== "memory" && mode !== "firestore") throw new Error("PRACTICE_STORAGE must be memory or firestore.");
  if (mode === "firestore" && practiceAuthMode() === "demo") throw new Error("Firestore practice storage requires Google authentication.");
  return mode;
}
