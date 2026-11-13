import type { AttemptRecord } from "../../domain/interview/attempt-record";
import type { InterviewQuestion } from "../../domain/interview/practice";

interface FollowUpContextBannerProps {
  followUpOfAttemptId: string;
  parentRecord?: AttemptRecord;
  parentLoading: boolean;
  parentError?: string | null;
  onRetryParentLoad: () => void;
  rootQuestion?: InterviewQuestion;
  canReturnToRoot: boolean;
  disabled: boolean;
  onReturnToRoot: () => void;
}

export function FollowUpContextBanner({
  followUpOfAttemptId,
  parentRecord,
  parentLoading,
  parentError,
  onRetryParentLoad,
  rootQuestion,
  canReturnToRoot,
  disabled,
  onReturnToRoot,
}: FollowUpContextBannerProps) {
  const unavailableReasonId = `return-unavailable-${followUpOfAttemptId}`;

  return (
    <section
      aria-label="Follow-up context"
      className="mb-5 rounded-xl border border-indigo-200 bg-indigo-50/60 p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-indigo-700">
            Targeted follow-up · Depth 1
          </p>
          {rootQuestion ? (
            <p className="mt-1 text-sm font-semibold text-slate-800">
              Original question: {rootQuestion.prompt}
            </p>
          ) : (
            <p className="mt-1 text-sm text-slate-600">
              Linked to earlier attempt ({followUpOfAttemptId.slice(0, 8)})
            </p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1">
          <button
            type="button"
            disabled={disabled || !canReturnToRoot}
            aria-describedby={!canReturnToRoot ? unavailableReasonId : undefined}
            onClick={onReturnToRoot}
            className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
          >
            Return to original question
          </button>
          {!canReturnToRoot && (
            <p id={unavailableReasonId} className="text-xs text-slate-600">
              Original question is unavailable in the active catalog or saved snapshot.
            </p>
          )}
        </div>
      </div>
      {parentLoading && (
        <p role="status" className="mt-3 text-xs text-slate-600">
          Loading parent answer context…
        </p>
      )}
      {parentError && (
        <p role="alert" className="mt-3 text-xs text-red-800">
          {parentError}{" "}
          <button
            type="button"
            disabled={disabled}
            className="font-semibold underline disabled:cursor-not-allowed disabled:opacity-50"
            onClick={onRetryParentLoad}
          >
            Retry loading parent answer
          </button>
        </p>
      )}
      {parentRecord && (
        <details className="mt-3 rounded-lg border border-indigo-100 bg-white p-3">
          <summary className="cursor-pointer text-xs font-semibold text-slate-700">
            View your parent answer that triggered this follow-up
          </summary>
          <p className="mt-2 whitespace-pre-wrap break-words text-xs leading-6 text-slate-700">
            {parentRecord.answer}
          </p>
        </details>
      )}
    </section>
  );
}
