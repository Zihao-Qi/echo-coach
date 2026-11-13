import { AccessError } from "./practice-access";

// Unlike the Google-specific write guard, this applies to demo-cookie audio too
// and requires no OAuth credentials. Origin is canonical config, not supplied Host.
export function requireCanonicalWriteOrigin(request: Request) {
  let canonical: URL;
  try {
    canonical = new URL(process.env.AUTH_URL || "http://localhost:3000");
    if (canonical.username || canonical.password || canonical.pathname !== "/" || canonical.search || canonical.hash ||
        (canonical.protocol !== "https:" && !(canonical.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(canonical.hostname)))) throw new Error();
  } catch { throw new AccessError("Configure a canonical HTTPS or local loopback AUTH_URL for transcription.", 503); }
  if (request.headers.get("origin") !== canonical.origin || request.headers.get("sec-fetch-site") === "cross-site") {
    throw new AccessError("Cross-origin transcription writes are not permitted.", 403);
  }
}
