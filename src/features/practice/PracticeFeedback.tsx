import { evaluationCriteria, type AnswerAttempt, type InterviewQuestion } from "../../domain/interview/practice";
import type { AttemptRecord } from "../../domain/interview/attempt-record";
import { FollowUpCard } from "./FollowUpCard";
import { RetryComparisonPanel } from "./RetryComparisonPanel";

const button =
  "rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600";

interface PracticeFeedbackProps {
  latest: AnswerAttempt;
  displayedQuestion: InterviewQuestion;
  questionAttempts: AnswerAttempt[];
  previous?: AttemptRecord;
  baselineLoading: boolean;
  baselineError?: string | null;
  onRetryBaseline: () => void;
  pending: boolean;
  canShowFollowUpCard: boolean;
  hasUnsentDraftChanges: boolean;
  onAnswerFollowUp: () => void;
  onRetryOriginalAnswer: () => void;
  onSelectAttempt: (attempt: AnswerAttempt) => void;
}

export function PracticeFeedback({
  latest,
  displayedQuestion,
  questionAttempts,
  previous,
  baselineLoading,
  baselineError,
  onRetryBaseline,
  pending,
  canShowFollowUpCard,
  hasUnsentDraftChanges,
  onAnswerFollowUp,
  onRetryOriginalAnswer,
  onSelectAttempt,
}: PracticeFeedbackProps) {
  const latestIndex = questionAttempts.findIndex((item) => item.id === latest.id);
  const previousIndex = previous
    ? questionAttempts.findIndex((item) => item.id === previous.id)
    : -1;

  const shownAnswers = [
    ...(previous
      ? [
          {
            id: previous.id,
            answer: previous.answer,
            label: previousIndex >= 0 ? `Attempt ${previousIndex + 1}` : "Linked earlier answer",
          },
        ]
      : []),
    {
      id: latest.id,
      answer: latest.answer,
      label: `Attempt ${(latestIndex >= 0 ? latestIndex : questionAttempts.length - 1) + 1}`,
    },
  ];

  const otherAttempts = questionAttempts.filter(
    (attempt) => attempt.id !== latest.id && attempt.id !== previous?.id,
  );

  return (
    <>
      <section
        aria-label="Answer feedback"
        className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-7"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xl font-bold">Your next step, not a final score.</h2>
          <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">
            {latest.provenance.mode === "demo"
              ? "Illustrative demo feedback"
              : `Gemini · ${latest.provenance.model}${latest.provenance.thinkingLevel ? " · low thinking" : ""}`}
          </span>
        </div>
        {latest.evaluation.criteria && (
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {Object.entries(evaluationCriteria).map(([key, label]) => {
              const criterion =
                latest.evaluation.criteria![key as keyof typeof evaluationCriteria];
              return (
                <article key={key} className="rounded-xl border border-slate-200 p-4">
                  <h3 className="text-sm font-bold">{label}</h3>
                  <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-indigo-700">
                    {criterion.status.replaceAll("-", " ")}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{criterion.observation}</p>
                  {criterion.excerpt && (
                    <blockquote className="mt-2 border-l-2 border-indigo-200 pl-3 text-sm italic">
                      “{criterion.excerpt}”
                    </blockquote>
                  )}
                </article>
              );
            })}
          </div>
        )}
        <RetryComparisonPanel
          attempt={latest}
          previousNumber={previousIndex >= 0 ? previousIndex + 1 : undefined}
        />
        <h3 className="mt-6 font-bold">What to build on</h3>
        {latest.evaluation.strengths.map((item, index) => (
          <div key={index} className="mt-3 rounded-xl bg-emerald-50 p-4">
            <p className="text-sm leading-6">{item.observation}</p>
            <blockquote className="mt-2 border-l-2 border-emerald-300 pl-3 text-sm italic text-slate-600">
              “{item.excerpt}”
            </blockquote>
          </div>
        ))}
        <h3 className="mt-6 font-bold">What to improve</h3>
        {latest.evaluation.gaps.map((item, index) => (
          <div key={index} className="mt-3 rounded-xl bg-slate-50 p-4">
            <p className="text-sm font-semibold">{item.observation}</p>
            <p className="mt-2 text-sm leading-6 text-slate-600">{item.nextStep}</p>
          </div>
        ))}
        <h3 className="mt-6 font-bold">Try this next</h3>
        <ul className="mt-2 list-disc space-y-2 pl-5 text-sm leading-6">
          {latest.evaluation.nextSteps.map((step, index) => (
            <li key={index}>{step}</li>
          ))}
        </ul>
        {latest.evaluation.uncertainty.length > 0 && (
          <div className="mt-4 rounded-xl border border-amber-200 p-4 text-sm text-amber-900">
            <h3 className="font-bold">Limitations / uncertainty</h3>
            {latest.evaluation.uncertainty.map((item, index) => (
              <p className="mt-2" key={index}>
                {item}
              </p>
            ))}
          </div>
        )}
        {displayedQuestion.track === "behavioral" ? (
          <p className="mt-5 rounded-xl border border-slate-200 p-4 text-sm leading-6 text-slate-600">
            Personal stories stay yours: use the feedback to revise your answer without invented
            achievements or outcomes. Automatic behavioral rewrites are not shown.
          </p>
        ) : (
          <details className="mt-5 rounded-xl border border-slate-200 p-4">
            <summary className="cursor-pointer text-sm font-semibold">
              Optional suggested answer · try improving yours first
            </summary>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-7">
              {latest.evaluation.suggestedAnswer}
            </p>
          </details>
        )}
        {canShowFollowUpCard && latest.evaluation.followUp && (
          <FollowUpCard
            proposal={latest.evaluation.followUp}
            demo={latest.provenance.mode === "demo"}
            disabled={pending}
            hasUnsentDraftChanges={hasUnsentDraftChanges}
            onAnswer={onAnswerFollowUp}
            onRetry={onRetryOriginalAnswer}
          />
        )}
        {latest.provenance.usage && (
          <p className="mt-4 text-xs text-slate-500">
            Provider-reported tokens: {latest.provenance.usage.inputTokens} input ·{" "}
            {latest.provenance.usage.outputTokens} output ·{" "}
            {latest.provenance.usage.thinkingTokens} thinking. Token counts are not a billing total.
          </p>
        )}
        <p className="mt-5 text-sm text-indigo-700">
          Edit your answer above and submit a retry. Earlier attempts remain unchanged.
        </p>
      </section>
      <section
        aria-label="Attempt comparison"
        className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-7"
      >
        <h2 className="text-xl font-bold">Your attempts</h2>
        <p className="mt-2 text-sm text-slate-500">
          Compare your submitted answers. Retry feedback uses the linked earlier attempt, not an
          assumed score increase.
        </p>
        {baselineLoading && (
          <p role="status" className="mt-3 text-sm text-slate-600">
            Loading the linked earlier answer…
          </p>
        )}
        {baselineError && (
          <p role="alert" className="mt-3 text-sm text-red-800">
            {baselineError}{" "}
            <button type="button" disabled={pending} className="underline" onClick={onRetryBaseline}>
              Retry loading baseline
            </button>
          </p>
        )}
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {shownAnswers.map((attempt) => {
            const targetAttempt = questionAttempts.find((item) => item.id === attempt.id);
            return (
              <article key={attempt.id} className="rounded-xl border border-slate-200 p-4">
                <h3 className="text-sm font-bold">{attempt.label}</h3>
                <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-7">
                  {attempt.answer}
                </p>
                {attempt.id !== latest.id && targetAttempt && (
                  <button
                    type="button"
                    className={`${button} mt-3`}
                    disabled={pending}
                    onClick={() => onSelectAttempt(targetAttempt)}
                  >
                    View feedback for {attempt.label.toLowerCase()}
                  </button>
                )}
              </article>
            );
          })}
        </div>
        {otherAttempts.length > 0 && (
          <details className="mt-4">
            <summary className="cursor-pointer text-sm font-semibold">
              Earlier attempts ({otherAttempts.length})
            </summary>
            {otherAttempts.map((attempt) => {
              const number = questionAttempts.findIndex((item) => item.id === attempt.id) + 1;
              return (
                <div key={attempt.id} className="mt-3 border-t border-slate-100 pt-3">
                  <p className="whitespace-pre-wrap text-sm leading-6">
                    Attempt {number}: {attempt.answer}
                  </p>
                  <button
                    type="button"
                    className={`${button} mt-2`}
                    disabled={pending}
                    onClick={() => onSelectAttempt(attempt)}
                  >
                    View feedback for attempt {number}
                  </button>
                </div>
              );
            })}
          </details>
        )}
      </section>
    </>
  );
}
