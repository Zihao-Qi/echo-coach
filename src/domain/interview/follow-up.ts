import type { FollowUpProposal, InterviewQuestion } from "./practice";

export function makeFollowUpQuestion(root: InterviewQuestion, sourceAttemptId: string, proposal: FollowUpProposal): InterviewQuestion {
  return {
    id: `followup:${sourceAttemptId}`, origin: "follow-up", track: root.track,
    competency: `${root.competency} · Follow-up`, prompt: proposal.prompt,
    intent: proposal.rationale, hints: [],
    rubric: { version: "generated-follow-up-v1", expectedConcepts: [...proposal.expectedConcepts], commonPitfalls: [] },
  };
}
