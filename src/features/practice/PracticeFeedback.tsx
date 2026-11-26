import type { ReactNode, RefObject } from "react";
import {
  evaluationCriteria,
  type AnswerAttempt,
  type InterviewQuestion,
} from "../../domain/interview/practice";
import type { AttemptRecord } from "../../domain/interview/attempt-record";
import { SAMPLE_FEEDBACK_NOTICE } from "../../infrastructure/config/public-demo";
import { FollowUpCard } from "./FollowUpCard";
import { RetryComparisonPanel } from "./RetryComparisonPanel";

interface Props {
  headingRef: RefObject<HTMLHeadingElement | null>;
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
  nextQuestionLabel?: string;
  onChooseNextQuestion?: () => void;
}
function FeedbackSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="border-t border-line pt-4">
      <h3 className="eyeline mb-2">{title}</h3>
      {children}
    </section>
  );
}
export function PracticeFeedback({
  headingRef,
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
  nextQuestionLabel,
  onChooseNextQuestion,
}: Props) {
  const outline = [
    ["Situation", "Where you were and what was at stake."],
    ["Your decision", "What you chose to do and why."],
    ["Result", "What happened, with a concrete detail."],
    ["What you learned", "What you’d keep or change next time."],
  ];
  const demo = latest.provenance.mode === "demo",
    behavioral = displayedQuestion.track === "behavioral";
  const e = latest.evaluation,
    usage = latest.provenance.usage,
    concepts = displayedQuestion.rubric.expectedConcepts;
  const number = (id: string) =>
    questionAttempts.findIndex((a) => a.id === id) + 1;
  return (
    <section aria-label="Answer feedback" className="space-y-4">
      {demo && (
        <p className="flex gap-3 rounded-xl border border-line-strong bg-pebble p-4 text-sm">
          <span
            aria-hidden="true"
            className="inline-flex size-5 shrink-0 items-center justify-center rounded-full border text-xs font-bold"
          >
            i
          </span>
          <span>{SAMPLE_FEEDBACK_NOTICE}</span>
        </p>
      )}
      {questionAttempts.length >= 2 && (
        <div
          role="group"
          aria-label="Attempts"
          className="flex flex-wrap gap-2"
        >
          {questionAttempts.map((a, i) => (
            <button
              className="pill"
              aria-pressed={a.id === latest.id}
              disabled={pending}
              key={a.id}
              onClick={() => onSelectAttempt(a)}
            >
              Attempt {i + 1}
            </button>
          ))}
        </div>
      )}
      <div
        className={
          behavioral || !demo
            ? "grid items-start gap-5 lg:grid-cols-[7fr_5fr]"
            : "grid"
        }
      >
        <section
          aria-labelledby="primary-feedback-title"
          className="panel min-w-0 space-y-4 text-sm leading-6"
        >
          <div className="flex flex-wrap items-center gap-3">
            <h2
              id="primary-feedback-title"
              ref={headingRef}
              tabIndex={-1}
              className="font-display text-2xl font-bold"
            >
              {demo ? "Sample feedback" : "Feedback"}
            </h2>
            {!demo && (
              <span className="rounded-full bg-pebble px-3 py-1 text-xs font-semibold">
                Gemini · {latest.provenance.model}
                {latest.provenance.thinkingLevel ? " · low thinking" : ""}
              </span>
            )}
          </div>
          {!latest.previousAttemptId && (
            <details className="rounded-xl border border-line bg-card px-4">
              <summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold">
                Your answer
              </summary>
              <p className="whitespace-pre-wrap break-words pb-4 text-sm leading-6">
                {latest.answer}
              </p>
            </details>
          )}
          {!demo && e.criteria && (
            <FeedbackSection title="Criteria">
              {Object.entries(evaluationCriteria).map(([key, label]) => {
                const c = e.criteria![key as keyof typeof evaluationCriteria];
                return (
                  <article
                    className="py-2 [&+article]:border-t [&+article]:border-line"
                    key={key}
                  >
                    <h4 className="font-bold">
                      {label}{" "}
                      <span className="ml-1 rounded-full bg-pebble px-2 py-1 text-xs">
                        {c.status.replaceAll("-", " ")}
                      </span>
                    </h4>
                    <p>{c.observation}</p>
                    {c.excerpt && (
                      <blockquote className="text-muted">
                        “{c.excerpt}”
                      </blockquote>
                    )}
                  </article>
                );
              })}
            </FeedbackSection>
          )}
          <FeedbackSection title="What to build on">
            {e.strengths.map((s, i) => (
              <div key={i} className="mt-2 min-w-0 break-words">
                <blockquote className="rounded-r-xl border-l-4 border-ink bg-pebble px-4 py-3">
                  “{s.excerpt}”
                </blockquote>
                <p className="mt-1 text-xs text-muted">
                  {demo
                    ? "Preserved from your answer. Not assessed."
                    : s.observation}
                </p>
              </div>
            ))}
          </FeedbackSection>
          <FeedbackSection title="What to improve">
            {e.gaps.map((g, i) => (
              <div key={i} className="mt-3">
                <p className="font-semibold">{g.observation}</p>
                <p className="text-body">{g.nextStep}</p>
              </div>
            ))}
          </FeedbackSection>
          <FeedbackSection title="Next step">
            <ul className="list-disc space-y-1 pl-5">
              {e.nextSteps.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </FeedbackSection>
          {concepts.length > 0 && (
            <FeedbackSection title="Rubric items to check">
              <ul className="divide-y divide-line rounded-xl border border-line">
                {concepts.map((s, i) => (
                  <li className="px-4 py-2" key={i}>
                    {s}
                  </li>
                ))}
              </ul>
            </FeedbackSection>
          )}
          {!demo && e.uncertainty.length > 0 && (
            <FeedbackSection title="Limits">
              {e.uncertainty.map((s, i) => (
                <p key={i}>{s}</p>
              ))}
            </FeedbackSection>
          )}
        </section>
        {behavioral ? (
          <section className="panel">
            <h3 className="mb-3 font-display text-xl font-bold">
              Structure outline
            </h3>
            <p className="text-sm leading-6 text-body">
              Behavioral answers aren&apos;t rewritten, so your stories stay
              yours. Use this outline to shape your own draft.
            </p>
            <ol className="mt-4 divide-y divide-line rounded-xl border border-line">
              {outline.map(([step, guidance], i) => (
                <li key={step} className="px-4 py-3">
                  <p className="text-sm font-semibold">
                    {i + 1}. {step}
                  </p>
                  <p className="mt-1 text-sm leading-5 text-muted">
                    {guidance}
                  </p>
                </li>
              ))}
            </ol>
          </section>
        ) : (
          !demo && (
            <details className="panel">
              <summary className="cursor-pointer font-semibold">
                Optional suggested answer · try improving yours first
              </summary>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-7">
                {e.suggestedAnswer}
              </p>
            </details>
          )
        )}
      </div>
      {latest.previousAttemptId && (
        <section aria-label="Attempt comparison" className="panel">
          <h3 className="font-display text-xl font-bold">
            Compare your attempts
          </h3>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-line bg-pebble p-4">
              {baselineLoading && (
                <p role="status">Loading the linked earlier answer…</p>
              )}
              {baselineError && (
                <p role="alert" className="text-danger">
                  {baselineError}{" "}
                  <button
                    className="action"
                    disabled={pending}
                    onClick={onRetryBaseline}
                  >
                    Retry loading baseline
                  </button>
                </p>
              )}
              {previous && (
                <>
                  <h4 className="eyeline">
                    {number(previous.id)
                      ? `Attempt ${number(previous.id)}`
                      : "Linked earlier answer"}
                  </h4>
                  <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6">
                    {previous.answer}
                  </p>
                </>
              )}
            </div>
            <div className="rounded-xl border border-ink bg-card p-4">
              <h4 className="eyeline text-ink">
                Attempt {number(latest.id)} (current)
              </h4>
              <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6">
                {latest.answer}
              </p>
            </div>
          </div>
          <RetryComparisonPanel
            attempt={latest}
            previousNumber={previous ? number(previous.id) : undefined}
          />
          {nextQuestionLabel && (
            <button
              className="action mt-4 text-left"
              disabled={pending}
              onClick={onChooseNextQuestion}
            >
              {nextQuestionLabel}
            </button>
          )}
        </section>
      )}
      {canShowFollowUpCard && e.followUp && (
        <FollowUpCard
          proposal={e.followUp}
          demo={demo}
          disabled={pending}
          hasUnsentDraftChanges={hasUnsentDraftChanges}
          onAnswer={onAnswerFollowUp}
          onRetry={onRetryOriginalAnswer}
        />
      )}
      {!demo && usage && (
        <p className="text-xs text-muted">
          Provider-reported tokens: {usage.inputTokens} input ·{" "}
          {usage.outputTokens} output · {usage.thinkingTokens} thinking. Token
          counts are not a billing total.
        </p>
      )}
    </section>
  );
}
