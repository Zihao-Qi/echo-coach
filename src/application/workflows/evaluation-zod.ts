import { z } from "zod";

// Configure before constructing any browser-side schemas. The JIT detector's
// caught eval still emits a violation under the public demo's strict CSP.
if (typeof window !== "undefined") z.config({ jitless: true });

export { z };
