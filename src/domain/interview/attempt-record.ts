import type { AnswerAttempt } from "./practice";

export interface AttemptRecord {
  id: string;
  questionId: string;
  rootQuestionId?: string;
  questionSnapshot?: AnswerAttempt["questionSnapshot"];
  followUpOfAttemptId?: string;
  answer: string;
  previousAttemptId?: string;
  submittedAt: string;
  status: "pending" | "evaluating" | "completed" | "failed";
  evaluation?: AnswerAttempt["evaluation"];
  provenance?: AnswerAttempt["provenance"];
  leaseId?: string;
  leaseExpiresAt?: string;
}

export function completedAttempt(record: AttemptRecord): AnswerAttempt | null {
  if (record.status !== "completed" || !record.evaluation || !record.provenance) return null;
  return {
    id: record.id, questionId: record.questionId, answer: record.answer,
    rootQuestionId: record.rootQuestionId, questionSnapshot: record.questionSnapshot, followUpOfAttemptId: record.followUpOfAttemptId,
    previousAttemptId: record.previousAttemptId, submittedAt: record.submittedAt,
    evaluation: record.evaluation, provenance: record.provenance,
  };
}
