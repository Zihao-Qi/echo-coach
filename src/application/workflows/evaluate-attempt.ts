import type { z } from "zod";
import type { AnswerEvaluator } from "../ports/answer-evaluator";
import type { InterviewQuestion, PreviousAnswer } from "../../domain/interview/practice";
import { guardedAttempt, submissionSchema } from "./evaluation-contract";
export { evaluationResponseSchema, evaluationSchema, parseEvaluation, PROMPT_VERSION, submissionSchema } from "./evaluation-contract";

export async function evaluateAttempt(question: InterviewQuestion, input: z.infer<typeof submissionSchema>, evaluator: AnswerEvaluator, previous?: PreviousAnswer) {
  if (input.previousAttemptId && (!previous || previous.id !== input.previousAttemptId || previous.questionId !== question.id)) {
    throw new Error("Retry evaluation requires its validated previous answer.");
  }
  if (previous && !input.previousAttemptId) throw new Error("Unexpected previous answer for a first attempt.");
  const submittedAt = new Date().toISOString();
  return guardedAttempt(question, input, evaluator, await evaluator.evaluate(question, input.answer, previous), previous, submittedAt);
}
