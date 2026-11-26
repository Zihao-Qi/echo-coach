import type { AnswerAttempt } from "../../domain/interview/practice";

export function RetryComparisonPanel({
  attempt,
  previousNumber,
}: {
  attempt: AnswerAttempt;
  previousNumber?: number;
}) {
  if (!attempt.previousAttemptId) return null;
  const comparison = attempt.evaluation.comparison;
  const baseline = previousNumber
    ? `Attempt ${previousNumber}`
    : "your linked earlier attempt";
  if (!comparison)
    return (
      <p className="mt-5 rounded-xl bg-pebble p-4 text-sm leading-6 text-muted">
        No model comparison is available for this retry. An unchanged answer
        does not demonstrate improvement. Compare the submitted answers above.
      </p>
    );
  return (
    <section
      aria-label="Retry feedback"
      className="mt-5 rounded-xl border border-line bg-pebble p-4"
    >
      {attempt.provenance.mode !== "demo" && (
        <>
          <h3 className="font-display font-bold">
            What changed since {baseline}?
          </h3>
          <p className="mt-2 text-xs text-muted">
            Model assessment of answer changes · not a hiring prediction or
            verification of personal claims
          </p>
          <p className="mt-3 text-sm leading-6">{comparison.summary}</p>
          {comparison.changes.map((change, index) => (
            <article
              key={index}
              className="mt-4 rounded-xl border border-line bg-white p-4"
            >
              <h4 className="text-xs font-bold uppercase tracking-wide text-body">
                {change.kind}
              </h4>
              <p className="mt-2 text-sm leading-6">{change.observation}</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <blockquote className="border-l-2 border-line pl-3 text-sm leading-6">
                  <span className="block text-xs font-semibold text-muted">
                    Before
                  </span>
                  “{change.beforeExcerpt}”
                </blockquote>
                <blockquote className="border-l-2 border-line pl-3 text-sm leading-6">
                  <span className="block text-xs font-semibold text-muted">
                    After
                  </span>
                  “{change.afterExcerpt}”
                </blockquote>
              </div>
            </article>
          ))}
        </>
      )}
      <p className="mt-4 text-sm leading-6">
        <strong>Focus for the next retry:</strong> {comparison.nextFocus}
      </p>
    </section>
  );
}
