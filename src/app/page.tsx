"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useCoachSession } from "../providers/CoachProvider";
import { DEFAULT_LANGUAGE, MVP_SCENARIO } from "../lib/coach-config";
import { listRecapSnapshotHistory } from "../lib/recap-storage";
import { SessionHistoryItem } from "../types/coach";

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
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="mx-auto flex min-h-screen max-w-6xl items-center justify-center py-8">
        <div className="grid w-full gap-6">
          <div className="grid gap-6 rounded-[2rem] border border-gray-200 bg-white p-8 shadow-sm lg:grid-cols-[1.05fr_0.95fr]">
            <section className="space-y-6">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">
                  Live Agent MVP
                </p>
                <h1 className="mt-4 text-4xl font-semibold tracking-tight text-gray-900">
                  Echo Coach
                </h1>
                <p className="mt-4 max-w-xl text-lg leading-8 text-gray-600">
                  A live interview expression coach that helps you turn spoken answers into clearer, more natural, and more professional responses.
                </p>
              </div>

              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-700">
                  Locked Demo Flow
                </p>
                <ul className="mt-3 space-y-2 text-sm leading-6 text-gray-700">
                  <li>1. The agent asks one interview question aloud.</li>
                  <li>2. You answer naturally into the microphone.</li>
                  <li>3. You tap <span className="font-medium">Coach this answer</span>.</li>
                  <li>4. Echo Coach rewrites the answer and adds role-aware encouragement.</li>
                  <li>5. You tap <span className="font-medium">Play polished version</span> to hear the improved answer.</li>
                </ul>
              </div>
            </section>

            <section className="rounded-[1.75rem] bg-slate-950 p-7 text-white">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-300">
                Interview Practice
              </p>
              <h2 className="mt-4 text-2xl font-semibold">
                One focused scenario, one polished answer
              </h2>
              <p className="mt-4 text-sm leading-7 text-slate-300">
                This MVP is English-only and optimized for a short interview demo. The microphone is required. Camera is intentionally out of scope.
              </p>

              <div className="mt-8 rounded-2xl bg-white/10 p-5">
                <p className="text-sm font-medium text-white">What the session does</p>
                <div className="mt-4 space-y-3 text-sm text-slate-200">
                  <p>Asks one interview question aloud</p>
                  <p>Captures your spoken answer</p>
                  <p>Rewrites it into a stronger response</p>
                  <p>Plays back the polished answer</p>
                </div>
              </div>

              {micError && (
                <div className="mt-6 rounded-xl border border-red-300/40 bg-red-500/10 p-3 text-sm text-red-100">
                  {micError}
                </div>
              )}

              <button
                onClick={handleStart}
                disabled={isStarting}
                className="mt-8 flex w-full justify-center rounded-xl bg-white px-4 py-3 text-sm font-medium text-slate-950 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isStarting ? "Checking mic and starting..." : "Start Interview Practice"}
              </button>
            </section>
          </div>

          <section className="rounded-[2rem] border border-gray-200 bg-white p-8 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Recent Practice
                </p>
                <h2 className="mt-2 text-2xl font-semibold text-gray-900">
                  Saved interview recaps
                </h2>
              </div>
              <p className="text-sm text-gray-500">
                Reopen the strongest answers you want to practice again.
              </p>
            </div>

            {historyItems.length === 0 ? (
              <div className="mt-6 rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-6 text-sm text-gray-500">
                No saved sessions yet. Complete one interview round and the recap will appear here.
              </div>
            ) : (
              <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {historyItems.map((item) => (
                  <Link
                    key={item.sessionId}
                    href={`/session/${item.sessionId}/recap`}
                    className="rounded-3xl border border-gray-200 bg-gray-50 p-5 transition-colors hover:border-slate-300 hover:bg-white"
                  >
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-700">
                      {new Date(item.updatedAt).toLocaleString([], {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </p>
                    <p className="mt-4 inline-flex rounded-full bg-indigo-100 px-3 py-1 text-xs font-medium text-indigo-700">
                      {item.primaryFocus}
                    </p>
                    <p className="mt-4 text-sm leading-7 text-gray-700">
                      {item.polishedAnswerPreview}
                    </p>
                    <p className="mt-5 text-sm font-medium text-slate-900">
                      Open recap
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
