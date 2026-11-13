import { SCORING, type PilotFixture } from "./spec";

export function lexicalTokens(text: string) {
  return text.normalize("NFKC").toLowerCase().replace(/[’']/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim().split(/\s+/).filter(Boolean);
}
export function normalizedTokens(text: string, aliases: [string, string][]) {
  const tokens = lexicalTokens(text);
  const rules = aliases.map(([from, to]) => ({ from: lexicalTokens(from), to: lexicalTokens(to) })).sort((a, b) => b.from.length - a.from.length);
  const out: string[] = [];
  for (let index = 0; index < tokens.length;) {
    const match = rules.find((rule) => rule.from.length && rule.from.every((word, offset) => tokens[index + offset] === word));
    if (match) { out.push(...match.to); index += match.from.length; } else out.push(tokens[index++]);
  }
  return out;
}
interface Edits { substitutions: number; deletions: number; insertions: number }
function total(edits: Edits) { return edits.substitutions + edits.deletions + edits.insertions; }
// Two rows bound memory; deterministic ties prefer substitution, then deletion.
export function wordErrors(reference: string[], hypothesis: string[]) {
  let row: Edits[] = Array.from({ length: hypothesis.length + 1 }, (_, index) => ({ substitutions: 0, deletions: 0, insertions: index }));
  for (let i = 1; i <= reference.length; i++) {
    const next: Edits[] = [{ substitutions: 0, deletions: i, insertions: 0 }];
    for (let j = 1; j <= hypothesis.length; j++) {
      if (reference[i - 1] === hypothesis[j - 1]) { next.push(row[j - 1]); continue; }
      const choices = [
        { ...row[j - 1], substitutions: row[j - 1].substitutions + 1 },
        { ...row[j], deletions: row[j].deletions + 1 },
        { ...next[j - 1], insertions: next[j - 1].insertions + 1 },
      ];
      next.push(choices.reduce((best, item) => total(item) < total(best) ? item : best));
    }
    row = next;
  }
  const edits = row[hypothesis.length];
  return { ...edits, referenceWords: reference.length, hypothesisWords: hypothesis.length,
    errors: total(edits), wer: reference.length ? total(edits) / reference.length : null };
}
function contains(tokens: string[], phrase: string[]) {
  return !!phrase.length && tokens.some((_, i) => phrase.every((word, offset) => tokens[i + offset] === word));
}
export function scoreTranscript(fixture: PilotFixture, transcript: string, aliases: [string, string][]) {
  if (transcript.length > 10000) throw new Error("Transcript exceeds the pilot contract.");
  const reference = normalizedTokens(fixture.reference, aliases);
  const hypothesis = normalizedTokens(transcript, aliases);
  const normalized = wordErrors(reference, hypothesis);
  const raw = wordErrors(lexicalTokens(fixture.reference), lexicalTokens(transcript));
  const missingCriticalPhrases = fixture.criticalPhrases.filter((phrase) => !contains(hypothesis, normalizedTokens(phrase, aliases)));
  const tailPresent = !fixture.tailPhrase || contains(hypothesis, normalizedTokens(fixture.tailPhrase, aliases));
  const isNoise = fixture.id === "STT-04";
  const acceptedNoSpeechMarker = isNoise && (SCORING.noSpeechMarkers as readonly string[]).includes(transcript.trim().toLowerCase());
  const countFillers = (tokens: string[]) => tokens.filter((token) => (SCORING.fillers as readonly string[]).includes(token)).length;
  return {
    fixtureId: fixture.id, rawLexical: raw, normalized, missingCriticalPhrases, tailPresent,
    referenceFillerCount: countFillers(lexicalTokens(fixture.reference)), hypothesisFillerCount: countFillers(lexicalTokens(transcript)),
    hallucinatedWords: isNoise ? (acceptedNoSpeechMarker ? 0 : lexicalTokens(transcript).length) : null,
    normalizedWerWithinCeiling: isNoise ? null : normalized.wer! <= (fixture.id === "STT-05" ? SCORING.noisyWer : SCORING.perCleanWer),
    manualReview: "pending" as const, manualChecks: [...SCORING.manualChecks],
    note: "Phrase/count checks are probes, not semantic correctness or an overall pass. A person must review fidelity and readability.",
  };
}
export function pooledCleanWer(rows: { fixtureId: string; normalized: ReturnType<typeof wordErrors> }[]) {
  const clean = rows.filter((r) => ["STT-01", "STT-02", "STT-03", "STT-06"].includes(r.fixtureId));
  const ids = clean.map((r) => r.fixtureId);
  if (new Set(ids).size !== ids.length) throw new Error("Pool rows for one model only, without duplicate cases.");
  const words = clean.reduce((sum, r) => sum + r.normalized.referenceWords, 0);
  return { wer: words ? clean.reduce((sum, r) => sum + r.normalized.errors, 0) / words : null,
    completeCoverage: clean.length === 4, caseIds: ids };
}
