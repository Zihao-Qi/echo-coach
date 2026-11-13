export type InterviewTrack = "behavioral" | "swe" | "ai-ml";

export interface InterviewQuestion {
  id: string;
  origin?: "curated" | "follow-up";
  track: InterviewTrack;
  competency: string;
  prompt: string;
  intent: string;
  hints: readonly string[];
  rubric: {
    version: string;
    expectedConcepts: readonly string[];
    commonPitfalls: readonly string[];
  };
}

export const evaluationCriteria = {
  correctness: "Content accuracy",
  reasoning: "Reasoning",
  structure: "Structure and clarity",
  evidence: "Specific evidence",
} as const;
export interface CriterionAssessment {
  status: "effective" | "partial" | "needs-work" | "not-assessable";
  observation: string;
  excerpt: string; // Empty when the answer provides no supporting excerpt.
}
export interface PreviousAnswer {
  id: string;
  questionId: string;
  answer: string;
}
export interface FollowUpProposal {
  prompt: string;
  rationale: string;
  focus: keyof typeof evaluationCriteria;
  expectedConcepts: string[];
}
export interface RetryComparison {
  summary: string;
  changes: {
    kind: "improvement" | "regression" | "neutral";
    observation: string;
    beforeExcerpt: string;
    afterExcerpt: string;
  }[];
  nextFocus: string;
}
export interface AnswerEvaluation {
  followUp?: FollowUpProposal | null;
  // Bound to AnswerAttempt.previousAttemptId by the application, never by the model.
  comparison?: RetryComparison | null;
  // Optional for reading attempts stored before criterion-based evaluation.
  criteria?: Record<keyof typeof evaluationCriteria, CriterionAssessment>;
  strengths: { observation: string; excerpt: string }[];
  gaps: { observation: string; nextStep: string }[];
  nextSteps: string[];
  uncertainty: string[];
  suggestedAnswer: string;
}

export interface AnswerAttempt {
  id: string;
  questionId: string;
  rootQuestionId?: string;
  questionSnapshot?: InterviewQuestion;
  followUpOfAttemptId?: string;
  answer: string;
  previousAttemptId?: string;
  submittedAt: string;
  evaluation: AnswerEvaluation;
  provenance: {
    mode: "demo" | "gemini";
    model: string;
    thinkingLevel?: "low";
    promptVersion: string;
    rubricVersion: string;
    usage?: { inputTokens: number; outputTokens: number; thinkingTokens: number; totalTokens: number };
  };
}
