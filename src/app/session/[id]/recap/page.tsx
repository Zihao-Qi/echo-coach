"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useCoachSession } from "../../../../providers/CoachProvider";
import { loadRecapSnapshot } from "../../../../lib/recap-storage";
import { SessionRecapPayload } from "../../../../types/coach";

const MIN_CARD_REVEAL_DELAY_MS = 2000;

export default function RecapPage() {
  const router = useRouter();
  const params = useParams();
  const { session, recap, coachingHistory, status } = useCoachSession();
  const routeSessionId = Array.isArray(params?.id) ? params.id[0] : params?.id;
  const [persistedPayload, setPersistedPayload] = useState<SessionRecapPayload | null>(null);
  const [isCardRevealActive, setIsCardRevealActive] = useState(false);
  const [isCardRevealSettled, setIsCardRevealSettled] = useState(false);
  const wasGeneratingRef = useRef(false);
  const recapViewStartedAtRef = useRef(0);

  const recapToDisplay = recap || persistedPayload?.recap || null;
  const historyToDisplay =
    coachingHistory.length > 0 ? coachingHistory : persistedPayload?.coachingHistory || [];
  const completedQuestions = Math.max(
    historyToDisplay.length,
    session?.questionIndex || 0,
    recapToDisplay ? 1 : 0
  );
  const isCardGenerating =
    !!recapToDisplay && !recapToDisplay.assetDataUrl && recapToDisplay.assetModel !== "failed";

  useEffect(() => {
    if (isCardGenerating) {
      wasGeneratingRef.current = true;
    }
  }, [isCardGenerating]);

  useEffect(() => {
    recapViewStartedAtRef.current = Date.now();
    wasGeneratingRef.current = false;
    const timeoutId = window.setTimeout(() => {
      setIsCardRevealActive(false);
      setIsCardRevealSettled(false);
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [routeSessionId]);

  useEffect(() => {
    if (!recapToDisplay?.assetDataUrl) {
      return;
    }

    const elapsedMs = Date.now() - recapViewStartedAtRef.current;
    const remainingDelayMs = Math.max(0, MIN_CARD_REVEAL_DELAY_MS - elapsedMs);
    let delayTimeoutId: ReturnType<typeof setTimeout> | null = null;
    let settleTimeoutId: ReturnType<typeof setTimeout> | null = null;
    const rafId = requestAnimationFrame(() => {
      delayTimeoutId = setTimeout(() => {
        if (!wasGeneratingRef.current) {
          setIsCardRevealActive(false);
          setIsCardRevealSettled(true);
          return;
        }

        setIsCardRevealActive(true);
        settleTimeoutId = setTimeout(() => {
          setIsCardRevealSettled(true);
          wasGeneratingRef.current = false;
        }, 900);
      }, remainingDelayMs);
    });

    return () => {
      cancelAnimationFrame(rafId);
      if (delayTimeoutId) {
        clearTimeout(delayTimeoutId);
      }
      if (settleTimeoutId) {
        clearTimeout(settleTimeoutId);
      }
    };
  }, [recapToDisplay?.assetDataUrl]);

  useEffect(() => {
    if (!routeSessionId) {
      router.replace("/");
      return;
    }

    if (session && session.sessionId !== routeSessionId) {
      router.replace("/");
      return;
    }

    if (recap) {
      return;
    }

    if (status === "recap" && session?.sessionId === routeSessionId) {
      return;
    }

    const localSnapshot = loadRecapSnapshot(routeSessionId);
    if (localSnapshot) {
      void Promise.resolve().then(() => {
        setPersistedPayload(localSnapshot);
      });
      return;
    }

    let cancelled = false;

    void fetch(`/api/session/${routeSessionId}/recap`)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Recap not found.");
        }

        const payload = (await response.json()) as SessionRecapPayload;
        if (!cancelled) {
          setPersistedPayload(payload);
        }
      })
      .catch(() => {
        const fallbackSnapshot = loadRecapSnapshot(routeSessionId);
        if (!cancelled && fallbackSnapshot) {
          setPersistedPayload(fallbackSnapshot);
          return;
        }

        if (!cancelled) {
          router.replace("/");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [recap, routeSessionId, router, session, status]);

  if (!recapToDisplay) {
    return (
      <div className="min-h-screen bg-slate-50 nordic-grid relative overflow-hidden px-6 py-8">
        <div className="mx-auto max-w-5xl relative z-10">
          <header className="mb-8 text-center">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-indigo-600">
              Echo Coach
            </p>
            <h1 className="mt-3 text-4xl font-extrabold tracking-tight text-slate-900 leading-tight">
              Interview Session Recap
            </h1>
          </header>

          <section className="rounded-3xl glass-card p-10 text-center shadow-sm max-w-2xl mx-auto">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-indigo-600 animate-pulse">
              Great work
            </p>
            <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-slate-900">
              Congratulations
            </h2>
            <p className="mt-4 text-base leading-7 font-medium text-slate-600">
              You finished {completedQuestions}{" "}
              {completedQuestions === 1 ? "question" : "questions"}.
            </p>
            <div className="mt-6 flex justify-center">
              <div className="relative flex h-14 w-14 items-center justify-center rounded-full bg-indigo-50 border border-indigo-100">
                <div className="pulse-ring"></div>
                <div className="pulse-ring pulse-ring-delayed"></div>
                <span className="text-xl">🧠</span>
              </div>
            </div>
            <p className="mt-4 text-xs font-bold text-indigo-600 tracking-wide">Momentum card is generating...</p>
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 nordic-grid relative overflow-hidden px-6 py-8">
      {/* Drifting Background Ambient Pastels */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-indigo-200/40 glow-orb-1 pointer-events-none"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-rose-200/30 glow-orb-2 pointer-events-none"></div>
      <div className="absolute top-[40%] right-[20%] w-[35%] h-[35%] rounded-full bg-sky-200/30 glow-orb-1 pointer-events-none"></div>

      <div className="mx-auto max-w-5xl relative z-10">
        <header className="mb-10 text-center">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-indigo-600">
            Echo Coach
          </p>
          <h1 className="mt-3 text-4xl font-extrabold tracking-tight text-slate-900 leading-tight">
            Interview Session Recap
          </h1>
          <p className="mt-4 text-slate-600 font-medium max-w-xl mx-auto leading-7">
            Your latest answer is packaged into a momentum card, and the full session history stays available below for review.
          </p>
        </header>

        <main className="grid gap-8 lg:grid-cols-[1fr_1fr]">
          <section className="rounded-3xl border border-indigo-100 bg-white/60 backdrop-blur-md p-6 shadow-sm flex flex-col justify-between">
            <div>
              <h2 className="border-b border-indigo-100/50 pb-3 text-lg font-bold text-slate-900 tracking-tight">
                Answer Summary
              </h2>
              <div className="mt-6 space-y-6">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Original Answer</p>
                  <p className="mt-2 text-sm leading-6 font-medium text-slate-600">{recapToDisplay.originalAnswer}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Polished Answer</p>
                  <p className="mt-2 text-xl font-bold leading-8 text-slate-900">
                    <span data-testid="recap-polished-answer">{recapToDisplay.polishedAnswer}</span>
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Primary Focus</p>
                    <div className="mt-2">
                      <span className="inline-flex rounded-full bg-indigo-50 border border-indigo-100 px-3 py-1 text-xs font-bold text-indigo-700 shadow-sm" data-testid="recap-primary-focus">
                        {recapToDisplay.primaryFocus}
                      </span>
                    </div>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Inferred Role Profile</p>
                    <p className="mt-2 text-xs font-bold text-indigo-900">
                      {recapToDisplay.roleLabel || "Professional Candidate"}
                    </p>
                    <p className="text-[9px] font-medium text-slate-500 mt-0.5">
                      Strength: {recapToDisplay.strengthKeyword || "clarity"}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 rounded-2xl border border-indigo-50 bg-indigo-50/20 p-4.5 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-indigo-500">
                Coach note
              </p>
              <p className="mt-2 text-xs leading-6 font-medium text-slate-600">
                {recapToDisplay.coachMessage}
              </p>
            </div>
          </section>

          <section className="rounded-3xl border border-indigo-100 bg-white/60 backdrop-blur-md p-6 shadow-sm">
            <h2 className="border-b border-indigo-100/50 pb-3 text-lg font-bold text-slate-900 tracking-tight">
              Momentum Card
            </h2>
            <div className="mt-6 flex justify-center">
              <div
                className="relative aspect-[3/4] w-full max-w-xs overflow-hidden rounded-2xl border border-indigo-100 bg-white/40 shadow-md backdrop-blur-md"
                style={{ perspective: "1600px" }}
              >
                {recapToDisplay.assetDataUrl ? (
                  <>
                    <div
                      className="absolute inset-0 transition-all duration-700 ease-out"
                      style={{
                        opacity: isCardRevealSettled ? 0.35 : 1,
                        transform: isCardRevealSettled
                          ? "translateY(10px) scale(0.965) rotate(-2deg)"
                          : "translateY(0) scale(1) rotate(0deg)",
                        transformOrigin: "center center",
                      }}
                    >
                      <GeneratingCardFace completedQuestions={completedQuestions} />
                    </div>
                    <div
                      className="absolute inset-0 z-10 transition-all duration-[900ms] rounded-2xl overflow-hidden"
                      style={{
                        opacity: isCardRevealActive || isCardRevealSettled ? 1 : 0,
                        transform: isCardRevealActive || isCardRevealSettled
                          ? "translateY(0) rotateY(0deg) rotateZ(0deg) scale(1.03)"
                          : "translateY(12px) rotateY(-84deg) rotateZ(3deg) scale(0.95)",
                        transformOrigin: "center center",
                        transformStyle: "preserve-3d",
                        boxShadow: isCardRevealActive || isCardRevealSettled
                          ? "0 20px 45px rgba(99, 102, 241, 0.2)"
                          : "0 8px 22px rgba(15, 23, 42, 0.04)",
                      }}
                    >
                      <Image
                        src={recapToDisplay.assetDataUrl}
                        alt={recapToDisplay.assetAlt || "Generated interview encouragement card"}
                        className="h-full w-full object-cover"
                        fill
                        unoptimized
                      />
                    </div>
                  </>
                ) : isCardGenerating ? (
                  <GeneratingCardFace completedQuestions={completedQuestions} />
                ) : recapToDisplay.assetModel === "failed" ? (
                  <div className="flex h-full items-center justify-center text-center text-slate-500">
                    <div className="max-w-xs px-6">
                      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-indigo-600">
                        Great work
                      </p>
                      <h3 className="mt-3 text-2xl font-extrabold text-slate-900 tracking-tight">
                        Session complete
                      </h3>
                      <p className="mt-3 text-xs leading-5 font-medium text-slate-500">
                        The momentum card could not be generated this time.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="flex h-full items-center justify-center text-center text-slate-500">
                    <div>
                      <span className="mb-2 block text-4xl">🖼️</span>
                      <p className="text-sm font-medium">Highlight card is not available.</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
            <p className="mt-5 text-center text-xs leading-5 font-medium text-slate-400 px-4">
              Save this highlight card as a simple reminder of the confidence and energy you want to carry into the next interview.
            </p>
          </section>
        </main>

        {historyToDisplay.length > 0 && (
          <section className="mt-8 rounded-3xl border border-indigo-100 bg-white/60 backdrop-blur-md p-6 shadow-sm">
            <div className="flex items-center justify-between gap-3 border-b border-indigo-100/50 pb-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-indigo-600">
                  Session History
                </p>
                <h2 className="mt-1 text-2xl font-extrabold text-slate-900 tracking-tight">
                  All coached answers from this session
                </h2>
              </div>
              <span className="rounded-full bg-indigo-50 border border-indigo-100 px-3 py-1 text-xs font-bold text-indigo-700 shadow-sm">
                {historyToDisplay.length} Coached Turns
              </span>
            </div>

            <div className="mt-6 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {historyToDisplay.map((turn) => (
                <article
                  key={`${turn.sessionId}-${turn.questionIndex}`}
                  className="rounded-2xl border border-indigo-50 bg-white/40 p-5 shadow-sm transition-shadow duration-300 hover:shadow-md flex flex-col justify-between"
                >
                  <div>
                    <span className="inline-flex rounded-full bg-indigo-50 border border-indigo-100 px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.16em] text-indigo-700 shadow-sm">
                      Question {turn.questionIndex}
                    </span>
                    <h3 className="mt-3 text-base font-bold leading-6 text-slate-950 tracking-tight">
                      {turn.questionText}
                    </h3>
                    <div className="mt-3.5 flex flex-wrap gap-1.5">
                      {turn.improvementTags.map((tag) => (
                        <span
                          key={`${turn.questionIndex}-${tag}`}
                          className="rounded-full bg-indigo-50/55 border border-indigo-100/50 px-2 py-0.5 text-[9px] font-bold text-indigo-600"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                  <p className="mt-4 text-sm leading-6 font-medium text-slate-600 border-t border-indigo-50/30 pt-3.5">{turn.polishedAnswer}</p>
                </article>
              ))}
            </div>
          </section>
        )}

        <div className="mt-10 flex justify-center">
          <Link
            href="/"
            className="btn-shimmer rounded-xl bg-slate-900 hover:bg-slate-800 active:scale-[0.98] text-white px-8 py-3.5 text-sm font-bold shadow-md transition-all duration-300"
          >
            Start New Session
          </Link>
        </div>
      </div>
    </div>
  );
}

function GeneratingCardFace({
  completedQuestions,
}: {
  completedQuestions: number;
}) {
  return (
    <div className="flex h-full items-center justify-center text-center text-slate-500 p-6">
      <div className="w-full rounded-2xl border border-indigo-50/50 bg-white/60 p-6 shadow-sm">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-indigo-600 animate-pulse">
          Great work
        </p>
        <h3 className="mt-3 text-2xl font-extrabold text-slate-900 tracking-tight">Congratulations</h3>
        <p className="mt-3 text-sm leading-6 font-medium text-slate-600">
          You finished {completedQuestions}{" "}
          {completedQuestions === 1 ? "question" : "questions"}.
        </p>
        <div className="mx-auto mt-5 h-px w-12 bg-indigo-100" />
        <p className="mt-4 text-xs font-bold text-indigo-600 tracking-wide">Momentum card is generating...</p>
      </div>
    </div>
  );
}
