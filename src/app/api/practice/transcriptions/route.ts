import { transcriptionRequestSchema, transcriptionReplayCache, TranscriptionError } from "../../../../application/workflows/transcribe-audio";
import { AudioValidationError } from "../../../../domain/audio/canonical-wav";
import { DemoAudioTranscriber } from "../../../../infrastructure/ai/demo/audio-transcriber";
import { requireCanonicalWriteOrigin } from "../../../../infrastructure/auth/canonical-origin";
import { requirePracticeOwner } from "../../../../infrastructure/auth/practice-access";
import { transcriptionCapability } from "../../../../infrastructure/config/transcription-runtime";
import { practiceError, practiceJson } from "../../../../infrastructure/http/practice-http";
import { readCanonicalAudio } from "../../../../infrastructure/http/read-audio";

export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    requireCanonicalWriteOrigin(request);
    const owner = await requirePracticeOwner(request);
    const capability = transcriptionCapability();
    if (!capability.available) return practiceJson({ error: capability.reason, code: "disabled" }, 503);
    const parsed = transcriptionRequestSchema.safeParse({ id: request.headers.get("idempotency-key"), intent: request.headers.get("x-transcription-intent") });
    if (!parsed.success) return practiceJson({ error: "Send a UUID Idempotency-Key and explicit start or recover intent." }, 400);
    const { bytes } = await readCanonicalAudio(request);
    // There is intentionally NO real adapter selection in this stage.
    const transcription = await transcriptionReplayCache().run(owner, parsed.data, bytes, new DemoAudioTranscriber());
    return practiceJson({ transcription });
  } catch (error) {
    if (error instanceof TranscriptionError) return practiceJson({ error: error.message, code: error.code }, error.status);
    if (error instanceof AudioValidationError) return practiceJson({ error: error.message }, 400);
    return practiceError(error);
  }
}
