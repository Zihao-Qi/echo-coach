export interface TranscriptionCapability {
  mode: "demo" | "disabled";
  available: boolean;
  reason?: string;
}

export function transcriptionCapability(env: Record<string, string | undefined> = process.env): TranscriptionCapability {
  const mode = env.PRACTICE_TRANSCRIPTION_MODE ?? "demo";
  const optIn = env.ALLOW_LOCAL_TRANSCRIPTION ?? "false";
  if (!["demo", "gemini"].includes(mode) || !["true", "false"].includes(optIn)) {
    return { mode: "disabled", available: false, reason: "Transcription configuration is invalid. Typed practice is still available." };
  }
  if (mode === "demo" && optIn !== "false") {
    return { mode: "disabled", available: false, reason: "Demo transcription cannot enable the real-transcription opt-in." };
  }
  if (mode === "gemini") {
    // Hard-disabled in B1b, including production. No flag can select a real adapter.
    return { mode: "disabled", available: false, reason: "Real transcription is not enabled at this checkpoint. Use demo transcription or type your answer." };
  }
  return { mode: "demo", available: true };
}
