import { AUDIO_MAX_UPLOAD_BYTES, AudioValidationError, validateCanonicalWav } from "../../domain/audio/canonical-wav";

// Shared by the isolated feasibility harness now, and a future protected route.
// This helper performs NO authorization or provider call.
export async function readCanonicalAudio(request: Request) {
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "audio/wav") {
    throw new AudioValidationError("Send canonical audio/wav bytes.");
  }
  const declared = request.headers.get("content-length");
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > AUDIO_MAX_UPLOAD_BYTES)) {
    throw new AudioValidationError("Audio body exceeds the upload limit or has an invalid length.");
  }
  if (!request.body) throw new AudioValidationError("Audio body is required.");
  const reader = request.body.getReader();
  // cancel() closes pending reads immediately, even when the underlying source's
  // cancellation promise never settles. Never await that untrusted promise.
  const cancel = () => { void reader.cancel().catch(() => {}); };
  request.signal.addEventListener("abort", cancel, { once: true });
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      request.signal.throwIfAborted();
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > AUDIO_MAX_UPLOAD_BYTES) throw new AudioValidationError("Audio body exceeds the upload limit.");
      chunks.push(value);
    }
    request.signal.throwIfAborted();
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return { bytes, info: validateCanonicalWav(bytes) };
  } catch (error) {
    cancel();
    throw error;
  } finally {
    request.signal.removeEventListener("abort", cancel);
    reader.releaseLock();
  }
}
