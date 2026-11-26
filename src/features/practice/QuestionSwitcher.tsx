import { useEffect, useRef, useState } from "react";
import { starterQuestions } from "../../content/questions/starter-bank";
import type {
  AnswerAttempt,
  InterviewQuestion,
  InterviewTrack,
} from "../../domain/interview/practice";

const tracks = [
  { id: "behavioral", label: "Behavioral" },
  { id: "swe", label: "Software engineering" },
  { id: "ai-ml", label: "AI / ML" },
] as const;
export function trackLabel(track: InterviewTrack) {
  return tracks.find((item) => item.id === track)!.label;
}
export function QuestionSwitcher({
  track,
  question,
  attempts,
  disabled,
  chooseTrack,
  chooseQuestion,
}: {
  track: InterviewTrack;
  question: InterviewQuestion;
  attempts: AnswerAttempt[];
  disabled: boolean;
  chooseTrack: (id: InterviewTrack) => void;
  chooseQuestion: (id: string) => void;
}) {
  const frame = useRef<HTMLDivElement>(null),
    strip = useRef<HTMLDivElement>(null),
    list = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({
    overflow: false,
    start: true,
    end: true,
  });
  useEffect(() => {
    const row = strip.current!,
      content = list.current!,
      outer = frame.current!;
    const measure = () =>
      setEdges({
        overflow: content.offsetWidth > outer.clientWidth + 1,
        start: row.scrollLeft <= 1,
        end: row.scrollLeft + row.clientWidth >= row.scrollWidth - 1,
      });
    const observer = new ResizeObserver(measure);
    [row, content, outer].forEach((el) => observer.observe(el));
    row.addEventListener("scroll", measure);
    return () => {
      observer.disconnect();
      row.removeEventListener("scroll", measure);
    };
  }, []);
  const questions = starterQuestions
    .filter((q) => q.track === track)
    .map((q) => {
      const n = attempts.filter(
        (a) => a.questionId === q.id && !a.followUpOfAttemptId,
      ).length;
      return {
        id: q.id,
        name: q.competency + (n ? ` · ${n} attempt${n === 1 ? "" : "s"}` : ""),
      };
    });
  const arrow = (left: boolean) =>
    edges.overflow && (
      <button
        type="button"
        className="action size-11 shrink-0 p-0"
        aria-label={`Scroll questions ${left ? "left" : "right"}`}
        disabled={disabled || (left ? edges.start : edges.end)}
        onClick={() => {
          const row = strip.current;
          if (row) row.scrollBy({ left: (left ? -1 : 1) * row.clientWidth });
        }}
      >
        {left ? "←" : "→"}
      </button>
    );
  return (
    <section
      className="rounded-2xl border border-line bg-card p-3.5"
      aria-label="Track and question selector"
    >
      <nav aria-label="Interview track" className="flex flex-wrap gap-1">
        {tracks.map((t) => (
          <button
            className="pill px-2.5 text-xs sm:px-4 sm:text-sm"
            aria-pressed={track === t.id}
            disabled={disabled}
            key={t.id}
            onClick={() => chooseTrack(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>
      <div className="relative mt-3 border-t border-line pt-3 sm:hidden">
        <select
          className="input-field appearance-none py-2 pr-10"
          aria-label="Choose a question"
          disabled={disabled}
          value={question.id}
          onChange={(e) => chooseQuestion(e.target.value)}
        >
          {!questions.some((q) => q.id === question.id) && (
            <option value={question.id} disabled>
              {question.competency}
            </option>
          )}
          {questions.map((q) => (
            <option key={q.id} value={q.id}>
              {q.name}
            </option>
          ))}
        </select>
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute right-4 bottom-3.5 size-4"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="m3 6 5 5 5-5" />
        </svg>
      </div>
      <div
        ref={frame}
        className="mt-3 hidden items-center gap-2 border-t border-line pt-3 sm:flex"
      >
        {arrow(true)}
        <div ref={strip} className="min-w-0 flex-1 overflow-x-auto p-1">
          <div
            ref={list}
            role="group"
            aria-label={`Questions in ${trackLabel(track)}`}
            className="flex w-max gap-2"
          >
            {questions.map((q) => (
              <button
                className="pill min-w-40 whitespace-nowrap"
                key={q.id}
                aria-pressed={q.id === question.id}
                disabled={disabled}
                onClick={() => chooseQuestion(q.id)}
              >
                {q.name}
              </button>
            ))}
          </div>
        </div>
        {arrow(false)}
      </div>
    </section>
  );
}
