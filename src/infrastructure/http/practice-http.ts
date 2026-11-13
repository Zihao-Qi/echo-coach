import { NextResponse } from "next/server";
import { AccessError } from "../auth/practice-access";
import { PracticeWorkflowError } from "../../application/workflows/submit-practice-attempt";

export class RequestError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}
export async function readPracticeJson(request: Request) {
  if (!request.headers.get("content-type")?.includes("application/json")) throw new RequestError("Send a JSON request.", 415);
  const reader = request.body?.getReader();
  if (!reader) throw new RequestError("A request body is required.", 400);
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 50000) { await reader.cancel(); throw new RequestError("Answer request is too large.", 413); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown; }
  catch { throw new RequestError("Invalid JSON.", 400); }
}
export function practiceJson(value: unknown, status = 200) {
  return NextResponse.json(value, { status, headers: { "Cache-Control": "private, no-store", "Vary": "Cookie, Authorization" } });
}
export function practiceError(error: unknown) {
  if (error instanceof AccessError || error instanceof RequestError || error instanceof PracticeWorkflowError) return practiceJson({ error: error.message }, error.status);
  console.error("Practice request failed:", error instanceof Error ? error.name : "UnknownError");
  return practiceJson({ error: "Practice storage is unavailable. Please keep your draft and try again." }, 503);
}
