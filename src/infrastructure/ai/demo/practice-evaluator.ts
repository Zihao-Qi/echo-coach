import type { AnswerEvaluator } from "../../../application/ports/answer-evaluator";
import type { AnswerEvaluation, InterviewQuestion, PreviousAnswer } from "../../../domain/interview/practice";

// Deliberately illustrative: no keyword heuristics masquerading as correctness assessment.
export class DemoPracticeEvaluator implements AnswerEvaluator {
  readonly mode = "demo" as const;
  readonly model = "demo-fixture";
  async evaluate(question: InterviewQuestion, answer: string, previous?: PreviousAnswer): Promise<AnswerEvaluation> {
    const unassessed = { status: "not-assessable" as const, observation: "Demo mode does not assess this dimension. Configure Gemini for an actual review.", excerpt: "" };
    return {
      followUp: question.origin === "follow-up" ? null : {
        prompt: question.track === "behavioral" ? "Which decision in this project was yours, and why did you make it?" : "Can you explain the main trade-off and give a concrete example?",
        rationale: "Illustrative demo follow-up, not personalized gap assessment.",
        focus: question.track === "behavioral" ? "evidence" : "reasoning",
        expectedConcepts: [...question.rubric.expectedConcepts.slice(0, 2)].map((concept) => concept.slice(0, 150)),
      },
      comparison: previous && previous.answer.trim() !== answer.trim() ? {
        summary: "Illustrative comparison only. Demo mode does not determine whether your retry improved.",
        changes: [],
        nextFocus: `Review your changes against the rubric: ${question.rubric.expectedConcepts[0]}.`,
      } : null,
      criteria: { correctness: { ...unassessed }, reasoning: { ...unassessed }, structure: { ...unassessed }, evidence: { ...unassessed } },
      strengths: [{ observation: "This excerpt is preserved from your submission. Demo mode does not judge its correctness.", excerpt: answer.slice(0, 120) }],
      gaps: [{ observation: `Check your answer against this rubric item: ${question.rubric.expectedConcepts[0]}.`, nextStep: "Explain the reasoning or add a specific example in your next attempt." }],
      nextSteps: ["Review the rubric, then rewrite your answer in your own words."],
      uncertainty: ["Illustrative demo feedback only. A configured Gemini evaluator is required for an actual assessment."],
      suggestedAnswer: "No model answer is generated in demo mode. Use the hints and rubric to develop your own response.",
    };
  }
}
