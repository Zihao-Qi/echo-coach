import type { AnswerAttempt } from "./practice";

// Preserve parent-before-child ordering when timestamps tie (or an older saved
// retry completes later). UUID lexical order is not submission order.
export function orderAttempts(attempts: readonly AnswerAttempt[]): AnswerAttempt[] {
  const byId = new Map(attempts.map((attempt) => [attempt.id, attempt]));
  const children = new Map<string, AnswerAttempt[]>();
  const roots: AnswerAttempt[] = [];
  for (const attempt of byId.values()) {
    if (attempt.previousAttemptId && byId.has(attempt.previousAttemptId)) {
      const siblings = children.get(attempt.previousAttemptId) || [];
      siblings.push(attempt); children.set(attempt.previousAttemptId, siblings);
    } else roots.push(attempt);
  }
  const compare = (a: AnswerAttempt, b: AnswerAttempt) => a.submittedAt.localeCompare(b.submittedAt) || a.id.localeCompare(b.id);
  const ready = roots.sort(compare), ordered: AnswerAttempt[] = [], seen = new Set<string>();
  while (ready.length) {
    const attempt = ready.shift()!;
    if (seen.has(attempt.id)) continue;
    seen.add(attempt.id); ordered.push(attempt);
    ready.push(...(children.get(attempt.id) || [])); ready.sort(compare);
  }
  // Defensive fallback for malformed historical cycles, not a valid new lineage.
  return [...ordered, ...[...byId.values()].filter((attempt) => !seen.has(attempt.id)).sort(compare)];
}
