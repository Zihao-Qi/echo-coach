import { durableSubmissionSchema, submitPracticeAttempt } from "../../../../application/workflows/submit-practice-attempt";
import { resolveQuestionSeed } from "../../../../application/workflows/resolve-question-seed";
import { findQuestion } from "../../../../content/questions/starter-bank";
import { DemoPracticeEvaluator } from "../../../../infrastructure/ai/demo/practice-evaluator";
import { GeminiPracticeEvaluator } from "../../../../infrastructure/ai/gemini/practice-evaluator";
import { isDemoMode, requirePracticeOwner, requirePracticeWriteOrigin } from "../../../../infrastructure/auth/practice-access";
import { isMockEvaluationMode, practiceStorageMode } from "../../../../infrastructure/config/practice-runtime";
import { localGeminiBudget, localGeminiRequested, requireLocalGeminiRequest } from "../../../../infrastructure/ai/gemini/local-evaluation";
import type { AnswerEvaluator } from "../../../../application/ports/answer-evaluator";
import { practiceRepository } from "../../../../infrastructure/persistence/practice-repository";
import { practiceError, practiceJson, readPracticeJson } from "../../../../infrastructure/http/practice-http";

export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    requirePracticeWriteOrigin(request);
    const ownerId = await requirePracticeOwner(request);
    const parsed = durableSubmissionSchema.safeParse(await readPracticeJson(request));
    if (!parsed.success) return practiceJson({ error: parsed.error.issues[0]?.message || "Invalid answer." }, 400);
    const repository = practiceRepository();
    const question = await resolveQuestionSeed(ownerId, parsed.data, repository, findQuestion);
    if (!question) return practiceJson({ error: "Question not found." }, 404);
    const useDemo = isMockEvaluationMode();
    const local = !useDemo && localGeminiRequested();
    if (local) requireLocalGeminiRequest(request);
    else if (!useDemo && (isDemoMode() || practiceStorageMode() !== "firestore")) {
      return practiceJson({ error: "Real model evaluation requires Google sign-in and durable Firestore storage." }, 503);
    }
    if (!useDemo && (!process.env.GEMINI_API_KEY || !process.env.GEMINI_EVALUATION_MODEL)) {
      return practiceJson({ error: "Configure GEMINI_API_KEY and GEMINI_EVALUATION_MODEL for real evaluation." }, 503);
    }
    const baseEvaluator: AnswerEvaluator = useDemo ? new DemoPracticeEvaluator() : new GeminiPracticeEvaluator(process.env.GEMINI_EVALUATION_MODEL!, process.env.GEMINI_API_KEY!);
    // Reserve only for an actual provider call, after idempotency/lease checks.
    const evaluator: AnswerEvaluator = local ? {
      mode: baseEvaluator.mode, model: baseEvaluator.model, thinkingLevel: baseEvaluator.thinkingLevel,
      get usage() { return baseEvaluator.usage; },
      evaluate: (question, answer, previous) => localGeminiBudget().run(() => baseEvaluator.evaluate(question, answer, previous)),
    } : baseEvaluator;
    const configuredLimit = Number(process.env.PRACTICE_DAILY_EVALUATIONS || 20);
    const dailyLimit = useDemo ? 100 : Number.isInteger(configuredLimit) && configuredLimit > 0 ? Math.min(configuredLimit, 100) : 20;
    const attempt = await submitPracticeAttempt(ownerId, question, parsed.data, repository, evaluator, dailyLimit);
    return practiceJson({ attempt });
  } catch (error) { return practiceError(error); }
}
