export interface SpeechDraft {
  finals: string;
  interim: string;
}

export interface SpeechResultChunk {
  isFinal: boolean;
  transcript: string;
}

export const SPEECH_TRANSCRIPT_LIMIT = 10_000;

// A recognition event's result list is the full snapshot. Rebuilding from it
// matches keeping every entry before the changed index and replacing the tail,
// including when the list shrinks.
export function applySpeechResult(
  draft: SpeechDraft,
  results: ArrayLike<SpeechResultChunk>,
): string {
  let finals = "";
  let interim = "";
  for (let index = 0; index < results.length; index += 1) {
    const result = results[index];
    if (result.isFinal) finals += result.transcript;
    else interim += result.transcript;
  }
  draft.finals = finals;
  draft.interim = interim;
  return (finals + interim).slice(0, SPEECH_TRANSCRIPT_LIMIT);
}
