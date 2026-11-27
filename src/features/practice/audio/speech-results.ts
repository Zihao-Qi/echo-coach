export interface SpeechDraft {
  finals: string;
  interim: string;
}

export interface SpeechResultChunk {
  isFinal: boolean;
  transcript: string;
}

export const SPEECH_TRANSCRIPT_LIMIT = 10_000;

// `results` is the recognizer's whole list, not the slice after resultIndex.
// Unchanged interim entries before resultIndex stay, and a shorter list replaces the previous one.
export function applySpeechResult(
  draft: SpeechDraft,
  resultIndex: number,
  results: ArrayLike<SpeechResultChunk>,
): string {
  void resultIndex;
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
