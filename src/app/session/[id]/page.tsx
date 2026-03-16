"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useCoachSession } from "../../../providers/CoachProvider";

export default function SessionPage() {
  const router = useRouter();
  const params = useParams();
  const {
    session,
    status,
    isMockMode,
    isRecordingAnswer,
    latestCoachingTurn,
    agentPrompt,
    isPlayingPractice,
    isPreparingPracticeAudio,
    isLoadingNextQuestion,
    isEndingSession,
    beginAnswerRecording,
    coachCurrentAnswer,
    playPracticeLine,
    requestNextQuestion,
    endSession,
  } = useCoachSession();
  const routeSessionId = Array.isArray(params?.id) ? params.id[0] : params?.id;

  useEffect(() => {
    if (!session && status === "idle") {
      router.replace("/");
      return;
    }

    if (session && routeSessionId && session.sessionId !== routeSessionId) {
      router.replace("/");
      return;
    }

    if (status === "recap" && session) {
      router.replace(`/session/${session.sessionId}/recap`);
    }
  }, [routeSessionId, router, session, status]);

  if (!session) {
    return <div className="p-8 text-center">Loading session...</div>;
  }

  const currentQuestion = agentPrompt || session.currentQuestion || session.openingQuestion;
  const hasMoreQuestions = session.questionIndex < session.questionLimit;

  const statusColors: Record<string, string> = {
    connecting: "bg-yellow-500",
    prompting: "bg-amber-500 animate-pulse",
    ready: "bg-slate-500",
    listening: "bg-green-500 animate-pulse",
    analyzing: "bg-blue-500 animate-pulse",
    ready_to_practice: "bg-indigo-500",
    error: "bg-red-500",
  };

  const statusLabels: Record<string, string> = {
    connecting: "Connecting...",
    prompting: "Asking question...",
    ready: "Ready to answer",
    listening: "Listening...",
    analyzing: "Analyzing answer...",
    ready_to_practice: "Ready to Practice",
    error: "Error",
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">
              Echo Coach
            </p>
            <h1 className="mt-2 text-xl font-semibold text-gray-900">Interview Practice</h1>
          </div>
          <div className="flex items-center gap-2 rounded-full border bg-gray-50 px-3 py-1">
            <div className={`h-3 w-3 rounded-full ${statusColors[status] || "bg-gray-400"}`}></div>
            <span className="text-sm font-medium text-gray-700">
              {statusLabels[status] || status}
            </span>
          </div>
        </div>
      </header>

      <main className="px-6 py-6">
        <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[1.04fr_0.96fr]">
          <section className="space-y-6">
            <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Current Question
              </p>
              <p className="mt-3 text-sm font-medium text-slate-500">
                Question {session.questionIndex} of {session.questionLimit}
              </p>
              <h2 className="mt-3 text-3xl font-semibold leading-tight text-gray-900">
                {currentQuestion}
              </h2>
              <p className="mt-4 text-sm leading-7 text-gray-600">
                You can listen or skip ahead at any time. When you want to answer, start
                recording and ask Echo Coach to rewrite your response.
              </p>
              <div className="mt-6 rounded-2xl bg-slate-950 p-5 text-sm text-slate-200">
                {isMockMode ? (
                  <p>
                    Mock mode is active. The coaching step will use a deterministic sample answer so the UI stays testable.
                  </p>
                ) : (
                  <p>
                    The live session handles the spoken interviewer. Start recording when you are ready to answer, then ask for coaching after you finish speaking.
                  </p>
                )}
              </div>
            </div>

            <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Session Flow
              </p>
              <div className="mt-4 space-y-3 text-sm text-gray-700">
                <p>1. Listen to the interview question.</p>
                <p>2. Tap <span className="font-medium">Start recording answer</span>.</p>
                <p>3. Deliver your answer out loud.</p>
                <p>4. Tap <span className="font-medium">Coach this answer</span>.</p>
                <p>5. Review the rewritten answer and confidence guidance.</p>
                <p>6. Tap <span className="font-medium">Play polished version</span>.</p>
                <p>7. Skip ahead whenever you want.</p>
              </div>
            </div>
          </section>

          <section className="space-y-6">
            <div className="rounded-3xl border border-indigo-100 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-600">
                    Latest Coaching
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold text-gray-900">
                    {latestCoachingTurn ? "Polished answer ready" : "Waiting for a coached answer"}
                  </h2>
                </div>
                <div
                  className={`flex h-14 w-14 items-center justify-center rounded-full ${
                    status === "ready_to_practice"
                      ? "bg-indigo-100 text-indigo-700"
                      : status === "analyzing"
                      ? "bg-blue-100 text-blue-700"
                      : "bg-gray-100 text-gray-500"
                  }`}
                >
                  <span className="text-2xl">🗣️</span>
                </div>
              </div>

              {!latestCoachingTurn ? (
                <div className="mt-5 rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-5 text-sm leading-7 text-gray-500">
                  Finish an answer and tap the coaching button to generate a polished version, targeted feedback, and a role-aware highlight card.
                </div>
              ) : (
                <div className="mt-5 space-y-5">
                  <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">
                      Original transcript
                    </p>
                    <p className="mt-2 text-sm leading-7 text-gray-700">
                      <span data-testid="original-transcript">
                        {latestCoachingTurn.originalTranscript}
                      </span>
                    </p>
                  </div>

                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="max-w-2xl">
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
                          Polished answer
                        </p>
                        <p className="mt-2 text-lg font-medium leading-8 text-gray-900">
                          <span data-testid="polished-answer">
                            {latestCoachingTurn.polishedAnswer}
                          </span>
                        </p>
                        <p className="mt-3 text-xs leading-6 text-emerald-900/80">
                          Hear the stronger spoken version as soon as you are ready to practice it.
                        </p>
                      </div>
                      <button
                        onClick={playPracticeLine}
                        disabled={
                          isPlayingPractice ||
                          isPreparingPracticeAudio ||
                          isLoadingNextQuestion ||
                          isEndingSession
                        }
                        className="min-w-[11.5rem] rounded-xl bg-emerald-200 px-4 py-3 text-center text-sm font-medium text-emerald-950 shadow-sm transition-colors hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {isPlayingPractice
                          ? "Playing..."
                          : isPreparingPracticeAudio
                          ? "Preparing playback..."
                          : "Play polished version"}
                      </button>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-gray-200 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">
                      Improvement tags
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {latestCoachingTurn.improvementTags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full bg-indigo-100 px-3 py-1 text-xs font-medium text-indigo-700"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                      Coach note
                    </p>
                    <p className="mt-2 text-sm leading-7 text-gray-700">
                      {latestCoachingTurn.coachMessage}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>
      </main>

      <footer className="border-t border-gray-200 bg-white px-6 py-6">
        <div className="mx-auto grid max-w-6xl items-center gap-4 lg:grid-cols-[minmax(0,1fr)_auto]">
          <div className="min-w-0 max-w-3xl text-sm text-gray-500">
            {isEndingSession ? (
              <span>Building your recap card and saving the session...</span>
            ) : status === "analyzing" ? (
              <span>Analyzing your answer and preparing the spoken rewrite…</span>
            ) : status === "prompting" ? (
              <span>
                The interviewer is asking the question. Start recording at any point if
                you want to answer immediately.
              </span>
            ) : status === "ready" ? (
              <span>
                The question has finished. Start recording whenever you are ready to
                answer.
              </span>
            ) : isRecordingAnswer ? (
              <span>
                Recording your answer now. When you finish speaking, ask for coaching.
              </span>
            ) : isLoadingNextQuestion ? (
              <span>Loading the next interview question…</span>
            ) : status === "ready_to_practice" ? (
              <span>
                Polished answer ready. Play it back or skip to the next question whenever you want.
              </span>
            ) : (
              <span>You can skip to the next question at any time.</span>
            )}
          </div>

          <div className="flex flex-wrap gap-3 lg:justify-self-end">
            {!isMockMode && (
              <button
                onClick={beginAnswerRecording}
                disabled={
                  status === "connecting" ||
                  status === "analyzing" ||
                  isRecordingAnswer ||
                  isPlayingPractice ||
                  isLoadingNextQuestion ||
                  isEndingSession
                }
                className="min-w-[12rem] rounded-xl bg-slate-900 px-5 py-3 text-center text-sm font-medium text-white shadow-sm transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isRecordingAnswer ? "Recording answer..." : "Start recording answer"}
              </button>
            )}
            <button
              onClick={coachCurrentAnswer}
              disabled={
                status === "connecting" ||
                status === "analyzing" ||
                isLoadingNextQuestion ||
                isEndingSession ||
                (!isMockMode && !isRecordingAnswer)
              }
              className="min-w-[10.5rem] rounded-xl bg-blue-600 px-5 py-3 text-center text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {status === "analyzing" ? "Coaching..." : "Coach this answer"}
            </button>
            <button
              onClick={requestNextQuestion}
              disabled={
                !hasMoreQuestions ||
                isLoadingNextQuestion ||
                status === "connecting" ||
                isEndingSession
              }
              className="min-w-[10.5rem] rounded-xl bg-amber-100 px-5 py-3 text-center text-sm font-medium text-amber-800 shadow-sm transition-colors hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isLoadingNextQuestion
                ? "Loading question..."
                : hasMoreQuestions
                ? "Next question"
                : "Final question reached"}
            </button>
            <button
              onClick={endSession}
              disabled={
                status === "connecting" ||
                status === "analyzing" ||
                isLoadingNextQuestion ||
                isEndingSession
              }
              className="min-w-[9rem] rounded-xl bg-red-100 px-5 py-3 text-center text-sm font-medium text-red-700 shadow-sm transition-colors hover:bg-red-200 disabled:opacity-50"
            >
              {isEndingSession ? "Building recap..." : "End Session"}
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
