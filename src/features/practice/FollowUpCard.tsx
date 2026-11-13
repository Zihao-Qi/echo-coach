import { evaluationCriteria, type FollowUpProposal } from "../../domain/interview/practice";

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
      className="mt-6 rounded-xl border border-indigo-200 bg-indigo-50/50 p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-bold uppercase tracking-widest text-indigo-600">
          Go one level deeper
        </p>
        <span className="rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-semibold text-indigo-800">
          Focus: {focusLabel}
        </span>
      </div>
      <h3 id="followup-card-heading" className="mt-3 text-lg font-bold leading-7 text-slate-900">
        {proposal.prompt}
      </h3>
      <p className="mt-2 text-sm leading-6 text-slate-600">{proposal.rationale}</p>
      {proposal.expectedConcepts.length > 0 && (
        <details className="mt-3 rounded-lg border border-indigo-100 bg-white/80 p-3">
          <summary className="cursor-pointer text-xs font-semibold text-indigo-800">
            Optional concepts to consider ({proposal.expectedConcepts.length})
          </summary>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-5 text-slate-700">
            {proposal.expectedConcepts.map((concept, index) => (
              <li key={`${concept}-${index}`}>{concept}</li>
            ))}
          </ul>
        </details>
      )}
      <p className="mt-3 text-xs text-slate-500">
        Based on your submitted and evaluated answer above
        {hasUnsentDraftChanges ? " (not your unsent draft edits)" : ""} ·{" "}
        {demo
          ? "Illustrative demo prompt"
          : "AI-generated question and focused rubric; not independently verified"}{" "}
        · answering is optional.
      </p>
      <div className="mt-4 flex flex-wrap gap-3">
        <button
          type="button"
          disabled={disabled}
          onClick={onAnswer}
          className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
        >
          Answer follow-up
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={onRetry}
          className="rounded-xl border border-indigo-300 bg-white px-4 py-2 text-sm font-semibold text-indigo-800 transition hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
        >
          Retry original answer
        </button>
      </div>
    </section>
  );
}
