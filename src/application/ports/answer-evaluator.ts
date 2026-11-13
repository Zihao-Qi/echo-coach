import type { AnswerAttempt, AnswerEvaluation, InterviewQuestion, PreviousAnswer } from "../../domain/interview/practice";

export interface AnswerEvaluator {
  readonly mode: "demo" | "gemini";
  readonly model: string;
  readonly thinkingLevel?: "low";
  readonly usage?: AnswerAttempt["provenance"]["usage"];
  evaluate(question: InterviewQuestion, answer: string, previous?: PreviousAnswer): Promise<AnswerEvaluation>;
}
