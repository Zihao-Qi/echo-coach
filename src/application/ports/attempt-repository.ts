import type { AttemptRecord } from "../../domain/interview/attempt-record";
import type { AnswerAttempt, InterviewQuestion } from "../../domain/interview/practice";

export interface AttemptCursor { submittedAt: string; id: string }
export interface AttemptPage { records: AttemptRecord[]; cursor: AttemptCursor | null }
export type EvaluationClaim =
  | { kind: "claimed"; leaseId: string }
  | { kind: "completed" }
  | { kind: "busy" }
  | { kind: "limited" };

export interface AttemptRepository {
  // Create-if-absent, never replace submitted evidence. ID is an idempotency key.
  create(ownerId: string, record: AttemptRecord): Promise<AttemptRecord>;
  get(ownerId: string, id: string): Promise<AttemptRecord | null>;
  // Atomically fill legacy missing metadata, never replace a saved snapshot or answer.
  initializeSnapshot(ownerId: string, id: string, question: InterviewQuestion, rootQuestionId: string): Promise<AttemptRecord>;
  list(ownerId: string, cursor?: AttemptCursor): Promise<AttemptPage>;
  // Claim and daily quota reservation must be atomic across backend instances.
  claim(ownerId: string, id: string, dailyLimit: number): Promise<EvaluationClaim>;
  finish(ownerId: string, id: string, leaseId: string, result: Pick<AnswerAttempt, "evaluation" | "provenance">): Promise<void>;
  fail(ownerId: string, id: string, leaseId: string): Promise<void>;
}
