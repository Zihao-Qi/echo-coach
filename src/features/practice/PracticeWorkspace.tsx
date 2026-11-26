"use client";

import { useEffect, useRef, useState } from "react";
import {
  getDemoAudio,
  getSampleContent,
} from "../../content/questions/demo-audio";
import { AudioPlayer, stopDemoAudio } from "../AudioPlayer";
import { SessionRecap } from "./SessionRecap";
import { PUBLIC_DEMO_BUILD } from "../../infrastructure/config/public-demo";
import {
  nextStarterQuestion,
  starterQuestions,
} from "../../content/questions/starter-bank";
import {
  completedAttempt,
  type AttemptRecord,
} from "../../domain/interview/attempt-record";
import type {
  InterviewQuestion,
  InterviewTrack,
} from "../../domain/interview/practice";
import { VoiceAnswerPanel } from "./audio/VoiceAnswerPanel";
import { useVoiceRecording } from "./audio/useVoiceRecording";
import { FollowUpContextBanner } from "./FollowUpContextBanner";
import { PracticeFeedback } from "./PracticeFeedback";
import { PracticeHeader } from "../PracticeHeader";
import { QuestionSwitcher, trackLabel } from "./QuestionSwitcher";
import { describeIncompleteRecord } from "./practiceTarget";
import { usePracticeAccess } from "./usePracticeAccess";
import { usePracticeSession } from "./usePracticeSession";

export function PracticeWorkspace({
  initialTrack = "behavioral",
}: {
  initialTrack?: InterviewTrack;
}) {
  const access = usePracticeAccess();
  if (!access.ready)
    return (
      <div className="refresh">
        <div className="shell">
          <PracticeHeader page="practice" />
          <main className="panel mx-auto mt-12 max-w-xl">
            <h1 className="font-display text-3xl font-bold">
              Your private practice space.
            </h1>
            <p className="mt-4 text-body">
              {access.mode === "loading"
                ? "Initializing practice…"
                : "Sign in with your authorized Google account to practice privately. The workspace will show whether history is stored durably or in preview memory."}
            </p>
            {access.error && (
              <p role="alert" className="mt-3 text-danger">
                {access.error}
              </p>
            )}
            {!PUBLIC_DEMO_BUILD && access.mode === "authjs" && (
              <button
                className="primary mt-5"
                onClick={() => void access.login()}
              >
                Sign in with Google
              </button>
            )}
          </main>
        </div>
      </div>
    );
  return (
    <PracticeSessionView
      key={`${access.user?.id || "demo"}:${initialTrack}`}
      access={access}
      initialTrack={initialTrack}
    />
  );
}
function PracticeSessionView({
  access,
  initialTrack,
}: {
  access: ReturnType<typeof usePracticeAccess>;
  initialTrack: InterviewTrack;
}) {
  const session = usePracticeSession({ access, initialTrack });
  const {
    history,
    attempts,
    track,
    target,
    displayedQuestion: question,
    answer,
    hintCount,
    pending,
    error,
    statusAnnouncement,
    questionAttempts,
    latest,
    baseline,
    previous,
    retryCue,
    isRetry,
    parentSourceBaseline,
    parentRecord,
    rootQuestionForReturn,
    savedFollowUpGroups,
    archivedRootGroups,
    questionHeadingRef,
    answerTextareaRef,
  } = session;
  const [editing, setEditing] = useState(false);
  const [recapOpen, setRecapOpen] = useState(false);
  const recapHeading = useRef<HTMLHeadingElement>(null);
  const reloadHistory = history.load;
  useEffect(() => {
    if (!recapOpen) return;
    const controller = new AbortController();
    const refresh = () => void reloadHistory(controller.signal);
    window.addEventListener("focus", refresh);
    return () => {
      controller.abort();
      window.removeEventListener("focus", refresh);
    };
  }, [recapOpen, reloadHistory]);
  const starterId =
    target.kind === "root" &&
    starterQuestions.some((item) => item.id === target.questionId)
      ? target.questionId
      : undefined;
  const sample = starterId ? getSampleContent(starterId) : undefined;
  const questionAudio = starterId
    ? getDemoAudio(starterId, "question")
    : undefined;
  const feedbackHeading = useRef<HTMLHeadingElement>(null);
  const expanded = !latest || editing;
  const voice = useVoiceRecording({
    activeQuestionId: target.questionId,
    transcriptionAccess: access.transcription,
    sampleTranscript: sample?.sampleTranscript,
    getHeaders: access.headers,
    getCurrentDraft: () => session.getDraftForQuestion(target.questionId),
    applyDraft: session.setDraftForActiveQuestion,
    focusAnswerTextarea: () => answerTextareaRef.current?.focus(),
  });
  const hardLocked = pending || voice.isHardLocked;
  function navigate(action: () => void, edit = false) {
    if (hardLocked || !voice.confirmDiscardIfNeeded()) return;
    stopDemoAudio();
    setEditing(edit);
    action();
  }
  function chooseQuestion(id: string, snapshot?: InterviewQuestion) {
    if (target.kind === "root" && target.questionId === id) return;
    navigate(() => session.chooseQuestion(id, snapshot));
  }
  function chooseTrack(id: InterviewTrack) {
    if (
      target.kind === "root" &&
      track === id &&
      starterQuestions.find((q) => q.track === id)?.id === target.questionId
    )
      return;
    navigate(() => session.selectTrack(id));
  }
  function recover(record: AttemptRecord) {
    if (hardLocked || !voice.confirmDiscardIfNeeded()) return;
    const id = record.followUpOfAttemptId
      ? record.questionId
      : (record.rootQuestionId ?? record.questionId);
    const draft = session.getDraftForQuestion(id);
    if (
      draft.trim() &&
      draft !== record.answer &&
      !window.confirm(
        "Replace your current unsent draft for this question with the reopened saved answer?",
      )
    )
      return;
    if (session.recover(record)) {
      stopDemoAudio();
      setEditing(true);
    }
  }
  function edit() {
    if (!hardLocked) {
      setEditing(true);
      requestAnimationFrame(() => answerTextareaRef.current?.focus());
    }
  }
  const next =
    target.kind === "root" &&
    latest?.previousAttemptId &&
    !latest.followUpOfAttemptId &&
    (latest.rootQuestionId ?? latest.questionId) === target.questionId
      ? nextStarterQuestion(target.questionId)
      : undefined;
  const storage = PUBLIC_DEMO_BUILD
    ? "Use made-up examples. No personal details. History is temporary and may reset."
    : access.storage === "memory"
      ? `${access.mode === "demo" ? "Demo" : "Google sign-in preview"} · History stays in this server process and is lost on restart.`
      : "Private practice · Submitted answers are saved to your account; unsent drafts are not.";
  return (
    <div className="refresh">
      <div className="shell">
        <PracticeHeader
          page="practice"
          disabled={hardLocked}
          onNavigate={(e) => {
            if (hardLocked || !voice.confirmDiscardIfNeeded())
              e.preventDefault();
            else stopDemoAudio();
          }}
        >
          {!recapOpen &&
            history.records.some((record) => completedAttempt(record)) && (
              <button
                className="action"
                type="button"
                disabled={hardLocked}
                onClick={() => {
                  if (hardLocked || !voice.confirmDiscardIfNeeded()) return;
                  stopDemoAudio();
                  setRecapOpen(true);
                  requestAnimationFrame(() => recapHeading.current?.focus());
                }}
              >
                Session recap
              </button>
            )}
          {!PUBLIC_DEMO_BUILD && access.user && (
            <button
              className="nav-link"
              disabled={hardLocked}
              onClick={() => navigate(() => void access.logout())}
            >
              Sign out
            </button>
          )}
        </PracticeHeader>
        {recapOpen ? (
          <SessionRecap
            records={history.records}
            error={history.error}
            temporary={PUBLIC_DEMO_BUILD || access.storage === "memory"}
            hasOlder={!!history.cursor}
            loadOlder={() => {
              if (history.cursor) void history.load(undefined, history.cursor);
            }}
            headingRef={recapHeading}
            back={() => {
              stopDemoAudio();
              setRecapOpen(false);
              requestAnimationFrame(() => questionHeadingRef.current?.focus());
            }}
          />
        ) : (
          <main className="space-y-5 py-6">
            {access.localGemini && (
              <p className="panel">
                Local Gemini is enabled. Requests may incur charges. Limit: 10
                provider attempts per server process; restarting resets the
                counter. History is not durable. Keep this server bound to
                localhost.
              </p>
            )}
            {history.error && (
              <p role="alert" className="panel text-danger">
                {history.error}{" "}
                <button
                  className="action"
                  disabled={hardLocked}
                  onClick={() => void history.load()}
                >
                  Reload history
                </button>
              </p>
            )}
            <QuestionSwitcher
              track={track}
              question={question}
              attempts={attempts}
              disabled={hardLocked}
              chooseTrack={chooseTrack}
              chooseQuestion={chooseQuestion}
            />
            {archivedRootGroups.length > 0 && (
              <details className="panel">
                <summary className="cursor-pointer font-semibold">
                  Earlier questions ({archivedRootGroups.length})
                </summary>
                <div className="flex flex-wrap gap-2">
                  {archivedRootGroups.map((entry) => (
                    <button
                      key={entry.rootQuestionId}
                      className="pill"
                      aria-pressed={target.questionId === entry.rootQuestionId}
                      disabled={hardLocked}
                      onClick={() =>
                        chooseQuestion(entry.rootQuestionId, entry.question)
                      }
                    >
                      {entry.question.competency} {entry.attempts.length} saved
                      attempts
                    </button>
                  ))}
                </div>
              </details>
            )}
            {savedFollowUpGroups.length > 0 && (
              <details className="panel">
                <summary className="cursor-pointer font-semibold">
                  Saved follow-ups ({savedFollowUpGroups.length})
                </summary>
                <div className="grid gap-2">
                  {savedFollowUpGroups.map((group, i) => (
                    <button
                      key={group.questionId}
                      aria-label={`Open saved follow-up ${i + 1}: ${group.question.competency} — ${group.question.prompt}`}
                      className="pill justify-start text-left"
                      aria-pressed={target.questionId === group.questionId}
                      disabled={hardLocked}
                      onClick={() => {
                        if (target.questionId !== group.questionId)
                          navigate(() => session.openSavedFollowUpGroup(group));
                      }}
                    >
                      {group.question.competency} · {group.question.prompt} ·{" "}
                      {group.attempts.length}{" "}
                      {group.attempts.length === 1 ? "attempt" : "attempts"}
                    </button>
                  ))}
                </div>
              </details>
            )}
            {target.kind === "followup" && (
              <FollowUpContextBanner
                followUpOfAttemptId={target.followUpOfAttemptId}
                parentRecord={parentRecord}
                parentLoading={parentSourceBaseline.loading}
                parentError={parentSourceBaseline.error}
                onRetryParentLoad={parentSourceBaseline.retry}
                rootQuestion={rootQuestionForReturn}
                canReturnToRoot={!!rootQuestionForReturn}
                disabled={hardLocked}
                onReturnToRoot={() => navigate(session.returnToRootQuestion)}
              />
            )}
            <p role="status" className="sr-only">
              {pending
                ? "Evaluation in progress"
                : statusAnnouncement ||
                  (latest ? "Feedback ready" : "Ready for your answer")}
            </p>
            {error && (
              <p
                role="alert"
                className="rounded-xl bg-danger-tint p-4 text-danger"
              >
                {error}
              </p>
            )}
            {!expanded ? (
              <section className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-card p-4">
                <h1
                  ref={questionHeadingRef}
                  tabIndex={-1}
                  className="min-w-0 font-display font-bold break-words"
                >
                  <span>{question.competency}</span>
                  <span className="hidden sm:inline"> · {question.prompt}</span>
                </h1>
                <button
                  className="action shrink-0"
                  disabled={hardLocked}
                  onClick={edit}
                >
                  Edit answer
                </button>
              </section>
            ) : (
              <>
                <section className="panel">
                  <p className="eyeline">{question.competency}</p>
                  <h1
                    ref={questionHeadingRef}
                    tabIndex={-1}
                    className="mt-2 font-display text-2xl font-bold leading-snug sm:text-3xl"
                  >
                    {question.prompt}
                  </h1>
                  <p className="mt-3 text-sm leading-6 text-muted">
                    {question.intent}
                  </p>
                  {questionAudio && (
                    <AudioPlayer
                      key={questionAudio.path}
                      asset={questionAudio}
                      headingRef={questionHeadingRef}
                    />
                  )}
                  {question.hints.length > 0 && (
                    <div
                      className={
                        hintCount
                          ? "mt-4 flex flex-col items-start gap-3 rounded-xl bg-pebble p-4 sm:flex-row sm:items-center sm:justify-between"
                          : "mt-4"
                      }
                    >
                      {hintCount > 0 && (
                        <div className="space-y-2 text-sm leading-6">
                          {question.hints.slice(0, hintCount).map((hint, i) => (
                            <p key={hint}>
                              Hint {i + 1}: {hint}
                            </p>
                          ))}
                        </div>
                      )}
                      <button
                        className="action shrink-0"
                        disabled={
                          hardLocked || hintCount >= question.hints.length
                        }
                        onClick={() => session.setHintCount((n) => n + 1)}
                      >
                        {hintCount ? "Reveal another hint" : "Give me a hint"}
                      </button>
                    </div>
                  )}
                </section>
                <section className="rounded-3xl border border-line bg-card">
                  {retryCue && (
                    <section
                      aria-label="Focus for this retry"
                      className="rounded-t-3xl border-b border-line bg-canvas px-5 py-3.5 sm:px-7"
                    >
                      <p className="eyeline text-marigold">
                        {session.retryCueMode === "demo"
                          ? "Sample focus for this retry"
                          : "Focus for this retry"}
                      </p>
                      <p id="retry-focus-cue" className="mt-1 text-sm">
                        {retryCue}
                      </p>
                    </section>
                  )}
                  <form
                    className="p-5 sm:p-7"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      if (hardLocked || voice.hasUnappliedVoiceState) return;
                      stopDemoAudio();
                      setEditing(true);
                      if (await session.submit()) {
                        setEditing(false);
                        requestAnimationFrame(() =>
                          feedbackHeading.current?.focus(),
                        );
                      }
                    }}
                  >
                    {(!PUBLIC_DEMO_BUILD || sample) && (
                      <VoiceAnswerPanel
                        browserOnly={PUBLIC_DEMO_BUILD}
                        voice={voice}
                        transcriptionAccess={access.transcription}
                        evaluationPending={pending}
                        hasExistingTypedDraft={!!answer.trim()}
                      />
                    )}
                    <label
                      htmlFor="practice-answer"
                      className="block text-sm font-bold"
                    >
                      Your answer
                    </label>
                    <textarea
                      ref={answerTextareaRef}
                      id="practice-answer"
                      className="input-field mt-2 min-h-48"
                      value={answer}
                      disabled={hardLocked}
                      maxLength={10000}
                      onChange={(e) =>
                        session.setDraftForActiveQuestion(e.target.value)
                      }
                      placeholder="Explain your reasoning in your own words. You do not need a perfect first attempt."
                      aria-describedby={[
                        "answer-guidance",
                        retryCue && "retry-focus-cue",
                        voice.hasUnappliedVoiceState && "voice-submit-guard",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    />
                    {voice.hasUnappliedVoiceState && (
                      <p
                        id="voice-submit-guard"
                        className="my-2 rounded-xl bg-pebble p-3 text-sm"
                      >
                        {PUBLIC_DEMO_BUILD
                          ? "Use or discard the sample transcript before submitting your answer for feedback."
                          : "Apply or discard your recorded voice state above before submitting your answer for feedback."}
                      </p>
                    )}
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                      <p
                        className="text-xs leading-5 text-muted"
                        id="answer-guidance"
                      >
                        {storage}
                        {(answer.trim().length < 20 ||
                          answer.length >= 9000) && (
                          <span className="block">
                            {answer.length}/10,000 characters · Minimum 20
                          </span>
                        )}
                      </p>
                      <button
                        type="submit"
                        className="primary"
                        disabled={
                          hardLocked ||
                          voice.hasUnappliedVoiceState ||
                          history.loading ||
                          answer.trim().length < 20
                        }
                      >
                        {pending
                          ? "Reviewing your answer…"
                          : history.loading
                            ? "Loading history…"
                            : isRetry
                              ? "Evaluate my retry"
                              : "Get feedback"}
                      </button>
                    </div>
                  </form>
                </section>
              </>
            )}
            {history.records.some((r) => r.status !== "completed") && (
              <section
                aria-label="Saved answers awaiting feedback"
                className="panel"
              >
                <h2 className="font-display text-xl font-bold">
                  Saved answers awaiting feedback
                </h2>
                <p className="my-3 text-sm text-muted">
                  Your submitted evidence is preserved even if evaluation fails.
                  Reopen an answer to retry; an active evaluation may need two
                  minutes before recovery.
                </p>
                {history.records
                  .filter((r) => r.status !== "completed")
                  .map((r) => (
                    <div
                      key={r.id}
                      className="flex flex-wrap items-center justify-between gap-2 border-t border-line py-2"
                    >
                      <p>{describeIncompleteRecord(r, history.records)}</p>
                      <button
                        disabled={hardLocked}
                        className="action"
                        onClick={() => recover(r)}
                      >
                        Reopen saved answer
                      </button>
                    </div>
                  ))}
                <button
                  className="action"
                  disabled={hardLocked}
                  onClick={() => void history.load()}
                >
                  Refresh history
                </button>
              </section>
            )}
            {history.cursor && (
              <button
                className="action"
                disabled={hardLocked}
                onClick={() => void history.load(undefined, history.cursor!)}
              >
                Load older attempts
              </button>
            )}
            {latest && (
              <PracticeFeedback
                headingRef={feedbackHeading}
                latest={latest}
                displayedQuestion={question}
                starterId={starterId}
                questionAttempts={questionAttempts}
                previous={previous}
                baselineLoading={baseline.loading}
                baselineError={baseline.error}
                onRetryBaseline={baseline.retry}
                pending={hardLocked}
                canShowFollowUpCard={session.canShowFollowUpCard}
                hasUnsentDraftChanges={session.hasUnsentDraftChanges}
                onAnswerFollowUp={() =>
                  navigate(() => session.openFollowUpFromAttempt(latest), true)
                }
                onRetryOriginalAnswer={edit}
                onSelectAttempt={(a) => {
                  if (a.id !== latest.id)
                    navigate(() => session.setSelectedAttempt(a));
                }}
                nextQuestionLabel={
                  next &&
                  `Try another question in ${trackLabel(next.track)}: ${next.competency}`
                }
                onChooseNextQuestion={next && (() => chooseQuestion(next.id))}
              />
            )}
          </main>
        )}
      </div>
    </div>
  );
}
