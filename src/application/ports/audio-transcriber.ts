export interface AudioTranscription {
  text: string;
  mode: "demo" | "gemini";
  model: string;
  usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number };
}

// Audio is transient. The deadline signal belongs to the server, not a client fetch.
export interface AudioTranscriber {
  transcribe(audio: Uint8Array, signal: AbortSignal): Promise<AudioTranscription>;
}
