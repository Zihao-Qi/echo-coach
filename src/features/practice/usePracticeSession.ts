"use client";

import { useEffect, useRef, useState } from "react";
import { starterQuestions } from "../../content/questions/starter-bank";
import { orderAttempts } from "../../domain/interview/attempt-order";
import { completedAttempt, type AttemptRecord } from "../../domain/interview/attempt-record";
import { makeFollowUpQuestion } from "../../domain/interview/follow-up";
import type { AnswerAttempt, InterviewQuestion, InterviewTrack } from "../../domain/interview/practice";
import {
  buildArchivedRootGroups,
  buildSavedFollowUpGroups,
  deriveFollowUpQuestionFromRecord,
  inferRootQuestionIdForFollowUp,
  isValidRootSnapshot,
  resolveHistoricalRootQuestion,
  type PracticeTarget,
  type SavedFollowUpGroup,
} from "./practiceTarget";
import { useAttemptBaseline } from "./useAttemptBaseline";
import type { usePracticeAccess } from "./usePracticeAccess";
import { usePracticeHistory } from "./usePracticeHistory";

type SubmissionCache = {
  submissionId: string;
  questionId: string;
  followUpOfAttemptId?: string;
  previousAttemptId?: string;
  answer: string;
};

export function usePracticeSession({
  access,
  initialTrack,
}: {
  access: ReturnType<typeof usePracticeAccess>;
  initialTrack: InterviewTrack;
}) {
  const history = usePracticeHistory(access.headers);
  const [selectedAttempt, setSelectedAttempt] = useState<AnswerAttempt | null>(null);

  const loadedAttempts = history.records
    .map(completedAttempt)
    .filter((item): item is AnswerAttempt => !!item);
  const attempts = orderAttempts(
    selectedAttempt && !loadedAttempts.some((attempt) => attempt.id === selectedAttempt.id)
      ? [...loadedAttempts, selectedAttempt]
      : loadedAttempts,
  );

  const initialStarter =
    starterQuestions.find((item) => item.track === initialTrack) ?? starterQuestions[0];
  const [track, setTrack] = useState<InterviewTrack>(initialTrack);
  const [target, setTarget] = useState<PracticeTarget>({
    kind: "root",
    questionId: initialStarter.id,
    rootQuestionId: initialStarter.id,
  });
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [hintCount, setHintCount] = useState(0);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusAnnouncement, setStatusAnnouncement] = useState<string>("");

  const requestRef = useRef<AbortController | null>(null);
  const submissionCacheRef = useRef<Record<string, SubmissionCache>>({});
  const questionHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const answerTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => () => requestRef.current?.abort(), []);

  const activeQuestionId = target.questionId;
  const questionAttempts = attempts.filter((attempt) => attempt.questionId === activeQuestionId);
  const latest =
    (selectedAttempt?.questionId === activeQuestionId
      ? questionAttempts.find((attempt) => attempt.id === selectedAttempt.id)
      : undefined) ?? questionAttempts.at(-1);

  const parentSourceBaseline = useAttemptBaseline(
    target.kind === "followup" ? target.followUpOfAttemptId : undefined,
    history.records,
    access.headers,
  );
  const parentRecord = parentSourceBaseline.record;

  const effectiveRootQuestionId =
    target.kind === "followup"
      ? inferRootQuestionIdForFollowUp(
          {
            questionId: target.questionId,
            rootQuestionId: target.rootQuestionId || undefined,
            followUpOfAttemptId: target.followUpOfAttemptId,
          },
          parentRecord,
          target.rootSnapshot,
        )
      : target.rootQuestionId;

  const verifiedSourceSnapshot =
    target.kind === "followup"
      ? isValidRootSnapshot(parentRecord?.questionSnapshot, effectiveRootQuestionId)
        ? parentRecord.questionSnapshot
        : isValidRootSnapshot(target.rootSnapshot, effectiveRootQuestionId)
          ? target.rootSnapshot
          : undefined
      : undefined;

  const rootQuestionForReturn =
    target.kind === "followup"
      ? verifiedSourceSnapshot ??
        (parentSourceBaseline.loading
          ? undefined
          : resolveHistoricalRootQuestion(
              effectiveRootQuestionId,
              history.records,
              undefined,
              parentRecord?.questionSnapshot,
            ))
      : undefined;

  const displayedQuestion: InterviewQuestion =
    target.kind === "followup"
      ? (latest?.questionSnapshot ?? target.question)
      : (latest?.questionSnapshot ??
        resolveHistoricalRootQuestion(
          target.rootQuestionId,
          history.records,
          target.snapshotFallback,
        ) ??
        initialStarter);

  const answer = drafts[activeQuestionId] ?? "";
  const baseline = useAttemptBaseline(latest?.previousAttemptId, history.records, access.headers);
  const previous = baseline.record;

  const savedFollowUpGroups = buildSavedFollowUpGroups(attempts, history.records);
  const archivedRootGroups = buildArchivedRootGroups(attempts);

  function focusQuestionHeading(announcement?: string) {
    if (announcement) setStatusAnnouncement(announcement);
    requestAnimationFrame(() => {
      questionHeadingRef.current?.focus();
    });
  }

  function setDraftForActiveQuestion(value: string) {
    setDrafts((current) => ({
      ...current,
      [activeQuestionId]: value,
    }));
  }

  function selectTrack(nextTrack: InterviewTrack) {
    if (pending) return;
    setTrack(nextTrack);
    const firstInTrack = starterQuestions.find((q) => q.track === nextTrack);
    if (firstInTrack) {
      chooseQuestion(firstInTrack.id);
    }
  }

  function chooseQuestion(id: string, snapshotFallback?: InterviewQuestion) {
    if (pending) return;
    const resolved = resolveHistoricalRootQuestion(id, history.records, snapshotFallback);
    if (resolved) setTrack(resolved.track);
    setTarget({
      kind: "root",
      questionId: id,
      rootQuestionId: id,
      snapshotFallback: resolved,
    });
    const existingAttempts = attempts.filter((a) => a.questionId === id);
    const latestForRoot = existingAttempts.at(-1);
    if (snapshotFallback && latestForRoot) {
      setDrafts((current) =>
        current[id] !== undefined ? current : { ...current, [id]: latestForRoot.answer },
      );
    }
    setHintCount(0);
    setError(null);
    setSelectedAttempt(null);
    if (resolved) {
      focusQuestionHeading(`Selected question: ${resolved.prompt}`);
    }
  }

  function openFollowUpFromAttempt(sourceAttempt: AnswerAttempt) {
    if (pending || sourceAttempt.followUpOfAttemptId || !sourceAttempt.evaluation.followUp) return;
    const rootId = sourceAttempt.rootQuestionId ?? sourceAttempt.questionId;
    const exactSourceSnapshot = isValidRootSnapshot(sourceAttempt.questionSnapshot, rootId)
      ? sourceAttempt.questionSnapshot
      : undefined;
    const baseRoot =
      exactSourceSnapshot ??
      resolveHistoricalRootQuestion(rootId, history.records) ??
      displayedQuestion;
    const followUpQuestion = makeFollowUpQuestion(
      baseRoot,
      sourceAttempt.id,
      sourceAttempt.evaluation.followUp,
    );
    setTrack(baseRoot.track);
    setTarget({
      kind: "followup",
      questionId: followUpQuestion.id,
      rootQuestionId: rootId,
      followUpOfAttemptId: sourceAttempt.id,
      question: followUpQuestion,
      rootSnapshot: exactSourceSnapshot,
    });
    setHintCount(0);
    setError(null);
    setSelectedAttempt(null);
    focusQuestionHeading(`Opened follow-up question: ${followUpQuestion.prompt}`);
  }

  function openSavedFollowUpGroup(group: SavedFollowUpGroup) {
    if (pending) return;
    const question = group.latestAttempt.questionSnapshot ?? group.question;
    setTrack(question.track);
    setTarget({
      kind: "followup",
      questionId: group.questionId,
      rootQuestionId: group.rootQuestionId,
      followUpOfAttemptId: group.followUpOfAttemptId,
      question,
      rootSnapshot: group.rootSnapshot,
    });
    setDrafts((current) =>
      current[group.questionId] !== undefined
        ? current
        : { ...current, [group.questionId]: group.latestAttempt.answer },
    );
    setHintCount(0);
    setError(null);
    setSelectedAttempt(group.latestAttempt);
    focusQuestionHeading(`Opened saved follow-up: ${question.prompt}`);
  }

  function returnToRootQuestion() {
    if (pending || target.kind !== "followup" || !rootQuestionForReturn || !effectiveRootQuestionId)
      return;
    setTrack(rootQuestionForReturn.track);
    setTarget({
      kind: "root",
      questionId: effectiveRootQuestionId,
      rootQuestionId: effectiveRootQuestionId,
      snapshotFallback: rootQuestionForReturn,
    });
    setHintCount(0);
    setError(null);
    const parentAttempt =
      attempts.find((a) => a.id === target.followUpOfAttemptId) ??
      (parentRecord ? completedAttempt(parentRecord) : null);
    setSelectedAttempt(parentAttempt ?? null);
    focusQuestionHeading(`Returned to original question: ${rootQuestionForReturn.prompt}`);
  }

  function recover(record: AttemptRecord) {
    if (pending) return;
    if (record.followUpOfAttemptId) {
      const derived = deriveFollowUpQuestionFromRecord(
        record,
        history.records,
        parentRecord?.id === record.followUpOfAttemptId ? parentRecord : undefined,
      );
      if (!derived || !derived.rootQuestionId) {
        setError(
          "Could not reopen this saved follow-up because its question snapshot or parent context is unavailable.",
        );
        return;
      }
      setTrack(derived.question.track);
      setTarget({
        kind: "followup",
        questionId: record.questionId,
        rootQuestionId: derived.rootQuestionId,
        followUpOfAttemptId: record.followUpOfAttemptId,
        question: derived.question,
        rootSnapshot: derived.rootSnapshot,
      });
      setHintCount(0);
      setError(null);
      setSelectedAttempt(null);
      setDrafts((items) => ({ ...items, [record.questionId]: record.answer }));
      submissionCacheRef.current[record.questionId] = {
        submissionId: record.id,
        questionId: derived.rootQuestionId,
        followUpOfAttemptId: record.followUpOfAttemptId,
        previousAttemptId: record.previousAttemptId,
        answer: record.answer,
      };
      focusQuestionHeading(`Reopened saved follow-up answer for ${derived.question.competency}`);
      return;
    }

    const rootId = record.rootQuestionId ?? record.questionId;
    const savedQuestion = resolveHistoricalRootQuestion(
      rootId,
      history.records,
      record.questionSnapshot,
    );
    if (!savedQuestion) {
      setError(
        "Could not reopen this saved answer because its original question snapshot is unavailable.",
      );
      return;
    }
    setTrack(savedQuestion.track);
    setTarget({
      kind: "root",
      questionId: rootId,
      rootQuestionId: rootId,
      snapshotFallback: savedQuestion,
    });
    setHintCount(0);
    setError(null);
    setSelectedAttempt(null);
    setDrafts((items) => ({ ...items, [rootId]: record.answer }));
    submissionCacheRef.current[rootId] = {
      submissionId: record.id,
      questionId: rootId,
      previousAttemptId: record.previousAttemptId,
      answer: record.answer,
    };
    focusQuestionHeading(`Reopened saved answer for ${savedQuestion.competency}`);
  }

  async function submit() {
    if (pending || history.loading || answer.trim().length < 20) return;
    const rootQuestionIdForSubmit =
      target.kind === "followup" ? effectiveRootQuestionId : target.rootQuestionId;
    if (!rootQuestionIdForSubmit) {
      setError("Cannot submit follow-up because the original root question ID is unavailable.");
      return;
    }
    const controller = new AbortController();
    requestRef.current = controller;
    setPending(true);
    setError(null);
    try {
      const followUpOfAttemptId =
        target.kind === "followup" ? target.followUpOfAttemptId : undefined;
      let cached = submissionCacheRef.current[activeQuestionId];
      if (
        !cached ||
        cached.questionId !== rootQuestionIdForSubmit ||
        cached.followUpOfAttemptId !== followUpOfAttemptId ||
        cached.answer !== answer
      ) {
        cached = {
          submissionId: crypto.randomUUID(),
          questionId: rootQuestionIdForSubmit,
          followUpOfAttemptId,
          previousAttemptId: latest?.id,
          answer,
        };
        submissionCacheRef.current[activeQuestionId] = cached;
      }
      const payloadBody: {
        submissionId: string;
        questionId: string;
        answer: string;
        followUpOfAttemptId?: string;
        previousAttemptId?: string;
      } = {
        submissionId: cached.submissionId,
        questionId: cached.questionId,
        answer: cached.answer,
        ...(cached.followUpOfAttemptId
          ? { followUpOfAttemptId: cached.followUpOfAttemptId }
          : {}),
        ...(cached.previousAttemptId
          ? { previousAttemptId: cached.previousAttemptId }
          : {}),
      };
      const response = await fetch("/api/practice/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await access.headers()) },
        body: JSON.stringify(payloadBody),
        signal: controller.signal,
      });
      const payload = (await response.json()) as { attempt?: AnswerAttempt; error?: string };
      if (!response.ok || !payload.attempt) throw new Error(payload.error || "Evaluation failed.");
      history.upsert({ ...payload.attempt, status: "completed" });
      setSelectedAttempt(payload.attempt);
      delete submissionCacheRef.current[activeQuestionId];
    } catch (cause) {
      if (!controller.signal.aborted) {
        setError(cause instanceof Error ? cause.message : "Please try again.");
        await history.load(controller.signal);
      }
    } finally {
      if (!controller.signal.aborted) setPending(false);
    }
  }

  const canShowFollowUpCard =
    target.kind === "root" &&
    !!latest &&
    !latest.followUpOfAttemptId &&
    !!latest.evaluation.followUp;

  const hasUnsentDraftChanges =
    !!latest && answer.trim().length > 0 && answer.trim() !== latest.answer.trim();

  function getDraftForQuestion(questionId: string): string {
    return drafts[questionId] ?? "";
  }

  return {
    history,
    attempts,
    track,
    target,
    displayedQuestion,
    answer,
    hintCount,
    pending,
    error,
    statusAnnouncement,
    questionAttempts,
    latest,
    baseline,
    previous,
    parentSourceBaseline,
    parentRecord,
    rootQuestionForReturn,
    savedFollowUpGroups,
    archivedRootGroups,
    canShowFollowUpCard,
    hasUnsentDraftChanges,
    questionHeadingRef,
    answerTextareaRef,
    getDraftForQuestion,
    setHintCount,
    setSelectedAttempt,
    setDraftForActiveQuestion,
    selectTrack,
    chooseQuestion,
    openFollowUpFromAttempt,
    openSavedFollowUpGroup,
    returnToRootQuestion,
    recover,
    submit,
  };
}
