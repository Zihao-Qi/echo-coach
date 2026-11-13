"use client";

import { AUDIO_MAX_SECONDS } from "../../../domain/audio/canonical-wav";
import type { PracticeTranscriptionAccess } from "../usePracticeAccess";
import { formatVoiceSeconds, type useVoiceRecording } from "./useVoiceRecording";

const button =
  "rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600";

const primaryButton =
  "rounded-xl border border-indigo-600 bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600";

interface VoiceAnswerPanelProps {
  transcriptionAccess: PracticeTranscriptionAccess;
  voice: ReturnType<typeof useVoiceRecording>;
  evaluationPending: boolean;
  hasExistingTypedDraft: boolean;
}

export function VoiceAnswerPanel({
  transcriptionAccess,
  voice,
  evaluationPending,
  hasExistingTypedDraft,
}: VoiceAnswerPanelProps) {
  const {
    phase,
    hasRetainedAudio,
    elapsedSeconds,
    durationSeconds,
    transcriptText,
    setTranscriptText,
    error,
    errorRecovery,
    statusAnnouncement,
    stopButtonRef,
    transcriptTextareaRef,
    startRecording,
    stopRecording,
    startTranscription,
    recoverTranscription,
    startNewTranscriptionAttempt,
    cancelTranscriptionWait,
    applyConfirmedTranscript,
    discardVoice,
  } = voice;

  const isDisabledCapability =
    !transcriptionAccess.available || transcriptionAccess.mode === "disabled";

  const trimmedTranscriptLength = transcriptText.trim().length;
  const isTranscriptEmpty = trimmedTranscriptLength === 0;
  const isTranscriptBelowMinimum = trimmedTranscriptLength > 0 && trimmedTranscriptLength < 20;

  return (
    <section
      aria-label="Voice answer capture"
      className="mb-5 rounded-xl border border-slate-200 bg-slate-50/80 p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-bold text-slate-900">Record answer (optional)</h3>
            <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-900">
              {isDisabledCapability ? "Recording unavailable" : "Demo transcript fixture"}
            </span>
          </div>
          {isDisabledCapability ? (
            <p className="mt-1.5 text-xs leading-5 text-slate-600">
              {transcriptionAccess.reason ||
                "Voice transcription is disabled in this configuration. Type your answer directly below."}
            </p>
          ) : (
            <p className="mt-1.5 text-xs leading-5 text-slate-600">
              Demo transcription sends your normalized recording to this app for validation and
              returns a fixed example transcript, not speech recognition of what you say. Audio is
              not sent to Google, and no speech recognition occurs. Applying a transcript only
              updates your answer draft and never submits for evaluation automatically.
            </p>
          )}
        </div>

        {!isDisabledCapability && phase === "idle" && (
          <button
            type="button"
            disabled={evaluationPending}
            onClick={() => void startRecording()}
            className={button}
          >
            Record answer
          </button>
        )}
      </div>

      {phase === "requesting_permission" && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-3">
          <p className="text-xs font-medium text-slate-700">
            Requesting microphone access… Allow permission in your browser or cancel to type.
          </p>
          <button type="button" className={button} onClick={() => discardVoice(true)}>
            Cancel
          </button>
        </div>
      )}

      {phase === "recording" && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-3">
          <div className="flex items-center gap-2.5">
            <span
              aria-hidden="true"
              className="inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-red-600"
            />
            <p className="text-xs font-semibold text-slate-800">
              Recording:{" "}
              <span className="font-mono">
                {formatVoiceSeconds(elapsedSeconds)} / {formatVoiceSeconds(AUDIO_MAX_SECONDS)}
              </span>
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              ref={stopButtonRef}
              type="button"
              className={primaryButton}
              onClick={stopRecording}
            >
              Stop recording
            </button>
            <button type="button" className={button} onClick={() => discardVoice(true)}>
              Discard
            </button>
          </div>
        </div>
      )}

      {phase === "normalizing" && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-3">
          <p className="text-xs font-medium text-slate-700">
            Normalizing captured audio to 16 kHz mono WAV…
          </p>
          <button type="button" className={button} onClick={() => discardVoice(true)}>
            Discard
          </button>
        </div>
      )}

      {phase === "ready_to_transcribe" && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-3">
          <p className="text-xs text-slate-700">
            Captured{" "}
            <span className="font-semibold">
              {formatVoiceSeconds(Math.max(1, Math.round(durationSeconds)))}
            </span>{" "}
            of audio. Select <span className="font-semibold">Transcribe (demo)</span> to load the
            editable demo transcript.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={evaluationPending}
              className={primaryButton}
              onClick={startTranscription}
            >
              Transcribe (demo)
            </button>
            <button
              type="button"
              disabled={evaluationPending}
              className={button}
              onClick={() => void startRecording()}
            >
              Re-record
            </button>
            <button
              type="button"
              disabled={evaluationPending}
              className={button}
              onClick={() => discardVoice(true)}
            >
              Discard recording
            </button>
          </div>
        </div>
      )}

      {phase === "transcribing" && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-3">
          <p className="text-xs font-medium text-slate-700">
            Transcribing audio (demo fixture)… Navigation is locked until completion or cancellation.
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={button} onClick={cancelTranscriptionWait}>
              Stop waiting
            </button>
            <button type="button" className={button} onClick={() => discardVoice(true)}>
              Discard
            </button>
          </div>
        </div>
      )}

      {phase === "review" && (
        <div className="mt-3 border-t border-slate-200 pt-3">
          <label
            htmlFor="voice-transcript-review"
            className="block text-xs font-bold text-slate-800"
          >
            Review and edit demo transcript before applying
          </label>
          <p className="mt-1 text-xs text-slate-600">
            This text is a demo fixture, not recognition of your speech. Edit freely before copying
            it into your answer draft.
          </p>
          <textarea
            ref={transcriptTextareaRef}
            id="voice-transcript-review"
            value={transcriptText}
            disabled={evaluationPending}
            maxLength={10000}
            onChange={(event) => setTranscriptText(event.target.value)}
            placeholder="Transcript is empty. Type or edit here, or re-record."
            className="mt-2 min-h-28 w-full resize-y rounded-xl border border-slate-300 bg-white p-3 text-sm leading-6 focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-100"
          />
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-slate-500">
              {transcriptText.length}/10,000 characters
              {isTranscriptEmpty
                ? " · Enter at least 1 character to use this transcript"
                : isTranscriptBelowMinimum
                  ? " · Under 20 characters (you can apply it to your draft, then expand before getting feedback)"
                  : ""}
            </p>
            {hasExistingTypedDraft && (
              <p className="text-xs font-medium text-amber-800">
                Applying will ask before replacing your current typed draft.
              </p>
            )}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={evaluationPending || isTranscriptEmpty}
              className={primaryButton}
              onClick={applyConfirmedTranscript}
            >
              Use confirmed transcript
            </button>
            <button
              type="button"
              disabled={evaluationPending}
              className={button}
              onClick={() => void startRecording()}
            >
              Re-record
            </button>
            <button
              type="button"
              disabled={evaluationPending}
              className={button}
              onClick={() => discardVoice(true)}
            >
              Discard transcript
            </button>
          </div>
        </div>
      )}

      {phase === "error" && error && (
        <div
          role="alert"
          className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-900"
        >
          <p className="font-medium">{error}</p>
          <p className="mt-1 text-red-800">
            Your typed answer box below remains available at any time.
          </p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {errorRecovery === "recover" && hasRetainedAudio && (
              <button
                type="button"
                disabled={evaluationPending}
                className={primaryButton}
                onClick={recoverTranscription}
              >
                Recover transcript
              </button>
            )}
            {errorRecovery === "new_attempt" && hasRetainedAudio && (
              <button
                type="button"
                disabled={evaluationPending}
                className={primaryButton}
                onClick={startNewTranscriptionAttempt}
              >
                Start new transcription
              </button>
            )}
            {!isDisabledCapability && (
              <button
                type="button"
                disabled={evaluationPending}
                className={button}
                onClick={() => void startRecording()}
              >
                {hasRetainedAudio ? "Re-record" : "Try recording again"}
              </button>
            )}
            <button
              type="button"
              disabled={evaluationPending}
              className={button}
              onClick={() => discardVoice(true)}
            >
              {hasRetainedAudio ? "Discard recording" : "Dismiss"}
            </button>
          </div>
        </div>
      )}

      <p role="status" aria-live="polite" className="sr-only">
        {statusAnnouncement}
      </p>
    </section>
  );
}
