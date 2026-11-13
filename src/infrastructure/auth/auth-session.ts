import type { Session } from "next-auth";

export type PracticeSessionReader = () => Promise<Session | null>;
// auth() reads and validates the current request's Auth.js session cookie.
// Lazy import keeps the demo path independent of OAuth configuration.
export const readPracticeSession: PracticeSessionReader = async () => {
  const { auth } = await import("../../auth");
  return auth();
};
