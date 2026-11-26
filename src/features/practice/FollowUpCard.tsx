import {
  evaluationCriteria,
  type FollowUpProposal,
} from "../../domain/interview/practice";

interface FollowUpCardProps {
  proposal: FollowUpProposal;
  demo: boolean;
  disabled: boolean;
  hasUnsentDraftChanges?: boolean;
  onAnswer: () => void;
  onRetry: () => void;
}

export function FollowUpCard({
  proposal,
  demo,
  disabled,
  hasUnsentDraftChanges = false,
  onAnswer,
  onRetry,
}: FollowUpCardProps) {
  const focusLabel = evaluationCriteria[proposal.focus] || proposal.focus;

  return (
    <section
      aria-labelledby="followup-card-heading"
      className="rounded-3xl border border-line bg-pebble p-5 lg:flex lg:items-center lg:justify-between lg:gap-5"
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs font-bold uppercase tracking-widest text-muted">
            Optional follow-up
          </p>
          {!demo && (
            <span className="rounded-full border border-line bg-card px-2.5 py-0.5 text-xs font-semibold text-ink">
              Focus: {focusLabel}
            </span>
          )}
        </div>
        <h3
          id="followup-card-heading"
          className="font-display mt-3 text-lg font-bold leading-7 text-ink"
        >
          {proposal.prompt}
        </h3>
        {!demo && (
          <>
            <p className="mt-2 text-sm leading-6 text-muted">
              {proposal.rationale}
            </p>
            {proposal.expectedConcepts.length > 0 && (
              <details className="mt-3 rounded-lg border border-line bg-white/80 p-3">
                <summary className="cursor-pointer text-xs font-semibold text-ink">
                  Optional concepts to consider (
                  {proposal.expectedConcepts.length})
                </summary>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-5 text-body">
                  {proposal.expectedConcepts.map((concept, index) => (
                    <li key={`${concept}-${index}`}>{concept}</li>
                  ))}
                </ul>
              </details>
            )}
            <p className="mt-3 text-xs text-muted">
              Based on your submitted and evaluated answer above
              {hasUnsentDraftChanges ? " (not your unsent draft edits)" : ""} ·
              AI-generated question and focused rubric; not independently
              verified · answering is optional.
            </p>
          </>
        )}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 lg:mt-0 lg:shrink-0 lg:grid-cols-none lg:grid-flow-col">
        <button
          type="button"
          disabled={disabled}
          onClick={onAnswer}
          className="primary px-2 text-xs sm:px-4 sm:text-sm"
        >
          Answer follow-up
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={onRetry}
          className="action px-2 text-xs sm:px-4 sm:text-sm"
        >
          Retry original answer
        </button>
      </div>
    </section>
  );
}
