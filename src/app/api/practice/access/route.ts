import { AccessError, DEMO_COOKIE, isDemoMode, newDemoSession, readDemoOwner, requirePracticeOwner } from "../../../../infrastructure/auth/practice-access";
import { localGeminiRequested } from "../../../../infrastructure/ai/gemini/local-evaluation";
import { isMockEvaluationMode, practiceStorageMode } from "../../../../infrastructure/config/practice-runtime";
import { transcriptionCapability } from "../../../../infrastructure/config/transcription-runtime";
import { practiceError, practiceJson } from "../../../../infrastructure/http/practice-http";

export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    const storage = practiceStorageMode();
    const transcription = transcriptionCapability();
    const mockEvaluation = isMockEvaluationMode();
    const localGemini = !mockEvaluation && localGeminiRequested() && process.env.NODE_ENV === "development";
    if (isDemoMode()) {
      const response = practiceJson({ mode: "demo", storage, mockEvaluation, localGemini, transcription });
      if (!readDemoOwner(request)) response.cookies.set(DEMO_COOKIE, newDemoSession(), { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30 });
      return response;
    }
    try {
      const ownerId = await requirePracticeOwner(request);
      return practiceJson({ mode: "authjs", storage, mockEvaluation, localGemini, transcription, user: { id: ownerId, email: null } });
    } catch (error) {
      if (error instanceof AccessError && error.status === 401) return practiceJson({ mode: "authjs", storage, mockEvaluation, localGemini, transcription, user: null });
      throw error;
    }
  } catch (error) {
    return practiceError(error);
  }
}
