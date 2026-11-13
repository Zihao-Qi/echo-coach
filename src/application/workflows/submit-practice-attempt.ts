import { z } from "zod";
import type { InterviewQuestion, PreviousAnswer } from "../../domain/interview/practice";
import { makeFollowUpQuestion } from "../../domain/interview/follow-up";
import { parseFollowUp } from "./follow-up-contract";
import { completedAttempt } from "../../domain/interview/attempt-record";
import type { AttemptRepository } from "../ports/attempt-repository";
import type { AnswerEvaluator } from "../ports/answer-evaluator";
import { evaluateAttempt, submissionSchema } from "./evaluate-attempt";

export const durableSubmissionSchema = submissionSchema.extend({ submissionId: z.uuid() });
export class PracticeWorkflowError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

export async function submitPracticeAttempt(
  ownerId: string,
  questionSeed: InterviewQuestion,
  input: z.infer<typeof durableSubmissionSchema>,
  repository: AttemptRepository,
  evaluator: AnswerEvaluator,
  dailyLimit: number,
) {
  const rootId = input.questionId;
  const focusedSeed = !!input.followUpOfAttemptId && questionSeed.origin === "follow-up" && questionSeed.id === `followup:${input.followUpOfAttemptId}`;
  let question = questionSeed;
  if (!(questionSeed.id === rootId && questionSeed.origin !== "follow-up") && !focusedSeed) throw new PracticeWorkflowError("Root question does not match submission.", 400);
  if (input.followUpOfAttemptId) {
    const source = await repository.get(ownerId, input.followUpOfAttemptId);
    const proposal = parseFollowUp(source?.evaluation?.followUp);
    if (!source || source.status !== "completed" || source.questionId !== rootId || source.followUpOfAttemptId || source.questionSnapshot?.origin === "follow-up" || !proposal) {
      throw new PracticeWorkflowError("Follow-up source is unavailable for this question or account. Only one follow-up depth is supported.", 400);
    }
    question = focusedSeed ? questionSeed : makeFollowUpQuestion(source.questionSnapshot || questionSeed, source.id, proposal);
  }
  let previous: PreviousAnswer | undefined;
  if (input.previousAttemptId) {
    const record = await repository.get(ownerId, input.previousAttemptId);
    if (!record || record.questionId !== question.id || record.followUpOfAttemptId !== input.followUpOfAttemptId) throw new PracticeWorkflowError("Previous attempt does not belong to this question or account.", 400);
    if (record.questionSnapshot) question = record.questionSnapshot;
    previous = { id: record.id, questionId: record.questionId, answer: record.answer };
  }
  let saved = await repository.create(ownerId, {
    id: input.submissionId, questionId: question.id, answer: input.answer,
    rootQuestionId: rootId, questionSnapshot: structuredClone(question), followUpOfAttemptId: input.followUpOfAttemptId,
    previousAttemptId: input.previousAttemptId, submittedAt: new Date().toISOString(), status: "pending",
  });
  if (saved.answer !== input.answer || saved.questionId !== question.id || saved.previousAttemptId !== input.previousAttemptId || saved.followUpOfAttemptId !== input.followUpOfAttemptId || (saved.rootQuestionId || saved.questionId) !== rootId) {
    throw new PracticeWorkflowError("Submission ID was already used for a different answer.", 409);
  }
  if (!saved.questionSnapshot && saved.status !== "completed") saved = await repository.initializeSnapshot(ownerId, saved.id, question, rootId);
  // Replays and retries use the saved prompt/rubric, not a newly edited catalog.
  question = saved.questionSnapshot || question;
  const completed = completedAttempt(saved);
  if (completed) return completed;
  const claim = await repository.claim(ownerId, saved.id, dailyLimit);
  if (claim.kind === "limited") throw new PracticeWorkflowError("Your answer is saved. Daily evaluation limit reached; try again tomorrow.", 429);
  if (claim.kind === "busy") throw new PracticeWorkflowError("Your answer is saved and is already being evaluated. Refresh history shortly.", 409);
  if (claim.kind === "completed") {
    const record = await repository.get(ownerId, saved.id);
    const result = record && completedAttempt(record);
    if (!result) throw new Error("Completed attempt is missing its evaluation.");
    return result;
  }
  try {
    const result = await evaluateAttempt(question, input, evaluator, previous);
    await repository.finish(ownerId, saved.id, claim.leaseId, { evaluation: result.evaluation, provenance: result.provenance });
    return { ...result, id: saved.id, submittedAt: saved.submittedAt };
  } catch (error) {
    await repository.fail(ownerId, saved.id, claim.leaseId).catch(() => {});
    if (error instanceof PracticeWorkflowError) throw error;
    console.error("Saved attempt evaluation failed:", error instanceof Error ? error.name : "UnknownError");
    throw new PracticeWorkflowError("Your answer is saved, but evaluation failed. Retry the saved attempt without submitting a duplicate.", 502);
  }
}
