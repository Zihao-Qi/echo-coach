import { validatePublicDemo } from "./infrastructure/config/public-demo-runtime";

export function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NEXT_PHASE === "phase-production-build") return;
  try { validatePublicDemo(); }
  catch (error) {
    // Throwing from register alone can leave Next listening. These errors contain only fixed text.
    console.error(error instanceof Error ? error.message : "Public demo configuration is invalid.");
    process.exit(1);
  }
}
