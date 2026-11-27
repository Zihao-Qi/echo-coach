import { z } from "../../../application/workflows/evaluation-zod";
import { evaluateAttempt, evaluationResponseSchema, submissionSchema } from "../../../application/workflows/evaluate-attempt";
import { evaluationRequest, evaluationResult, GeminiFailure, malformed } from "../../../application/workflows/gemini-evaluation";
import { starterQuestions } from "../../../content/questions/starter-bank";
import { makeFollowUpQuestion } from "../../../domain/interview/follow-up";
import type { AnswerAttempt } from "../../../domain/interview/practice";
import type { AnswerEvaluator } from "../../../application/ports/answer-evaluator";
import { MODEL, generate } from "./transport";

export const HISTORY_SLOT = "echo.gemini.history.v1";
const stored = z.array(z.object({ id: z.uuid(), questionId: z.string(), rootQuestionId: z.string(), followUpOfAttemptId: z.uuid().optional(), previousAttemptId: z.uuid().optional(), answer: z.string(), submittedAt: z.iso.datetime(),
  questionSnapshot: z.object({ id: z.string(), origin: z.enum(["curated", "follow-up"]).optional(), track: z.enum(["ai-ml", "swe", "behavioral"]), prompt: z.string(), intent: z.string(), competency: z.string(), hints: z.array(z.string()), rubric: z.object({ version: z.string(), expectedConcepts: z.array(z.string()), commonPitfalls: z.array(z.string()) }) }),
  evaluation: evaluationResponseSchema, provenance: z.object({ mode: z.literal("gemini"), model: z.string(), thinkingLevel: z.literal("low"), promptVersion: z.string(), rubricVersion: z.string(), usage: z.object({ inputTokens: z.number(), outputTokens: z.number(), thinkingTokens: z.number(), totalTokens: z.number() }).optional() }),
}));
export function createKeyHistory(storage: () => Pick<Storage, "getItem" | "setItem">) {
  let attempts: AnswerAttempt[] | undefined;
  let notice = "";
  function localHistory() {
    if (!attempts) {
      attempts = [];
      try {
        const raw = storage().getItem(HISTORY_SLOT);
        if (raw) attempts = stored.parse(JSON.parse(raw));
      } catch { notice = "Saved key-mode history couldn't be loaded. Starting with this tab's available history."; }
    }
    return attempts;
  }
  return {
    localHistory,
    historyNotice() { const message = notice; notice = ""; return message; },
    saveAttempt(attempt: AnswerAttempt) {
      attempts = [...localHistory(), attempt];
      try { storage().setItem(HISTORY_SLOT, JSON.stringify(attempts)); }
      catch { notice = "This attempt can't be saved for a refresh."; }
    },
  };
}
export const { localHistory, historyNotice, saveAttempt } = createKeyHistory(() => sessionStorage);
export async function evaluateLocally(data: z.input<typeof submissionSchema>, signal: AbortSignal) {
  const validated = submissionSchema.safeParse(data);
  if (!validated.success) throw new GeminiFailure(validated.error.issues[0]?.message || "This answer couldn't be submitted.");
  const input = validated.data;
  const root = starterQuestions.find(q => q.id === input.questionId);
  if (!root) throw malformed();
  let question = root;
  if (input.followUpOfAttemptId) {
    const parent = localHistory().find(a => a.id === input.followUpOfAttemptId);
    if (!parent || parent.followUpOfAttemptId || parent.questionId !== root.id || !parent.evaluation.followUp) throw malformed();
    question = makeFollowUpQuestion(parent.questionSnapshot ?? root, parent.id, parent.evaluation.followUp);
  }
  const previous = input.previousAttemptId ? localHistory().find(a => a.id === input.previousAttemptId) : undefined;
  if (input.previousAttemptId && (!previous || previous.questionId !== question.id || previous.followUpOfAttemptId !== input.followUpOfAttemptId)) throw malformed();
  let usage: AnswerAttempt["provenance"]["usage"];
  const evaluator: AnswerEvaluator = { get usage() { return usage; }, mode: "gemini", model: MODEL, thinkingLevel: "low", async evaluate(q, answer, prior) {
    const result = evaluationResult(await generate(evaluationRequest(q, answer, prior), signal));
    usage = result.usage; return result.evaluation;
  } };
  try { return await evaluateAttempt(question, input, evaluator, previous); }
  catch (e) { throw e instanceof GeminiFailure ? e : malformed(); }
}
