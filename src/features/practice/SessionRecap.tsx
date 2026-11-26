import Link from "next/link";
import type { RefObject } from "react";
import { findQuestion } from "../../content/questions/starter-bank";
import {
  completedAttempt,
  type AttemptRecord,
} from "../../domain/interview/attempt-record";
import { orderAttempts } from "../../domain/interview/attempt-order";
import type { AnswerAttempt } from "../../domain/interview/practice";
import { deriveFollowUpQuestionFromRecord } from "./practiceTarget";
import { trackLabel } from "./QuestionSwitcher";

function groupCompleted(records: readonly AttemptRecord[]) {
  const groups = new Map<string, AnswerAttempt[]>();
  for (const attempt of orderAttempts(
    records.flatMap((record) => completedAttempt(record) ?? []),
  )) {
    const group = groups.get(attempt.questionId) ?? [];
    group.push(attempt);
    // Deleting and re-inserting orders groups by the last loaded attempt in each.
    groups.delete(attempt.questionId);
    groups.set(attempt.questionId, group);
  }
  return [...groups.values()].reverse();
}

export function SessionRecap({
  records,
  temporary,
  hasOlder,
  loadOlder,
  back,
  headingRef,
  error,
}: {
  records: readonly AttemptRecord[];
  temporary: boolean;
  hasOlder: boolean;
  loadOlder: () => void;
  back: () => void;
  headingRef: RefObject<HTMLHeadingElement | null>;
  error: string | null;
}) {
  const groups = groupCompleted(records);
  return (
    <main className="space-y-5 py-6">
      <header className="panel">
        <h1
          ref={headingRef}
          tabIndex={-1}
          className="font-display text-3xl font-bold"
        >
          Session recap
        </h1>
        <p className="mt-2 text-sm text-muted">
          {temporary
            ? "From this session's temporary history. No scores or assessments."
            : "From your saved practice history. No scores or assessments."}
        </p>
      </header>
      {error && (
        <p role="alert" className="rounded-xl bg-danger-tint p-4 text-danger">
          {error}
        </p>
      )}
      {groups.length === 0 && (
        <p className="panel">
          Your session history is empty. It may have reset.
        </p>
      )}
      {groups.map((attempts) => {
        const first = attempts[0];
        const latest = attempts.at(-1)!;
        const followUp = !!latest.followUpOfAttemptId;
        const record = records.find((item) => item.id === latest.id);
        const question =
          [...attempts].reverse().find((item) => item.questionSnapshot)
            ?.questionSnapshot ??
          (followUp && record
            ? deriveFollowUpQuestionFromRecord(record, [...records])?.question
            : findQuestion(latest.questionId));
        const count = attempts.length;
        const concepts = question?.rubric.expectedConcepts ?? [];
        return (
          <section
            key={latest.questionId}
            className="panel min-w-0 break-words"
          >
            <h2 className="eyeline">
              {question ? trackLabel(question.track) : "Saved question"}
              {followUp && " · Follow-up"} · {count}{" "}
              {count === 1 ? "attempt" : "attempts"}
            </h2>
            <p className="mt-2 font-display text-xl font-bold">
              {question?.prompt ?? "Original question is unavailable."}
            </p>
            <div
              className={`mt-4 grid gap-3 ${count > 1 ? "sm:grid-cols-2" : ""}`}
            >
              {(count === 1 ? [first] : [first, latest]).map((attempt) => (
                <div
                  key={attempt.id}
                  className={`min-w-0 rounded-xl border p-4 ${attempt === latest ? "border-ink bg-card" : "border-line bg-pebble"}`}
                >
                  <h3 className="eyeline">
                    Attempt {attempt === first ? 1 : count}
                  </h3>
                  <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6">
                    {attempt.answer}
                  </p>
                </div>
              ))}
            </div>
            {concepts.length > 0 && (
              <>
                <h3 className="eyeline mt-5">Rubric concepts to review next</h3>
                <ul className="mt-2 divide-y divide-line rounded-xl border border-line">
                  {concepts.map((concept, index) => (
                    <li key={index} className="px-4 py-2 text-sm">
                      {concept}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        );
      })}
      {hasOlder && groups.length > 0 && (
        <div className="panel flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted">Showing recent attempts.</p>
          <button type="button" className="action" onClick={loadOlder}>
            Load older attempts
          </button>
        </div>
      )}
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          className="action w-full sm:w-auto"
          onClick={back}
        >
          Back to practice
        </button>
        {groups.length > 0 && (
          <Link className="primary w-full sm:w-auto" href="/mock-interview">
            Start 3-question mock interview
          </Link>
        )}
      </div>
    </main>
  );
}
