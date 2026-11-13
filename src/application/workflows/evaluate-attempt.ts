import { z } from "zod";
import { randomUUID } from "node:crypto";
import type { AnswerAttempt, InterviewQuestion, PreviousAnswer } from "../../domain/interview/practice";
import { followUpSchema, parseFollowUp } from "./follow-up-contract";
import type { AnswerEvaluator } from "../ports/answer-evaluator";

export const submissionSchema = z.object({
  questionId: z.string().min(1).max(100),
  answer: z.string().trim().min(20, "Write at least 20 characters so the coach has something to review.").max(10000),
  previousAttemptId: z.uuid().optional(),
  followUpOfAttemptId: z.uuid().optional(),
}).strict();

const text = z.string().trim().min(1).max(3000);
const criterionSchema = z.object({
  status: z.enum(["effective", "partial", "needs-work", "not-assessable"]),
  observation: text,
  excerpt: z.string().max(1000),
}).strict();
export const evaluationSchema = z.object({
  // Optional enrichment is parsed separately; a bad proposal must not lose core feedback.
  followUp: z.unknown().optional(),
  comparison: z.object({
    summary: text,
    changes: z.array(z.object({
      kind: z.enum(["improvement", "regression", "neutral"]),
      observation: text,
      beforeExcerpt: z.string().min(1).max(1000),
      afterExcerpt: z.string().min(1).max(1000),
    }).strict()).max(3),
    nextFocus: text,
  }).strict().nullable(),
  criteria: z.object({ correctness: criterionSchema, reasoning: criterionSchema, structure: criterionSchema, evidence: criterionSchema }).strict(),
  strengths: z.array(z.object({ observation: text, excerpt: text }).strict()).max(4),
  gaps: z.array(z.object({ observation: text, nextStep: text }).strict()).max(4),
  nextSteps: z.array(text).min(1).max(3),
  uncertainty: z.array(text).max(4),
  suggestedAnswer: text,
}).strict();

export const evaluationResponseSchema = evaluationSchema.extend({ followUp: followUpSchema.nullable() });
export function parseEvaluation(value: unknown) {
  const parsed = evaluationSchema.parse(value);
  return { ...parsed, followUp: parseFollowUp(parsed.followUp) };
}

const normalizeEvidence = (value: string) => value.trim().replace(/\s+/gu, " ");

export const PROMPT_VERSION = "question-aware-v5-follow-ups";

// Pure evaluation step. submitPracticeAttempt owns persistence and evaluation leases.
export async function evaluateAttempt(
  question: InterviewQuestion,
  input: z.infer<typeof submissionSchema>,
  evaluator: AnswerEvaluator,
  previous?: PreviousAnswer,
): Promise<AnswerAttempt> {
  if (input.previousAttemptId && (!previous || previous.id !== input.previousAttemptId || previous.questionId !== question.id)) {
    throw new Error("Retry evaluation requires its validated previous answer.");
  }
  if (previous && !input.previousAttemptId) throw new Error("Unexpected previous answer for a first attempt.");
  const submittedAt = new Date().toISOString();
  const evaluation = parseEvaluation(await evaluator.evaluate(question, input.answer, previous));
  if (question.origin === "follow-up") evaluation.followUp = null;
  // Identical submissions cannot claim learning gains. First attempts have no baseline.
  if (!previous || normalizeEvidence(previous.answer) === normalizeEvidence(input.answer)) evaluation.comparison = null;
  if (evaluation.comparison && previous) {
    for (const change of evaluation.comparison.changes) {
      if (!normalizeEvidence(change.beforeExcerpt) || !normalizeEvidence(change.afterExcerpt)) throw new Error("Retry comparison excerpts must contain non-whitespace content.");
      if (!previous.answer.includes(change.beforeExcerpt) || !input.answer.includes(change.afterExcerpt)) {
        throw new Error("Retry comparison excerpt is not present in the correct answer.");
      }
      if (change.kind !== "neutral" && normalizeEvidence(change.beforeExcerpt) === normalizeEvidence(change.afterExcerpt)) {
        throw new Error("Retry comparison cannot label identical evidence as improvement or regression.");
      }
    }
  }
  // Model quotations must actually occur in the unchanged submitted answer.
  const excerpts = [...evaluation.strengths.map((strength) => strength.excerpt), ...Object.values(evaluation.criteria).map((criterion) => criterion.excerpt).filter(Boolean)];
  if (excerpts.some((excerpt) => !input.answer.includes(excerpt))) {
    throw new Error("Evaluator returned an excerpt that is not present in the answer.");
  }
  // Personal experience cannot be verified mechanically. Do not expose a model-
  // written behavioral narrative as the candidate's experience, even if the model
  // ignores its no-invention instruction. Feedback/questions remain available.
  if (question.track === "behavioral") {
    evaluation.criteria.correctness = {
      status: "not-assessable", excerpt: "",
      observation: "Personal experience cannot be independently verified from this answer. Feedback evaluates relevance and evidence, not whether achievements occurred.",
    };
    evaluation.suggestedAnswer = "No automatic personal-story rewrite is provided. Keep your original facts and use the feedback to clarify your own contribution, decisions, and outcome. Add details only if they are true.";
  }
  return {
    id: randomUUID(), questionId: question.id, answer: input.answer,
    rootQuestionId: input.questionId, questionSnapshot: structuredClone(question), followUpOfAttemptId: input.followUpOfAttemptId,
    previousAttemptId: input.previousAttemptId, submittedAt, evaluation,
    provenance: { mode: evaluator.mode, model: evaluator.model, ...(evaluator.thinkingLevel ? { thinkingLevel: evaluator.thinkingLevel } : {}), promptVersion: PROMPT_VERSION, rubricVersion: question.rubric.version, ...(evaluator.usage ? { usage: evaluator.usage } : {}) },
  };
}
