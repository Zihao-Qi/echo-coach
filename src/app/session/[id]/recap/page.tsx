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
      <div className="min-h-screen bg-gray-50 px-6 py-8">
        <div className="mx-auto max-w-5xl">
          <header className="mb-8 text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">
              Echo Coach
            </p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight text-gray-900">
              Interview Session Recap
            </h1>
          </header>

          <section className="rounded-3xl border border-gray-200 bg-white p-10 text-center shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">
              Great work
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-gray-900">
              Congratulations
            </h2>
            <p className="mt-4 text-lg text-gray-700">
              You finished {completedQuestions}{" "}
              {completedQuestions === 1 ? "question" : "questions"}.
            </p>
            <p className="mt-3 text-sm text-gray-500">Momentum card is generating...</p>
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 px-6 py-8">
      <div className="mx-auto max-w-5xl">
        <header className="mb-8 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">
            Echo Coach
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-gray-900">
            Interview Session Recap
          </h1>
          <p className="mt-3 text-gray-600">
            Your latest answer is packaged into a momentum card, and the full session history stays available below for review.
          </p>
        </header>

        <main className="grid gap-6 lg:grid-cols-[1fr_1fr]">
          <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="border-b pb-3 text-lg font-semibold text-gray-800">
              Answer Summary
            </h2>
            <div className="mt-5 space-y-5">
              <div>
                <p className="text-sm uppercase tracking-wide text-gray-500">Original Answer</p>
                <p className="mt-2 text-gray-700 leading-7">{recapToDisplay.originalAnswer}</p>
              </div>
              <div>
                <p className="text-sm uppercase tracking-wide text-gray-500">Polished Answer</p>
                <p className="mt-2 text-lg font-medium leading-8 text-gray-900">
                  <span data-testid="recap-polished-answer">{recapToDisplay.polishedAnswer}</span>
                </p>
              </div>
              <div>
                <p className="text-sm uppercase tracking-wide text-gray-500">Primary Focus</p>
                <p className="mt-2 inline-flex rounded-full bg-indigo-100 px-3 py-1 text-sm font-medium text-indigo-700">
                  <span data-testid="recap-primary-focus">{recapToDisplay.primaryFocus}</span>
                </p>
              </div>
              <div>
                <p className="text-sm uppercase tracking-wide text-gray-500">Coach Note</p>
                <p className="mt-2 rounded-2xl border border-blue-100 bg-blue-50 p-4 text-gray-700">
                  {recapToDisplay.coachMessage}
                </p>
              </div>
            </div>
          </section>

          <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="border-b pb-3 text-lg font-semibold text-gray-800">
              Momentum Card
            </h2>
            <div className="mt-5 flex justify-center">
              <div
                className="relative aspect-[3/4] w-full max-w-sm overflow-hidden rounded-[1rem] border border-gray-200 bg-[#edf1f4] shadow-sm"
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
                      className="absolute inset-0 z-10 transition-all duration-[900ms]"
                      style={{
                        opacity: isCardRevealActive || isCardRevealSettled ? 1 : 0,
                        transform: isCardRevealActive || isCardRevealSettled
                          ? "translateY(0) rotateY(0deg) rotateZ(0deg) scale(1.05)"
                          : "translateY(12px) rotateY(-84deg) rotateZ(3deg) scale(0.95)",
                        transformOrigin: "center center",
                        transformStyle: "preserve-3d",
                        boxShadow: isCardRevealActive || isCardRevealSettled
                          ? "0 26px 55px rgba(15, 23, 42, 0.22)"
                          : "0 8px 22px rgba(15, 23, 42, 0.08)",
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
                  <div className="flex h-full items-center justify-center text-center text-gray-500">
                    <div className="max-w-xs px-6">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">
                        Great work
                      </p>
                      <h3 className="mt-3 text-2xl font-semibold text-gray-900">
                        Session complete
                      </h3>
                      <p className="mt-3 text-sm text-gray-500">
                        The momentum card could not be generated this time.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="flex h-full items-center justify-center text-center text-gray-500">
                    <div>
                      <span className="mb-2 block text-4xl">🖼️</span>
                      <p>Highlight card is not available.</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
            <p className="mt-3 text-sm text-gray-500">
              Save this highlight card as a simple reminder of the confidence and energy you want to carry into the next interview.
            </p>
          </section>
        </main>

        {historyToDisplay.length > 0 && (
          <section className="mt-6 rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between gap-3 border-b pb-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Session History
                </p>
                <h2 className="mt-2 text-lg font-semibold text-gray-900">
                  All coached answers from this session
                </h2>
              </div>
              <p className="text-sm text-gray-500">{historyToDisplay.length} coached turns</p>
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-3">
              {historyToDisplay.map((turn) => (
                <article
                  key={`${turn.sessionId}-${turn.questionIndex}`}
                  className="rounded-2xl border border-gray-200 bg-gray-50 p-4"
                >
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-700">
                    Question {turn.questionIndex}
                  </p>
                  <h3 className="mt-3 text-base font-semibold leading-7 text-gray-900">
                    {turn.questionText}
                  </h3>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {turn.improvementTags.map((tag) => (
                      <span
                        key={`${turn.questionIndex}-${tag}`}
                        className="rounded-full bg-indigo-100 px-3 py-1 text-xs font-medium text-indigo-700"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                  <p className="mt-4 text-sm leading-7 text-gray-700">{turn.polishedAnswer}</p>
                </article>
              ))}
            </div>
          </section>
        )}

        <div className="mt-8 flex justify-center">
          <Link
            href="/"
            className="rounded-xl bg-gray-900 px-8 py-3 text-sm font-medium text-white shadow transition-colors hover:bg-gray-800"
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
    <div className="flex h-full items-center justify-center text-center text-slate-600">
      <div className="mx-6 w-full rounded-[1.2rem] border border-slate-200 bg-[linear-gradient(180deg,#f8fafc_0%,#e9edf1_100%)] px-6 py-10 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">
          Great work
        </p>
        <h3 className="mt-3 text-2xl font-semibold text-slate-900">Congratulations</h3>
        <p className="mt-3 text-base text-slate-700">
          You finished {completedQuestions}{" "}
          {completedQuestions === 1 ? "question" : "questions"}.
        </p>
        <div className="mx-auto mt-6 h-px w-16 bg-slate-300" />
        <p className="mt-4 text-sm text-slate-500">Momentum card is generating...</p>
      </div>
    </div>
  );
}
