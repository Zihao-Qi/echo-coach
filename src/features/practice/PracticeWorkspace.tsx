"use client";

import Link from "next/link";
import { starterQuestions } from "../../content/questions/starter-bank";
import type { AttemptRecord } from "../../domain/interview/attempt-record";
import type { AnswerAttempt, InterviewQuestion, InterviewTrack } from "../../domain/interview/practice";
import { VoiceAnswerPanel } from "./audio/VoiceAnswerPanel";
import { useVoiceRecording } from "./audio/useVoiceRecording";
import { FollowUpContextBanner } from "./FollowUpContextBanner";
import { PracticeFeedback } from "./PracticeFeedback";
import { describeIncompleteRecord, type SavedFollowUpGroup } from "./practiceTarget";
import { usePracticeAccess } from "./usePracticeAccess";
import { usePracticeSession } from "./usePracticeSession";

const tracks: { id: InterviewTrack; label: string }[] = [
  { id: "behavioral", label: "Behavioral" },
  { id: "swe", label: "Software engineering" },
  { id: "ai-ml", label: "AI / ML" },
];

const button =
  "rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600";

export function PracticeWorkspace({
  initialTrack = "behavioral",
}: {
  initialTrack?: InterviewTrack;
}) {
  const access = usePracticeAccess();
  if (!access.ready)
    return (
      <main className="mx-auto mt-16 max-w-xl rounded-2xl border border-slate-200 bg-white p-8">
        <p className="text-sm font-bold text-indigo-600">Echo Coach</p>
        <h1 className="mt-3 text-3xl font-bold">Your private practice space.</h1>
        <p className="mt-4 text-slate-600">
          {access.mode === "loading"
            ? "Initializing practice…"
            : "Sign in with your authorized Google account to practice privately. The workspace will show whether history is stored durably or in preview memory."}
        </p>
        {access.error && (
          <p role="alert" className="mt-4 text-red-700">
            {access.error}
          </p>
        )}
        {access.mode === "authjs" && (
          <button className={`${button} mt-6`} onClick={() => void access.login()}>
            Sign in with Google
          </button>
        )}
      </main>
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
  } = session;

  const voice = useVoiceRecording({
    activeQuestionId: target.questionId,
    transcriptionAccess: access.transcription,
    getHeaders: access.headers,
    getCurrentDraft: () => session.getDraftForQuestion(target.questionId),
    applyDraft: (value) => session.setDraftForActiveQuestion(value),
    focusAnswerTextarea: () => answerTextareaRef.current?.focus(),
  });

  const hardLocked = pending || voice.isHardLocked;
  const submitBlockedByVoice = voice.isHardLocked || voice.hasUnappliedVoiceState;

  function runGuardedNavigation(action: () => void) {
    if (hardLocked) return;
    if (!voice.confirmDiscardIfNeeded()) return;
    action();
  }

  function handleSelectTrack(nextTrack: InterviewTrack) {
    if (hardLocked) return;
    const firstInTrack = starterQuestions.find((q) => q.track === nextTrack);
    if (firstInTrack && target.kind === "root" && target.questionId === firstInTrack.id && track === nextTrack) {
      return;
    }
    runGuardedNavigation(() => session.selectTrack(nextTrack));
  }

  function handleChooseQuestion(id: string, snapshotFallback?: InterviewQuestion) {
    if (hardLocked) return;
    if (target.kind === "root" && target.questionId === id) {
      return;
    }
    runGuardedNavigation(() => session.chooseQuestion(id, snapshotFallback));
  }

  function handleOpenFollowUpFromAttempt(sourceAttempt: AnswerAttempt) {
    if (hardLocked) return;
    runGuardedNavigation(() => session.openFollowUpFromAttempt(sourceAttempt));
  }

  function handleOpenSavedFollowUpGroup(group: SavedFollowUpGroup) {
    if (hardLocked) return;
    if (target.kind === "followup" && target.questionId === group.questionId) {
      return;
    }
    runGuardedNavigation(() => session.openSavedFollowUpGroup(group));
  }

  function handleReturnToRootQuestion() {
    if (hardLocked) return;
    runGuardedNavigation(() => session.returnToRootQuestion());
  }

  function handleRecoverRecord(record: AttemptRecord) {
    if (hardLocked) return;
    const targetQuestionId = record.followUpOfAttemptId
      ? record.questionId
      : (record.rootQuestionId ?? record.questionId);
    if (!voice.confirmDiscardIfNeeded()) return;
    const existingDraft = session.getDraftForQuestion(targetQuestionId);
    if (
      existingDraft.trim().length > 0 &&
      existingDraft !== record.answer &&
      typeof window !== "undefined"
    ) {
      const confirmed = window.confirm(
        "Replace your current unsent draft for this question with the reopened saved answer?",
      );
      if (!confirmed) return;
    }
    session.recover(record);
  }

  return (
    <div className="min-h-screen bg-[#f6f7fb] px-4 py-6 text-slate-900 sm:px-8">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-5">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-indigo-600">
              Echo Coach / Practice lab
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight">Build a better answer.</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              className={`${button} ${hardLocked ? "pointer-events-none opacity-50" : ""}`}
              href="/"
              aria-disabled={hardLocked}
              tabIndex={hardLocked ? -1 : undefined}
              onClick={(event) => {
                if (hardLocked) {
                  event.preventDefault();
                  return;
                }
                if (!voice.confirmDiscardIfNeeded()) {
                  event.preventDefault();
                }
              }}
              onKeyDown={(event) => {
                if (hardLocked && (event.key === "Enter" || event.key === " ")) {
                  event.preventDefault();
                }
              }}
            >
              Home
            </Link>
            <Link
              className={`${button} ${hardLocked ? "pointer-events-none opacity-50" : ""}`}
              href="/legacy"
              aria-disabled={hardLocked}
              tabIndex={hardLocked ? -1 : undefined}
              onClick={(event) => {
                if (hardLocked) {
                  event.preventDefault();
                  return;
                }
                if (!voice.confirmDiscardIfNeeded()) {
                  event.preventDefault();
                }
              }}
              onKeyDown={(event) => {
                if (hardLocked && (event.key === "Enter" || event.key === " ")) {
                  event.preventDefault();
                }
              }}
            >
              Original voice demo
            </Link>
            {access.user && (
              <button
                className={button}
                disabled={hardLocked}
                onClick={() => runGuardedNavigation(() => void access.logout())}
              >
                Sign out
              </button>
            )}
          </div>
        </header>
        <p className="my-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {access.storage === "memory"
            ? `${access.mode === "demo" ? "Demo" : "Google sign-in preview"} · Submitted history lives in this server process only and is lost on restart; cross-device durability is not enabled.`
            : "Private practice · Submitted answers are saved to your account before evaluation. Drafts are not saved until submitted."}{" "}
          {access.mockEvaluation &&
            "Feedback is illustrative, not a correctness assessment. No Gemini requests are made."}
        </p>
        {access.localGemini && (
          <p className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
            Local Gemini is enabled. Requests may incur charges. Limit: 10 provider attempts per
            server process; restarting resets the counter. History is not durable. Keep this server
            bound to localhost.
          </p>
        )}
        {history.error && (
          <p role="alert" className="mb-4 rounded-xl bg-red-50 p-4 text-sm text-red-800">
            {history.error}{" "}
            <button disabled={hardLocked} className="underline" onClick={() => void history.load()}>
              Reload history
            </button>
          </p>
        )}
        <nav aria-label="Interview track" className="mb-6 flex flex-wrap gap-2">
          {tracks.map((item) => (
            <button
              key={item.id}
              aria-pressed={track === item.id}
              disabled={hardLocked}
              className={`${button} ${track === item.id ? "border-indigo-600 bg-indigo-50 text-indigo-700" : "bg-white"}`}
              onClick={() => handleSelectTrack(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <main className="grid items-start gap-6 lg:grid-cols-[220px_1fr]">
          <aside className="space-y-5 rounded-2xl border border-slate-200 bg-white p-4">
            <div>
              <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-slate-500">
                Starter questions
              </h2>
              <div className="flex flex-col gap-2">
                {starterQuestions
                  .filter((q) => q.track === track)
                  .map((q) => {
                    const rootCount = attempts.filter(
                      (a) => !a.followUpOfAttemptId && a.questionId === q.id,
                    ).length;
                    const followUpCount = attempts.filter(
                      (a) => a.followUpOfAttemptId && (a.rootQuestionId ?? a.questionId) === q.id,
                    ).length;
                    const isActiveRoot = target.kind === "root" && target.questionId === q.id;
                    return (
                      <button
                        key={q.id}
                        disabled={hardLocked}
                        aria-pressed={isActiveRoot}
                        onClick={() => handleChooseQuestion(q.id)}
                        className={`rounded-xl p-3 text-left text-sm disabled:cursor-not-allowed disabled:opacity-50 ${isActiveRoot ? "bg-indigo-50 font-bold text-indigo-700" : "hover:bg-slate-50"}`}
                      >
                        {q.competency}
                        <span className="mt-1 block text-xs font-normal text-slate-500">
                          {rootCount} attempts
                          {followUpCount > 0 ? ` · ${followUpCount} follow-up` : ""}
                        </span>
                      </button>
                    );
                  })}
              </div>
            </div>
            {archivedRootGroups.length > 0 && (
              <div className="border-t border-slate-100 pt-4">
                <h2 className="mb-2 text-xs font-bold uppercase tracking-widest text-slate-500">
                  Archived questions
                </h2>
                <div className="flex flex-col gap-2">
                  {archivedRootGroups.map((entry) => {
                    const isActive =
                      target.kind === "root" && target.questionId === entry.rootQuestionId;
                    return (
                      <button
                        key={entry.rootQuestionId}
                        disabled={hardLocked}
                        aria-pressed={isActive}
                        onClick={() =>
                          handleChooseQuestion(entry.rootQuestionId, entry.question)
                        }
                        className={`rounded-xl p-3 text-left text-sm disabled:cursor-not-allowed disabled:opacity-50 ${isActive ? "bg-indigo-50 font-bold text-indigo-700" : "hover:bg-slate-50"}`}
                      >
                        {entry.question.competency}
                        <span className="mt-1 block text-xs font-normal text-slate-500">
                          {entry.attempts.length} saved attempts
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            {savedFollowUpGroups.length > 0 && (
              <div className="border-t border-slate-100 pt-4">
                <h2 className="mb-2 text-xs font-bold uppercase tracking-widest text-slate-500">
                  Saved follow-ups
                </h2>
                <div className="flex flex-col gap-2">
                  {savedFollowUpGroups.map((group, index) => {
                    const isActive =
                      target.kind === "followup" && target.questionId === group.questionId;
                    return (
                      <button
                        key={group.questionId}
                        aria-label={`Open saved follow-up ${index + 1}: ${group.question.competency} — ${group.question.prompt}`}
                        disabled={hardLocked}
                        aria-pressed={isActive}
                        onClick={() => handleOpenSavedFollowUpGroup(group)}
                        className={`rounded-xl p-3 text-left text-sm disabled:cursor-not-allowed disabled:opacity-50 ${isActive ? "bg-indigo-50 font-bold text-indigo-700" : "hover:bg-slate-50"}`}
                      >
                        <span className="block font-semibold">{group.question.competency}</span>
                        <span className="mt-1 line-clamp-2 block text-xs font-normal text-slate-600">
                          {group.question.prompt}
                        </span>
                        <span className="mt-1 block text-xs font-normal text-slate-500">
                          {group.attempts.length}{" "}
                          {group.attempts.length === 1 ? "attempt" : "attempts"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </aside>
          <div className="space-y-6">
            <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-7">
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
                  onReturnToRoot={handleReturnToRootQuestion}
                />
              )}
              <p className="text-xs font-bold uppercase tracking-widest text-indigo-600">
                {displayedQuestion.competency}
              </p>
              <h2
                ref={questionHeadingRef}
                tabIndex={-1}
                className="mt-3 text-2xl font-bold leading-snug focus:outline-none"
              >
                {displayedQuestion.prompt}
              </h2>
              <p className="mt-3 text-sm leading-6 text-slate-600">{displayedQuestion.intent}</p>
              {displayedQuestion.hints.length > 0 ? (
                <div className="my-5 border-y border-slate-100 py-4">
                  <button
                    type="button"
                    className={button}
                    disabled={hardLocked || hintCount >= displayedQuestion.hints.length}
                    onClick={() => session.setHintCount((count) => count + 1)}
                  >
                    {hintCount === 0 ? "Give me a hint" : "Reveal another hint"}
                  </button>
                  {displayedQuestion.hints.slice(0, hintCount).map((hint, index) => (
                    <p key={hint} className="mt-3 text-sm leading-6 text-indigo-800">
                      Hint {index + 1}: {hint}
                    </p>
                  ))}
                </div>
              ) : (
                <div className="my-4 border-t border-slate-100" />
              )}
              <VoiceAnswerPanel
                transcriptionAccess={access.transcription}
                voice={voice}
                evaluationPending={pending}
                hasExistingTypedDraft={answer.trim().length > 0}
              />
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  if (hardLocked || submitBlockedByVoice) return;
                  void session.submit();
                }}
              >
                <label htmlFor="practice-answer" className="text-sm font-bold">
                  Your answer
                </label>
                <textarea
                  ref={answerTextareaRef}
                  id="practice-answer"
                  value={answer}
                  disabled={hardLocked}
                  maxLength={10000}
                  onChange={(event) => session.setDraftForActiveQuestion(event.target.value)}
                  placeholder="Explain your reasoning in your own words. You do not need a perfect first attempt."
                  className="mt-2 min-h-48 w-full resize-y rounded-xl border border-slate-300 p-4 text-base leading-7 focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                  aria-describedby={
                    voice.hasUnappliedVoiceState
                      ? "answer-guidance voice-submit-guard"
                      : "answer-guidance"
                  }
                />
                {voice.hasUnappliedVoiceState && (
                  <p
                    id="voice-submit-guard"
                    className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900"
                  >
                    Apply or discard your recorded voice state above before submitting your answer
                    for feedback.
                  </p>
                )}
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                  <p id="answer-guidance" className="text-xs text-slate-500">
                    {answer.length}/10,000 characters · Minimum 20
                  </p>
                  <button
                    type="submit"
                    disabled={
                      hardLocked ||
                      submitBlockedByVoice ||
                      history.loading ||
                      answer.trim().length < 20
                    }
                    className={`${button} border-indigo-600 bg-indigo-600 text-white hover:bg-indigo-700`}
                  >
                    {pending
                      ? "Reviewing your answer…"
                      : history.loading
                        ? "Loading history…"
                        : latest
                          ? "Evaluate my retry"
                          : "Get feedback"}
                  </button>
                </div>
                {error && (
                  <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-800">
                    {error}
                  </p>
                )}
                <p role="status" className="sr-only">
                  {pending
                    ? "Evaluation in progress"
                    : statusAnnouncement || (latest ? "Feedback ready" : "Ready for your answer")}
                </p>
              </form>
            </section>
            {history.records.some((record) => record.status !== "completed") && (
              <section
                aria-label="Saved answers awaiting feedback"
                className="rounded-2xl border border-amber-200 bg-white p-5"
              >
                <h2 className="text-lg font-bold">Saved answers awaiting feedback</h2>
                <p className="mt-2 text-sm text-slate-600">
                  Your submitted evidence is preserved even if evaluation fails. Reopen an answer
                  to retry; an active evaluation may need two minutes before recovery.
                </p>
                {history.records
                  .filter((record) => record.status !== "completed")
                  .map((record) => (
                    <div
                      key={record.id}
                      className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3"
                    >
                      <p className="text-sm">{describeIncompleteRecord(record, history.records)}</p>
                      <button
                        className={button}
                        disabled={hardLocked}
                        onClick={() => handleRecoverRecord(record)}
                      >
                        Reopen saved answer
                      </button>
                    </div>
                  ))}
                <button
                  className={`${button} mt-4`}
                  disabled={hardLocked}
                  onClick={() => void history.load()}
                >
                  Refresh history
                </button>
              </section>
            )}
            {history.cursor && (
              <button
                className={button}
                disabled={hardLocked}
                onClick={() => void history.load(undefined, history.cursor!)}
              >
                Load older attempts
              </button>
            )}
            {latest && (
              <PracticeFeedback
                latest={latest}
                displayedQuestion={displayedQuestion}
                questionAttempts={questionAttempts}
                previous={previous}
                baselineLoading={baseline.loading}
                baselineError={baseline.error}
                onRetryBaseline={baseline.retry}
                pending={hardLocked}
                canShowFollowUpCard={canShowFollowUpCard}
                hasUnsentDraftChanges={hasUnsentDraftChanges}
                onAnswerFollowUp={() => handleOpenFollowUpFromAttempt(latest)}
                onRetryOriginalAnswer={() => {
                  if (hardLocked) return;
                  answerTextareaRef.current?.focus();
                }}
                onSelectAttempt={(attempt) => {
                  runGuardedNavigation(() => session.setSelectedAttempt(attempt));
                }}
              />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
