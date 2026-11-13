import { starterQuestions } from "../../content/questions/starter-bank";
import type { AttemptRecord } from "../../domain/interview/attempt-record";
import { makeFollowUpQuestion } from "../../domain/interview/follow-up";
import type { AnswerAttempt, InterviewQuestion } from "../../domain/interview/practice";

export type PracticeTarget =
  | {
      kind: "root";
      questionId: string;
      rootQuestionId: string;
      snapshotFallback?: InterviewQuestion;
    }
  | {
      kind: "followup";
      questionId: string;
      rootQuestionId: string;
      followUpOfAttemptId: string;
      question: InterviewQuestion;
      rootSnapshot?: InterviewQuestion;
    };

export interface SavedFollowUpGroup {
  questionId: string;
  followUpOfAttemptId: string;
  rootQuestionId: string;
  question: InterviewQuestion;
  rootSnapshot?: InterviewQuestion;
  attempts: AnswerAttempt[];
  latestAttempt: AnswerAttempt;
}

export interface ArchivedRootGroup {
  rootQuestionId: string;
  question: InterviewQuestion;
  attempts: AnswerAttempt[];
}

export function isValidRootSnapshot(
  snapshot: InterviewQuestion | undefined,
  rootQuestionId?: string,
): snapshot is InterviewQuestion {
  if (!snapshot || snapshot.origin === "follow-up") return false;
  return !rootQuestionId || snapshot.id === rootQuestionId;
}

export function resolveHistoricalRootQuestion(
  rootQuestionId: string | undefined,
  records: AttemptRecord[],
  explicitCandidate?: InterviewQuestion,
  parentCandidate?: InterviewQuestion,
): InterviewQuestion | undefined {
  if (!rootQuestionId) return undefined;

  if (isValidRootSnapshot(parentCandidate, rootQuestionId)) {
    return parentCandidate;
  }
  if (isValidRootSnapshot(explicitCandidate, rootQuestionId)) {
    return explicitCandidate;
  }
  for (const record of records) {
    if (
      !record.followUpOfAttemptId &&
      (record.rootQuestionId ?? record.questionId) === rootQuestionId &&
      isValidRootSnapshot(record.questionSnapshot, rootQuestionId)
    ) {
      return record.questionSnapshot;
    }
  }
  return starterQuestions.find((item) => item.id === rootQuestionId);
}

export function inferRootQuestionIdForFollowUp(
  record: Pick<AttemptRecord, "questionId" | "rootQuestionId" | "followUpOfAttemptId">,
  parentRecord?: Pick<AttemptRecord, "questionId" | "rootQuestionId" | "questionSnapshot">,
  explicitRootSnapshot?: InterviewQuestion,
): string | undefined {
  if (record.rootQuestionId && record.rootQuestionId !== record.questionId) {
    return record.rootQuestionId;
  }
  if (parentRecord) {
    return (
      parentRecord.rootQuestionId ??
      parentRecord.questionSnapshot?.id ??
      parentRecord.questionId
    );
  }
  if (explicitRootSnapshot && explicitRootSnapshot.origin !== "follow-up") {
    return explicitRootSnapshot.id;
  }
  if (record.rootQuestionId && !record.rootQuestionId.startsWith("followup:")) {
    return record.rootQuestionId;
  }
  if (!record.questionId.startsWith("followup:")) {
    return record.questionId;
  }
  return undefined;
}

export function deriveFollowUpQuestionFromRecord(
  record: AttemptRecord,
  records: AttemptRecord[],
  remoteParent?: AttemptRecord,
): {
  question: InterviewQuestion;
  rootQuestionId?: string;
  rootSnapshot?: InterviewQuestion;
} | null {
  const followUpOfAttemptId = record.followUpOfAttemptId;
  if (!followUpOfAttemptId) return null;

  const parentRecord =
    records.find((item) => item.id === followUpOfAttemptId) ??
    (remoteParent?.id === followUpOfAttemptId ? remoteParent : undefined);

  const rootQuestionId = inferRootQuestionIdForFollowUp(record, parentRecord);
  const verifiedParentSnapshot = isValidRootSnapshot(parentRecord?.questionSnapshot, rootQuestionId)
    ? parentRecord.questionSnapshot
    : undefined;
  const fallbackBaseRoot =
    verifiedParentSnapshot ??
    resolveHistoricalRootQuestion(rootQuestionId, records);

  if (record.questionSnapshot) {
    return {
      question: record.questionSnapshot,
      rootQuestionId,
      rootSnapshot: verifiedParentSnapshot,
    };
  }

  if (parentRecord?.evaluation?.followUp && fallbackBaseRoot) {
    return {
      question: makeFollowUpQuestion(
        fallbackBaseRoot,
        parentRecord.id,
        parentRecord.evaluation.followUp,
      ),
      rootQuestionId: fallbackBaseRoot.id,
      rootSnapshot: verifiedParentSnapshot,
    };
  }

  return null;
}

export function buildSavedFollowUpGroups(
  attempts: AnswerAttempt[],
  records: AttemptRecord[],
): SavedFollowUpGroup[] {
  const groups: SavedFollowUpGroup[] = [];
  const byQuestionId = new Map<string, SavedFollowUpGroup>();

  for (const attempt of attempts) {
    if (!attempt.followUpOfAttemptId) continue;
    const existing = byQuestionId.get(attempt.questionId);
    if (existing) {
      existing.attempts.push(attempt);
      existing.latestAttempt = attempt;
      if (attempt.questionSnapshot) {
        existing.question = attempt.questionSnapshot;
      }
      if (!existing.rootSnapshot) {
        const nextDerived = deriveFollowUpQuestionFromRecord(
          { ...attempt, status: "completed" },
          records,
        );
        if (nextDerived?.rootSnapshot) {
          existing.rootSnapshot = nextDerived.rootSnapshot;
        }
      }
      continue;
    }
    const derived = deriveFollowUpQuestionFromRecord(
      {
        ...attempt,
        status: "completed",
      },
      records,
    );
    if (!derived) continue;
    const group: SavedFollowUpGroup = {
      questionId: attempt.questionId,
      followUpOfAttemptId: attempt.followUpOfAttemptId,
      rootQuestionId: derived.rootQuestionId ?? "",
      question: attempt.questionSnapshot ?? derived.question,
      rootSnapshot: derived.rootSnapshot,
      attempts: [attempt],
      latestAttempt: attempt,
    };
    byQuestionId.set(attempt.questionId, group);
    groups.push(group);
  }

  return groups;
}

export function buildArchivedRootGroups(attempts: AnswerAttempt[]): ArchivedRootGroup[] {
  const groups: ArchivedRootGroup[] = [];
  const byRootId = new Map<string, ArchivedRootGroup>();

  for (const attempt of attempts) {
    if (attempt.followUpOfAttemptId) continue;
    const rootId = attempt.rootQuestionId ?? attempt.questionId;
    if (starterQuestions.some((q) => q.id === rootId)) continue;
    const existing = byRootId.get(rootId);
    if (existing) {
      existing.attempts.push(attempt);
      if (isValidRootSnapshot(attempt.questionSnapshot, rootId)) {
        existing.question = attempt.questionSnapshot;
      }
      continue;
    }
    if (isValidRootSnapshot(attempt.questionSnapshot, rootId)) {
      const entry: ArchivedRootGroup = {
        rootQuestionId: rootId,
        question: attempt.questionSnapshot,
        attempts: [attempt],
      };
      byRootId.set(rootId, entry);
      groups.push(entry);
    }
  }

  return groups;
}

export function describeIncompleteRecord(record: AttemptRecord, records: AttemptRecord[]): string {
  if (record.followUpOfAttemptId) {
    const derived = deriveFollowUpQuestionFromRecord(record, records);
    const label = derived?.question.competency || `${record.questionId} · Follow-up`;
    return `${label} · ${record.status}`;
  }
  const rootId = record.rootQuestionId ?? record.questionId;
  const competency =
    record.questionSnapshot?.competency ||
    starterQuestions.find((item) => item.id === rootId)?.competency ||
    record.questionId;
  return `${competency} · ${record.status}`;
}
