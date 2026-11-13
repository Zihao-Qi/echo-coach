import type { InterviewQuestion } from "../../domain/interview/practice";
import type { AttemptRecord } from "../../domain/interview/attempt-record";
import type { AttemptRepository } from "../ports/attempt-repository";

// Resolve owner-scoped historical metadata before requiring a live catalog entry.
// Clients send IDs only; saved snapshots, not client content, are authoritative.
export async function resolveQuestionSeed(
  ownerId: string,
  input: { questionId: string; submissionId: string; previousAttemptId?: string; followUpOfAttemptId?: string },
  repository: AttemptRepository,
  fromCatalog: (id: string) => InterviewQuestion | undefined,
) {
  function rootSnapshot(record: AttemptRecord | null) {
    if (!record || (record.rootQuestionId || record.questionId) !== input.questionId) return undefined;
    const snapshot = record.questionSnapshot;
    if (snapshot?.id === input.questionId && snapshot.origin !== "follow-up") return snapshot;
    return undefined;
  }
  const ids = [...new Set([input.submissionId, input.previousAttemptId, input.followUpOfAttemptId].filter((id): id is string => !!id))];
  for (const id of ids) {
    const record = await repository.get(ownerId, id);
    const snapshot = rootSnapshot(record);
    if (snapshot) return snapshot;
    if (record?.followUpOfAttemptId && record.rootQuestionId === input.questionId) {
      const source = await repository.get(ownerId, record.followUpOfAttemptId);
      const root = rootSnapshot(source);
      if (root) return root;
      // Legacy root sources may lack snapshots. An answered follow-up still has
      // its exact focused snapshot; do not fabricate a historical root prompt.
      if (source?.questionId === input.questionId && !source.followUpOfAttemptId && record.questionSnapshot?.origin === "follow-up" && record.questionSnapshot.id === `followup:${source.id}` && record.questionId === record.questionSnapshot.id) return record.questionSnapshot;
    }
  }
  return fromCatalog(input.questionId);
}
