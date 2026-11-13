import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { approvedGoogleProfile } from "./infrastructure/auth/google-policy";

// Pinned Auth.js v5 integrates with Next.js 16. Secrets remain server-only.
export const { handlers, auth } = NextAuth(() => ({
  providers: [Google({ clientId: process.env.AUTH_GOOGLE_ID, clientSecret: process.env.AUTH_GOOGLE_SECRET })],
  secret: process.env.AUTH_SECRET,
  trustHost: true, // AUTH_URL is required and fixes the canonical request origin.
  session: { strategy: "jwt", maxAge: 8 * 60 * 60 },
  logger: { error(error) { console.error("Auth.js request failed:", error.name); } },
  callbacks: {
    signIn({ account, profile }) {
      return !!approvedGoogleProfile(account?.provider, profile);
    },
    jwt({ token, account, profile }) {
      if (account) {
        const identity = approvedGoogleProfile(account.provider, profile);
        if (!identity) return null;
        token.googleSubject = identity.sub;
        token.email = identity.email.toLowerCase();
        token.emailVerified = true;
        token.provider = "google";
      }
      return token;
    },
    session({ session, token }) {
      session.user.id = typeof token.googleSubject === "string" ? token.googleSubject : "";
      session.user.googleEmailVerified = token.emailVerified === true;
      session.user.provider = token.provider === "google" ? "google" : undefined;
      return session;
    },
  },
}));
