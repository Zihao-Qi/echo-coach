"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useCoachSession } from "../../providers/CoachProvider";
import { DEFAULT_LANGUAGE, MVP_SCENARIO } from "../../lib/coach-config";
import { listRecapSnapshotHistory } from "../../lib/recap-storage";
import { SessionHistoryItem } from "../../types/coach";

export default function OnboardingPage() {
  const router = useRouter();
  const { startSession } = useCoachSession();
  const [isStarting, setIsStarting] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [historyItems, setHistoryItems] = useState<SessionHistoryItem[]>([]);

  useEffect(() => {
    let cancelled = false;

    void fetch("/api/history")
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Failed to load history.");
        }

        const payload = (await response.json()) as { items?: SessionHistoryItem[] };
        const serverItems = payload.items || [];
        const localItems = listRecapSnapshotHistory();
        const merged = [...serverItems];

        for (const localItem of localItems) {
          if (!merged.some((item) => item.sessionId === localItem.sessionId)) {
            merged.push(localItem);
          }
        }

        merged.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));

        if (!cancelled) {
          setHistoryItems(merged.slice(0, 6));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setHistoryItems(listRecapSnapshotHistory().slice(0, 6));
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const requestMediaPermissions = async (): Promise<boolean> => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setMicError("This browser does not support microphone access.");
      return false;
    }

    try {
      setMicError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      return true;
    } catch (err: unknown) {
      console.error("Media permission error:", err);
      const errorName =
        err instanceof DOMException || err instanceof Error ? err.name : undefined;

      if (errorName === "NotAllowedError") {
        setMicError(
          "Microphone access was denied. Please allow it in your browser settings to continue."
        );
      } else if (errorName === "NotFoundError") {
        setMicError("No microphone found. Please connect a microphone.");
      } else {
        setMicError("An error occurred while trying to access the microphone.");
      }
      return false;
    }
  };

  const handleStart = async () => {
    setIsStarting(true);

    const hasPermissions = await requestMediaPermissions();
    if (!hasPermissions) {
      setIsStarting(false);
      return;
    }

    const sessionId = await startSession({
      scenario: MVP_SCENARIO,
      language: DEFAULT_LANGUAGE,
      userGoal: "Speak with clearer, more professional interview phrasing.",
    });

    if (sessionId) {
      router.push(`/session/${sessionId}`);
      return;
    }

    setIsStarting(false);
    setMicError("Failed to start session. Please try again.");
  };

  return (
    <div className="min-h-screen bg-slate-50 nordic-grid relative overflow-hidden p-4">
      {/* Drifting Background Ambient Pastels */}
      <div className="absolute top-[-15%] left-[-15%] w-[60%] h-[60%] rounded-full bg-indigo-200/35 glow-orb-1 pointer-events-none"></div>
      <div className="absolute bottom-[-15%] right-[-15%] w-[65%] h-[65%] rounded-full bg-rose-200/25 glow-orb-2 pointer-events-none"></div>
      <div className="absolute top-[35%] right-[10%] w-[40%] h-[40%] rounded-full bg-sky-200/30 glow-orb-1 pointer-events-none"></div>

      <div className="mx-auto flex min-h-screen max-w-6xl items-center justify-center py-8 relative z-10">
        <div className="grid w-full gap-6">
          <div className="grid gap-8 rounded-[2rem] glass-card p-8 lg:grid-cols-[1.05fr_0.95fr] transition-shadow duration-500 hover:shadow-xl">
            <section className="space-y-6 flex flex-col justify-between">
              <Link href="/practice" className="rounded-xl bg-indigo-600 px-5 py-3 text-center text-sm font-bold text-white hover:bg-indigo-700">
                Try the new question-answer practice lab →
              </Link>
              <div className="space-y-4">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-amber-800 shadow-sm">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                  Live Agent MVP
                </span>
                <h1 className="mt-4 text-5xl font-extrabold tracking-tight text-slate-900 bg-gradient-to-r from-slate-900 via-indigo-950 to-indigo-900 bg-clip-text text-transparent leading-tight">
                  Echo Coach
                </h1>
                <p className="mt-4 max-w-xl text-lg leading-8 text-slate-600 font-medium">
                  A live interview expression coach that helps you turn spoken answers into clearer, more natural, and more professional responses.
                </p>
              </div>

              <div className="rounded-2xl border border-indigo-100 bg-white/40 p-6 backdrop-blur-md shadow-sm">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-indigo-700">
                  Locked Demo Flow
                </p>
                <ul className="mt-4 space-y-3.5 text-sm leading-6 text-slate-700 font-medium">
                  {[
                    "1. The agent asks one interview question aloud.",
                    "2. You answer naturally into the microphone.",
                    "3. You tap Coach this answer.",
                    "4. Echo Coach rewrites the answer and adds role-aware encouragement.",
                    "5. You tap Play polished version to hear the improved answer.",
                  ].map((step, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-50 border border-indigo-100 text-[10px] font-bold text-indigo-600 shadow-sm">
                        ✓
                      </span>
                      <span>
                        {i === 2 ? (
                          <>You tap <span className="font-semibold text-indigo-950">Coach this answer</span>.</>
                        ) : i === 4 ? (
                          <>You tap <span className="font-semibold text-indigo-950">Play polished version</span>.</>
                        ) : (
                          step.substring(3)
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </section>

            <section className="rounded-[1.75rem] bg-gradient-to-br from-slate-900 to-slate-950 p-8 text-white relative overflow-hidden flex flex-col justify-between shadow-lg border border-slate-800">
              <div className="absolute top-[-30%] right-[-30%] w-[80%] h-[80%] rounded-full bg-indigo-500/10 pointer-events-none filter blur-3xl"></div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-indigo-400 font-heading">
                  Interview Practice
                </p>
                <h2 className="mt-4 text-3xl font-extrabold tracking-tight text-white leading-tight">
                  One focused scenario, one polished answer
                </h2>
                <p className="mt-4 text-sm leading-7 text-slate-300">
                  This MVP is English-only and optimized for a short interview demo. The microphone is required. Camera is intentionally out of scope.
                </p>

                <div className="mt-8 rounded-2xl bg-white/5 border border-white/5 p-6 space-y-4 shadow-inner">
                  <p className="text-xs font-bold uppercase tracking-[0.12em] text-indigo-300">What the session does</p>
                  <ul className="space-y-3 text-sm text-slate-200 font-medium">
                    {[
                      "Asks one interview question aloud",
                      "Captures your spoken answer",
                      "Rewrites it into a stronger response",
                      "Plays back the polished answer",
                    ].map((item, i) => (
                      <li key={i} className="flex items-center gap-3">
                        <span className="h-1.5 w-1.5 rounded-full bg-indigo-400 shadow-[0_0_8px_#818cf8]"></span>
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="mt-8">
                {micError && (
                  <div className="mb-4 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-200">
                    {micError}
                  </div>
                )}

                <button
                  onClick={handleStart}
                  disabled={isStarting}
                  className="btn-shimmer flex w-full justify-center rounded-xl bg-white px-4 py-3.5 text-sm font-bold text-slate-950 shadow-md transition-all duration-300 hover:bg-slate-100 hover:shadow-lg active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isStarting ? "Checking mic and starting..." : "Start Interview Practice"}
                </button>
              </div>
            </section>
          </div>

          <section className="rounded-[2rem] glass-card p-8 shadow-sm">
            <div className="flex flex-wrap items-end justify-between gap-4 border-b border-indigo-100/50 pb-5">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-indigo-600">
                  Recent Practice
                </p>
                <h2 className="mt-2 text-3xl font-extrabold text-slate-900">
                  Saved interview recaps
                </h2>
              </div>
              <p className="text-sm font-medium text-slate-500">
                Reopen the strongest answers you want to practice again.
              </p>
            </div>

            {historyItems.length === 0 ? (
              <div className="mt-6 rounded-2xl border border-dashed border-indigo-200 bg-white/30 p-8 text-center text-sm font-medium text-slate-500">
                No saved sessions yet. Complete one interview round and the recap will appear here.
              </div>
            ) : (
              <div className="mt-6 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
                {historyItems.map((item) => (
                  <Link
                    key={item.sessionId}
                    href={`/session/${item.sessionId}/recap`}
                    className="group rounded-3xl border border-indigo-100 bg-white/40 p-6 shadow-sm backdrop-blur-md transition-all duration-300 hover:-translate-y-1 hover:border-indigo-200 hover:bg-white/70 hover:shadow-md"
                  >
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-indigo-600">
                      {new Date(item.updatedAt).toLocaleString([], {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </p>
                    <div className="mt-3">
                      <span className="inline-flex rounded-full bg-indigo-50 border border-indigo-100 px-3 py-1 text-xs font-bold text-indigo-700">
                        {item.primaryFocus}
                      </span>
                    </div>
                    <p className="mt-4 text-sm leading-7 text-slate-600 font-medium line-clamp-3">
                      {item.polishedAnswerPreview}
                    </p>
                    <p className="mt-5 inline-flex items-center gap-1.5 text-sm font-bold text-indigo-600 transition-colors group-hover:text-indigo-700">
                      Open recap
                      <span className="transition-transform group-hover:translate-x-1">→</span>
                    </p>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
