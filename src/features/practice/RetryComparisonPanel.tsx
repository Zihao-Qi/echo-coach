import type { AnswerAttempt } from "../../domain/interview/practice";

export function RetryComparisonPanel({ attempt, previousNumber }: { attempt: AnswerAttempt; previousNumber?: number }) {
  if (!attempt.previousAttemptId) return null;
  const comparison = attempt.evaluation.comparison;
  const baseline = previousNumber ? `Attempt ${previousNumber}` : "your linked earlier attempt";
  if (!comparison) return <p className="mt-5 rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-600">No model comparison is available for this retry. An unchanged answer does not demonstrate improvement. Review the submitted answers below.</p>;
  return (
    <section aria-label="Retry feedback" className="mt-5 rounded-xl border border-indigo-200 bg-indigo-50/40 p-4">
      <h3 className="font-bold">What changed since {baseline}?</h3>
      <p className="mt-2 text-xs text-slate-500">{attempt.provenance.mode === "demo" ? "Illustrative demo · not an improvement assessment" : "Model assessment of answer changes · not a hiring prediction or verification of personal claims"}</p>
      <p className="mt-3 text-sm leading-6">{comparison.summary}</p>
      {comparison.changes.map((change, index) => <article key={index} className="mt-4 rounded-xl border border-indigo-100 bg-white p-4">
        <h4 className="text-xs font-bold uppercase tracking-wide text-indigo-700">{change.kind}</h4>
        <p className="mt-2 text-sm leading-6">{change.observation}</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <blockquote className="border-l-2 border-slate-200 pl-3 text-sm leading-6"><span className="block text-xs font-semibold text-slate-500">Before</span>“{change.beforeExcerpt}”</blockquote>
          <blockquote className="border-l-2 border-indigo-200 pl-3 text-sm leading-6"><span className="block text-xs font-semibold text-slate-500">After</span>“{change.afterExcerpt}”</blockquote>
        </div>
      </article>)}
      <p className="mt-4 text-sm leading-6"><strong>Focus for the next retry:</strong> {comparison.nextFocus}</p>
    </section>
  );
}
