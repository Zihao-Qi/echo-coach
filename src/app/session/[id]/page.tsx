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
    return <div className="p-8 text-center text-slate-500 font-medium">Loading session...</div>;
  }

  const currentQuestion = agentPrompt || session.currentQuestion || session.openingQuestion;
  const hasMoreQuestions = session.questionIndex < session.questionLimit;

  const statusColors: Record<string, string> = {
    connecting: "bg-amber-400 shadow-[0_0_8px_#fbbf24]",
    prompting: "bg-amber-500 animate-pulse shadow-[0_0_8px_#f59e0b]",
    ready: "bg-slate-400 shadow-[0_0_8px_#94a3b8]",
    listening: "bg-emerald-500 animate-pulse shadow-[0_0_8px_#10b981]",
    analyzing: "bg-blue-500 animate-pulse shadow-[0_0_8px_#3b82f6]",
    ready_to_practice: "bg-indigo-500 shadow-[0_0_8px_#6366f1]",
    error: "bg-rose-500 shadow-[0_0_8px_#f43f5e]",
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
    <div className="min-h-screen bg-slate-50 nordic-grid relative overflow-hidden pb-32">
      {/* Drifting Background Ambient Pastels */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-indigo-200/40 glow-orb-1 pointer-events-none"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-rose-200/30 glow-orb-2 pointer-events-none"></div>
      <div className="absolute top-[45%] right-[15%] w-[35%] h-[35%] rounded-full bg-sky-200/30 glow-orb-1 pointer-events-none"></div>

      <header className="border-b border-indigo-100 bg-white/60 backdrop-blur-md sticky top-0 z-40 px-6 py-4">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-indigo-600">
              Echo Coach
            </p>
            <h1 className="mt-1 text-2xl font-extrabold text-slate-900 tracking-tight">Interview Practice</h1>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-indigo-100 bg-white/80 backdrop-blur-md px-3.5 py-1.5 shadow-sm">
            <div className={`h-2.5 w-2.5 rounded-full ${statusColors[status] || "bg-gray-400"}`}></div>
            <span className="text-xs font-bold text-slate-700">
              {statusLabels[status] || status}
            </span>
          </div>
        </div>
      </header>

      <main className="px-6 py-8 relative z-10">
        <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[1.04fr_0.96fr]">
          <section className="space-y-6">
            <div className="rounded-3xl border border-indigo-100 bg-white/60 backdrop-blur-md p-6 shadow-sm flex flex-col justify-between min-h-[16rem]">
              <div>
                <span className="inline-flex rounded-full bg-indigo-50 border border-indigo-100 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-indigo-700 shadow-sm">
                  Question {session.questionIndex} of {session.questionLimit}
                </span>
                <h2 className="mt-4 text-3xl font-extrabold leading-tight text-slate-900 tracking-tight">
                  {currentQuestion}
                </h2>
                <p className="mt-4 text-sm leading-6 font-medium text-slate-500">
                  Listen to the interviewer or skip ahead when you are ready. Start recording your spoken response and request coaching when finished.
                </p>
              </div>

              {/* Dynamic Animated Soundwave Node based on Status */}
              <div className="mt-6 rounded-2xl bg-slate-950 p-6 relative overflow-hidden flex items-center justify-between text-white shadow-md border border-slate-800">
                <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-r from-indigo-950/20 to-transparent opacity-50 pointer-events-none"></div>
                <div className="flex items-center gap-4 relative z-10">
                  <div className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-white/10 border border-white/15">
                    {/* Ring waves */}
                    {status === "listening" && (
                      <>
                        <div className="pulse-ring"></div>
                        <div className="pulse-ring pulse-ring-delayed"></div>
                      </>
                    )}
                    {status === "connecting" && (
                      <div className="pulse-ring border-amber-400"></div>
                    )}
                    {status === "analyzing" && (
                      <div className="absolute inset-0 rounded-full border-2 border-dashed border-indigo-400 animate-spin"></div>
                    )}
                    <span className="text-2xl relative z-10">
                      {status === "connecting" ? "⏳" :
                       status === "prompting" ? "🗣️" :
                       status === "listening" ? "🎙️" :
                       status === "analyzing" ? "🧠" : "🤝"}
                    </span>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-indigo-300">Agent Interviewer</p>
                    <p className="text-sm font-semibold text-slate-200 mt-0.5">
                      {status === "connecting" ? "Connecting to Live Host..." :
                       status === "prompting" ? "Speaking..." :
                       status === "listening" ? "Listening to your answer..." :
                       status === "analyzing" ? "Coaching your answer..." : "Ready for your answer"}
                    </p>
                  </div>
                </div>

                {/* Simulated Waveform graphics */}
                <div className="flex items-end gap-1 h-8 relative z-10">
                  {[...Array(6)].map((_, i) => (
                    <div
                      key={i}
                      className={`w-1 rounded-full bg-indigo-400 ${
                        status === "prompting" || status === "listening" ? "waveform-bar" : "h-2"
                      }`}
                      style={{
                        animationDelay: `${i * 0.15}s`,
                        animationDuration: `${0.6 + (i % 3) * 0.2}s`,
                        height: status === "prompting" || status === "listening" ? undefined : "6px"
                      }}
                    ></div>
                  ))}
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-indigo-50 bg-white/40 p-6 shadow-sm backdrop-blur-md">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
                Session Guidance
              </p>
              <div className="mt-4 grid grid-cols-2 gap-4 text-xs font-medium text-slate-600">
                <div className="p-3 bg-white/50 rounded-xl border border-indigo-50/50 shadow-sm">
                  <span className="text-indigo-600 font-bold block mb-1">1. Listen</span>
                  Hear the spoken question from the host.
                </div>
                <div className="p-3 bg-white/50 rounded-xl border border-indigo-50/50 shadow-sm">
                  <span className="text-indigo-600 font-bold block mb-1">2. Record</span>
                  Speak naturally into the microphone.
                </div>
                <div className="p-3 bg-white/50 rounded-xl border border-indigo-50/50 shadow-sm">
                  <span className="text-indigo-600 font-bold block mb-1">3. Coach</span>
                  Get an instant, polished rewrite.
                </div>
                <div className="p-3 bg-white/50 rounded-xl border border-indigo-50/50 shadow-sm">
                  <span className="text-indigo-600 font-bold block mb-1">4. Replay</span>
                  Listen to the polished version.
                </div>
              </div>
            </div>
          </section>

          <section className="space-y-6">
            <div className="rounded-3xl border border-indigo-100 bg-white/60 p-6 shadow-sm backdrop-blur-md flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between border-b border-indigo-100/50 pb-4">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-indigo-600">
                      Latest Coaching
                    </p>
                    <h2 className="mt-1 text-2xl font-extrabold text-slate-900 tracking-tight">
                      {latestCoachingTurn ? "Polished answer ready" : "Waiting for a coached answer"}
                    </h2>
                  </div>
                  <div
                    className={`flex h-12 w-12 items-center justify-center rounded-full ${
                      status === "ready_to_practice"
                        ? "bg-indigo-100 text-indigo-700"
                        : status === "analyzing"
                        ? "bg-blue-100 text-blue-700"
                        : "bg-slate-100 text-slate-400"
                    } shadow-sm border border-indigo-100/30`}
                  >
                    <span className="text-xl">🗣️</span>
                  </div>
                </div>

                {!latestCoachingTurn ? (
                  <div className="mt-6 rounded-2xl border border-dashed border-indigo-100 bg-white/30 p-6 text-center text-sm leading-6 font-medium text-slate-500">
                    Finish delivering your answer, then click <span className="font-semibold text-indigo-900">Coach this answer</span> to generate a polished rewrite, targeted feedback tags, and a personalized role profile.
                  </div>
                ) : (
                  <div className="mt-6 space-y-6">
                    <div className="rounded-2xl border border-slate-100 bg-white/40 p-4.5 shadow-sm">
                      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
                        Original transcript
                      </p>
                      <p className="mt-2 text-sm leading-6 font-medium text-slate-700">
                        <span data-testid="original-transcript">
                          {latestCoachingTurn.originalTranscript}
                        </span>
                      </p>
                    </div>

                    <div className="rounded-2xl border border-emerald-100 bg-emerald-50/50 p-5 shadow-sm relative overflow-hidden">
                      <div className="absolute top-[-30%] right-[-30%] w-[60%] h-[60%] rounded-full bg-emerald-300/10 pointer-events-none filter blur-xl"></div>

                      <div className="flex flex-col gap-4 relative z-10">
                        <div className="max-w-2xl">
                          <span className="inline-flex rounded-full bg-emerald-100/80 border border-emerald-200 px-3 py-0.5 text-[9px] font-bold uppercase tracking-[0.16em] text-emerald-800 shadow-sm">
                            Polished answer
                          </span>
                          <p className="mt-3 text-lg font-bold leading-8 text-slate-900">
                            <span data-testid="polished-answer">
                              {latestCoachingTurn.polishedAnswer}
                            </span>
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
                          className="btn-shimmer flex items-center justify-center gap-2 rounded-xl bg-slate-900 hover:bg-slate-800 active:scale-[0.985] text-white px-5 py-3 text-sm font-bold shadow-md transition-all duration-300 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <span className="text-base">{isPlayingPractice ? "🔊" : "▶"}</span>
                          {isPlayingPractice
                            ? "Playing..."
                            : isPreparingPracticeAudio
                            ? "Preparing playback..."
                            : "Play polished version"}
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="rounded-2xl border border-indigo-50 bg-white/40 p-4 shadow-sm">
                        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
                          Improvement tags
                        </p>
                        <div className="mt-2.5 flex flex-wrap gap-1.5">
                          {latestCoachingTurn.improvementTags.map((tag) => (
                            <span
                              key={tag}
                              className="rounded-full bg-indigo-50 border border-indigo-100 px-2.5 py-0.5 text-[10px] font-bold text-indigo-700 shadow-sm"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      </div>

                      <div className="rounded-2xl border border-indigo-50 bg-white/40 p-4 shadow-sm">
                        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
                          Inferred Role Profile
                        </p>
                        <p className="mt-2 text-xs font-bold text-indigo-900">
                          {latestCoachingTurn.roleLabel || "Professional Candidate"}
                        </p>
                        <p className="text-[9px] font-medium text-slate-500 mt-1">
                          Strength: {latestCoachingTurn.strengthKeyword || "clarity"}
                        </p>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-indigo-50 bg-indigo-50/20 p-4 shadow-sm">
                      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-indigo-500">
                        Coach note
                      </p>
                      <p className="mt-2 text-xs leading-6 font-medium text-slate-700 font-sans">
                        {latestCoachingTurn.coachMessage}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>
      </main>

      {/* Floating Action Dashboard Console */}
      <footer className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-full max-w-5xl px-4 pointer-events-none">
        <div className="pointer-events-auto rounded-3xl border border-white/60 bg-white/75 backdrop-blur-xl p-4.5 shadow-[0_20px_50px_rgba(15,23,42,0.12),inset_0_1px_0_rgba(255,255,255,0.9)] flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="min-w-0 flex-1 text-xs font-semibold text-slate-500 px-2">
            {isEndingSession ? (
              <span className="flex items-center gap-2 text-indigo-600">
                <span className="h-1.5 w-1.5 rounded-full bg-indigo-600 animate-ping"></span>
                Building your recap card and saving session...
              </span>
            ) : status === "analyzing" ? (
              <span className="flex items-center gap-2 text-blue-600 font-bold">
                <span className="h-1.5 w-1.5 rounded-full bg-blue-600 animate-ping"></span>
                Analyzing answer and preparing rewrite...
              </span>
            ) : status === "prompting" ? (
              <span className="text-slate-500">The interviewer is speaking. Start recording at any point to answer.</span>
            ) : status === "ready" ? (
              <span className="text-indigo-600 font-bold">Interviewer finished. Start recording whenever you are ready.</span>
            ) : isRecordingAnswer ? (
              <span className="flex items-center gap-2 text-green-600 font-bold">
                <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse"></span>
                Recording your answer... Speak naturally.
              </span>
            ) : isLoadingNextQuestion ? (
              <span className="flex items-center gap-2 text-indigo-600">
                <span className="h-1.5 w-1.5 rounded-full bg-indigo-600 animate-ping"></span>
                Loading next question...
              </span>
            ) : status === "ready_to_practice" ? (
              <span className="text-emerald-700 font-bold">Polished answer ready. Replay it or skip to the next question.</span>
            ) : (
              <span className="text-slate-500 font-medium">Ready for your practice session.</span>
            )}
          </div>

          <div className="flex flex-wrap gap-2.5 shrink-0">
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
                className="btn-shimmer rounded-xl bg-slate-900 hover:bg-slate-800 active:scale-[0.97] text-white px-4.5 py-2.5 text-xs font-bold shadow-sm transition-all duration-300 disabled:cursor-not-allowed disabled:opacity-50"
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
              className="btn-shimmer rounded-xl bg-indigo-600 hover:bg-indigo-700 active:scale-[0.97] text-white px-4.5 py-2.5 text-xs font-bold shadow-sm transition-all duration-300 disabled:cursor-not-allowed disabled:opacity-50"
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
              className="btn-shimmer rounded-xl bg-amber-100 hover:bg-amber-200 active:scale-[0.97] text-amber-800 px-4.5 py-2.5 text-xs font-bold shadow-sm transition-all duration-300 disabled:cursor-not-allowed disabled:opacity-50"
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
              className="btn-shimmer rounded-xl bg-red-100 hover:bg-red-200 active:scale-[0.97] text-red-700 px-4 py-2.5 text-xs font-bold shadow-sm transition-all duration-300 disabled:opacity-50"
            >
              {isEndingSession ? "Building recap..." : "End Session"}
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
