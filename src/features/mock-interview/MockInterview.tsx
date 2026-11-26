"use client";

import { PracticeHeader } from "../PracticeHeader";
import { useEffect, useReducer, useRef, useState } from "react";
import {
  initialRound,
  MAX_ANSWER_LENGTH,
  MOCK_PROMPTS,
  reduceRound,
} from "./round";

const TRACK_LABELS: Record<string, string> = {
  behavioral: "Behavioral",
  swe: "Software engineering",
  "ai-ml": "AI / ML",
};
const CARD = "panel";
const FOCUS_RING =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";
const BTN_PRIMARY = `${FOCUS_RING} rounded-xl bg-ink px-5 py-2.5 text-sm font-bold text-white shadow-sm enabled:hover:bg-ink-hover`;
const BTN_SECONDARY = `${FOCUS_RING} rounded-xl border border-line-strong bg-white px-4 py-2.5 text-sm font-semibold text-body hover:bg-pebble`;
const BTN_DANGER = `${FOCUS_RING} rounded-xl border border-danger-line bg-danger-tint px-4 py-2.5 text-sm font-semibold text-danger hover:bg-danger-tint`;
const TEXTAREA = "input-field mt-2";

export function MockInterview() {
  const [round, dispatch] = useReducer(reduceRound, initialRound);
  const [selectedTurn, setSelectedTurn] = useState<number | null>(null);
  const [extraHints, setExtraHints] = useState<Record<number, boolean>>({});
  const headingRef = useRef<HTMLHeadingElement>(null);
  const debriefHeadingRef = useRef<HTMLHeadingElement>(null);
  const previousPhase = useRef(round.phase);
  const total = MOCK_PROMPTS.length;
  const currentIndex = round.phase === "answering" ? round.turns.length : -1;
  const debriefOpened = round.phase === "review" && round.showDebrief;

  const hasValuableText =
    round.phase === "answering"
      ? round.draft.trim().length > 0 ||
        round.turns.some((t) => t.answer !== null && t.answer.trim().length > 0)
      : round.phase === "review"
        ? round.turns.some(
            (t) => t.answer !== null && t.answer.trim().length > 0,
          ) || Object.values(round.revisions).some((r) => r.trim().length > 0)
        : false;

  useEffect(() => {
    if (!hasValuableText) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [hasValuableText]);

  useEffect(() => {
    const initialIntro =
      previousPhase.current === "ready" && round.phase === "ready";
    previousPhase.current = round.phase;
    if (!initialIntro)
      (debriefOpened ? debriefHeadingRef.current : headingRef.current)?.focus();
  }, [round.phase, currentIndex, debriefOpened]);

  const confirmLeave = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    if (
      hasValuableText &&
      !window.confirm(
        "Leave this mock interview? Your typed answers and revisions exist only in page memory and will be lost.",
      )
    ) {
      event.preventDefault();
    }
  };

  const confirmDiscard = () => {
    if (
      !hasValuableText ||
      window.confirm(
        "Discard this mock interview round? Your typed answers and revisions in page memory will be lost.",
      )
    ) {
      setSelectedTurn(null);
      setExtraHints({});
      dispatch({ type: "discard" });
    }
  };

  const activeIdx =
    debriefOpened &&
    selectedTurn !== null &&
    round.turns.some((t) => t.questionIndex === selectedTurn)
      ? selectedTurn
      : null;

  return (
    <div className="refresh">
      <div className="shell">
        <PracticeHeader page="mock" onNavigate={confirmLeave} />

        <main className="py-6">
          {round.phase !== "ready" && (
            <ol
              aria-label="Round progress"
              className="mb-5 grid grid-cols-3 gap-2 rounded-2xl border border-line bg-card p-3"
            >
              {MOCK_PROMPTS.map((q, i) => {
                const turn = round.turns.find((t) => t.questionIndex === i);
                const current = currentIndex === i;
                const answered = turn && turn.answer !== null;
                const status = answered
                  ? "✓ Answered"
                  : turn
                    ? "Skipped"
                    : current
                      ? "Current"
                      : round.phase === "review"
                        ? "Not included"
                        : "Up next";
                return (
                  <li
                    key={q.id}
                    aria-current={current ? "step" : undefined}
                    className={`rounded-xl border p-2 text-xs sm:p-3 ${answered ? "border-success-line bg-success-tint text-success" : current ? "border-marigold text-marigold" : "border-line bg-pebble text-muted"}`}
                  >
                    <span className="block font-bold">
                      {TRACK_LABELS[q.track]}
                    </span>
                    <span>{status}</span>
                  </li>
                );
              })}
            </ol>
          )}
          {round.phase === "ready" && (
            <section className={CARD}>
              <p className="text-xs font-bold uppercase tracking-widest text-muted">
                Typed rehearsal · 3 fixed questions
              </p>
              <h1
                ref={headingRef}
                tabIndex={-1}
                className="font-display mt-2 text-3xl font-extrabold tracking-tight outline-none sm:text-4xl"
              >
                Three-question mock interview
              </h1>
              <p className="mt-4 text-sm leading-7 text-muted">
                Work through three mixed interview prompts—behavioral, software
                engineering, and AI/ML—one turn at a time without hints or
                coaching between questions.
              </p>
              <p className="mt-4 rounded-xl border border-line bg-pebble px-4 py-3 text-xs leading-6 text-ink">
                <strong>Page-memory only:</strong> Your typed drafts, answers,
                and revisions stay in this page’s memory only. Leaving this
                page—including refreshing, closing the tab, or using browser
                Back—may lose your text.
              </p>
              <button
                type="button"
                onClick={() => dispatch({ type: "start" })}
                className={`mt-6 w-full sm:w-auto ${BTN_PRIMARY}`}
              >
                Start mock interview
              </button>
            </section>
          )}

          {round.phase === "answering" &&
            (() => {
              const idx = round.turns.length;
              const q = MOCK_PROMPTS[idx];
              const hasDraft = round.draft.trim().length > 0;
              return (
                <section className={CARD}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-bold uppercase tracking-widest text-muted">
                      Question {idx + 1} of {total}
                    </p>
                    <span className="text-xs text-muted">
                      {TRACK_LABELS[q.track] ?? q.track} · Page memory only
                      (leaving or browser Back may lose text)
                    </span>
                  </div>
                  <h1
                    ref={headingRef}
                    tabIndex={-1}
                    className="font-display mt-3 whitespace-pre-wrap break-words text-xl font-bold leading-8 tracking-tight outline-none sm:text-2xl"
                  >
                    {q.prompt}
                  </h1>
                  <div className="mt-6">
                    <label
                      htmlFor="mock-answer-input"
                      className="block text-sm font-bold text-ink"
                    >
                      Your answer
                    </label>
                    <textarea
                      id="mock-answer-input"
                      rows={7}
                      maxLength={MAX_ANSWER_LENGTH}
                      value={round.draft}
                      onChange={(e) =>
                        dispatch({
                          type: "draft",
                          questionIndex: idx,
                          text: e.target.value,
                        })
                      }
                      className={TEXTAREA}
                      placeholder="Type your response..."
                    />
                  </div>
                  <div className="mt-6 grid gap-3 sm:flex sm:flex-wrap sm:items-center sm:justify-between">
                    <div className="grid gap-3 sm:flex sm:flex-wrap">
                      <button
                        type="button"
                        disabled={!hasDraft}
                        onClick={() =>
                          dispatch({ type: "next", questionIndex: idx })
                        }
                        className={BTN_PRIMARY}
                      >
                        {idx + 1 === total
                          ? "Finish round"
                          : "Save and continue"}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          (!hasDraft ||
                            window.confirm(
                              "Skip this question and discard your current nonblank draft?",
                            )) &&
                          dispatch({ type: "skip", questionIndex: idx })
                        }
                        className={BTN_SECONDARY}
                      >
                        Skip question
                      </button>
                    </div>
                    <div className="grid gap-3 sm:flex sm:flex-wrap">
                      {(idx + 1 < total || !hasDraft) && (
                        <button
                          type="button"
                          onClick={() =>
                            dispatch({ type: "end", questionIndex: idx })
                          }
                          className={BTN_SECONDARY}
                        >
                          End round early
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={confirmDiscard}
                        className={BTN_DANGER}
                      >
                        Discard round
                      </button>
                    </div>
                  </div>
                </section>
              );
            })()}

          {round.phase === "review" &&
            (() => {
              const omitted = total - round.turns.length;
              const activeQ =
                activeIdx !== null ? MOCK_PROMPTS[activeIdx] : undefined;
              return (
                <div className="space-y-6">
                  <section aria-label="Round answers" className={CARD}>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-bold uppercase tracking-widest text-muted">
                          Round review · Self-review only
                        </p>
                        <h1
                          ref={headingRef}
                          tabIndex={-1}
                          className="font-display mt-1 text-2xl font-bold tracking-tight outline-none"
                        >
                          Round answers
                        </h1>
                      </div>
                      <button
                        type="button"
                        onClick={confirmDiscard}
                        className={`w-full sm:w-auto ${BTN_SECONDARY}`}
                      >
                        Start new round
                      </button>
                    </div>
                    <p className="mt-2 text-xs text-muted">
                      Answers stay in page memory only; leaving or using browser
                      Back may lose text. Original responses are shown verbatim.
                    </p>
                    {omitted > 0 && (
                      <p className="mt-4 rounded-xl border border-line bg-pebble px-4 py-3 text-sm text-body">
                        {omitted} {omitted === 1 ? "question" : "questions"} not
                        included in this review.
                      </p>
                    )}
                    {round.turns.length === 0 ? (
                      <p className="mt-4 text-sm text-muted">
                        No turns were completed before ending the round.
                      </p>
                    ) : (
                      <ol className="mt-6 space-y-4">
                        {round.turns.map((turn) => {
                          const q = MOCK_PROMPTS[turn.questionIndex];
                          return (
                            <li
                              key={turn.questionIndex}
                              className="rounded-xl border border-line p-4"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <span className="text-xs font-bold uppercase tracking-wider text-muted">
                                  Question {turn.questionIndex + 1} of {total}
                                </span>
                                <span className="rounded-full bg-pebble px-2.5 py-0.5 text-xs font-semibold text-body">
                                  {turn.answer === null
                                    ? "Skipped"
                                    : "Answered"}
                                </span>
                              </div>
                              <p className="mt-2 whitespace-pre-wrap break-words text-sm font-semibold text-ink">
                                {q.prompt}
                              </p>
                              <div className="mt-3 rounded-lg bg-pebble p-3">
                                <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                                  Original answer
                                </p>
                                {turn.answer === null ? (
                                  <p className="mt-1 text-sm italic text-muted">
                                    Skipped — no answer typed.
                                  </p>
                                ) : (
                                  <p className="mt-1 whitespace-pre-wrap break-words text-sm text-ink">
                                    {turn.answer}
                                  </p>
                                )}
                              </div>
                            </li>
                          );
                        })}
                      </ol>
                    )}
                    {round.turns.length > 0 && !round.showDebrief && (
                      <button
                        type="button"
                        onClick={() => dispatch({ type: "debrief" })}
                        className={`mt-6 w-full sm:w-auto ${BTN_PRIMARY}`}
                      >
                        Open debrief
                      </button>
                    )}
                  </section>

                  {debriefOpened && round.turns.length > 0 && (
                    <section aria-label="Self-review debrief" className={CARD}>
                      <p className="text-xs font-bold uppercase tracking-widest text-muted">
                        Self-review · Not an assessment
                      </p>
                      <h2
                        ref={debriefHeadingRef}
                        tabIndex={-1}
                        className="font-display mt-1 text-xl font-bold tracking-tight outline-none"
                      >
                        Self-review debrief
                      </h2>
                      <p
                        id="debrief-question-choice"
                        className="mt-2 text-sm font-semibold text-ink"
                      >
                        Which answer felt hardest?
                      </p>
                      <div
                        role="group"
                        aria-labelledby="debrief-question-choice"
                        className="mt-4 flex flex-wrap gap-2"
                      >
                        {round.turns.map((turn) => (
                          <button
                            key={turn.questionIndex}
                            type="button"
                            aria-pressed={turn.questionIndex === activeIdx}
                            onClick={() => setSelectedTurn(turn.questionIndex)}
                            className={`${FOCUS_RING} rounded-lg px-3 py-2 text-xs font-bold ${turn.questionIndex === activeIdx ? "bg-ink text-white" : "border border-line-strong bg-white text-body hover:bg-pebble"}`}
                          >
                            Revisit question {turn.questionIndex + 1}
                          </button>
                        ))}
                      </div>
                      {activeIdx !== null && activeQ && (
                        <>
                          <p className="mt-4 whitespace-pre-wrap break-words text-sm font-semibold text-ink">
                            Question {activeIdx + 1}: {activeQ.prompt}
                          </p>
                          {activeQ.hints[0] && (
                            <div className="mt-3 rounded-xl border border-line bg-pebble p-4">
                              <p className="text-xs font-bold uppercase tracking-wider text-ink">
                                Self-review hint
                              </p>
                              <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-ink">
                                {activeQ.hints[0]}
                              </p>
                              {activeQ.hints[1] && (
                                <div className="mt-3">
                                  <button
                                    type="button"
                                    aria-expanded={Boolean(
                                      extraHints[activeIdx],
                                    )}
                                    aria-controls={`extra-hint-${activeIdx}`}
                                    onClick={() =>
                                      setExtraHints((prev) => ({
                                        ...prev,
                                        [activeIdx]: !prev[activeIdx],
                                      }))
                                    }
                                    className={BTN_SECONDARY}
                                  >
                                    {extraHints[activeIdx]
                                      ? "Hide extra hint"
                                      : "Reveal another hint"}
                                  </button>
                                  <div
                                    id={`extra-hint-${activeIdx}`}
                                    hidden={!extraHints[activeIdx]}
                                    className="mt-2"
                                  >
                                    <p className="whitespace-pre-wrap break-words text-sm leading-6 text-ink">
                                      {activeQ.hints[1]}
                                    </p>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                          <div className="mt-4">
                            <label
                              htmlFor={`revision-${activeIdx}`}
                              className="block text-sm font-bold text-ink"
                            >
                              Revision for question {activeIdx + 1} (keeps
                              original above unchanged)
                            </label>
                            <textarea
                              id={`revision-${activeIdx}`}
                              rows={5}
                              maxLength={MAX_ANSWER_LENGTH}
                              value={round.revisions[activeIdx] ?? ""}
                              onChange={(e) =>
                                dispatch({
                                  type: "revise",
                                  questionIndex: activeIdx,
                                  text: e.target.value,
                                })
                              }
                              className={TEXTAREA}
                              placeholder="Draft a revised answer here without overwriting your original above..."
                            />
                          </div>
                        </>
                      )}
                    </section>
                  )}
                </div>
              );
            })()}
        </main>
      </div>
    </div>
  );
}
