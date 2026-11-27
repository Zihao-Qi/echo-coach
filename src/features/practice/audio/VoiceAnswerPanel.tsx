"use client";

import { AUDIO_MAX_SECONDS } from "../../../domain/audio/canonical-wav";
import type { PracticeTranscriptionAccess } from "../usePracticeAccess";
import { formatVoiceSeconds, type useVoiceRecording, type VoiceCaptureMode } from "./useVoiceRecording";

const button =
  "rounded-xl border border-line-strong bg-white px-3.5 py-2 text-xs font-semibold text-ink transition hover:bg-pebble disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";

const primaryButton =
  "rounded-xl border border-line-strong bg-ink px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-ink-hover disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";

function LiveWords({ text }: { text: string }) {
  return (
    <div className="mt-3">
      <p id="live-words-label" className="text-xs font-bold text-ink">Words so far</p>
      <p
        aria-labelledby="live-words-label"
        className="mt-1 max-h-24 overflow-y-auto rounded-xl bg-white p-3 text-sm leading-6 break-words text-body [overflow-wrap:anywhere]"
      >
        {text || "Listening…"}
      </p>
    </div>
  );
}

interface VoiceAnswerPanelProps {
  transcriptionAccess: PracticeTranscriptionAccess;
  mode?: VoiceCaptureMode;
  voice: ReturnType<typeof useVoiceRecording>;
  evaluationPending: boolean;
  hasExistingTypedDraft: boolean;
}

export function VoiceAnswerPanel({
  transcriptionAccess,
  mode = "server",
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
    mode === "server" && (!transcriptionAccess.available || transcriptionAccess.mode === "disabled");
  const reviewLabel = mode === "browser-speech" ? "Your transcript" : mode === "sample" ? "Sample transcript" : "Review and edit demo transcript before applying";
  const reviewDescription = mode === "browser-speech"
    ? "Edit this transcript before using it in your answer."
    : mode === "sample"
      ? "This demo doesn't recognize speech. Edit this sample before using it."
      : "This text is a demo fixture, not recognition of your speech. Edit freely before copying it into your answer draft.";

  const trimmedTranscriptLength = transcriptText.trim().length;
  const isTranscriptEmpty = trimmedTranscriptLength === 0;
  const isTranscriptBelowMinimum = trimmedTranscriptLength > 0 && trimmedTranscriptLength < 20;

  return (
    <section
      aria-label="Voice answer capture"
      className="mb-5 rounded-xl border border-line bg-pebble p-4"
    >
      {!(mode === "sample" && phase === "review") && <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-sm font-bold text-ink">Record answer (optional)</h2>
            <span className="rounded-full border border-line bg-card px-2.5 py-0.5 text-xs font-semibold text-ink">
              {mode === "browser-speech" ? "Browser speech" : mode === "sample" ? "Browser only" : isDisabledCapability ? "Recording unavailable" : "Demo transcript fixture"}
            </span>
          </div>
          {mode === "browser-speech" ? (
            <p className="mt-1.5 text-xs leading-5 text-muted">
              Your browser turns your speech into text and may send your audio to its provider (such as Google, Apple or Microsoft). Echo Coach&apos;s server doesn&apos;t receive it.
            </p>
          ) : mode === "sample" ? (
            <p className="mt-1.5 text-xs leading-5 text-muted">
              Record yourself to practice speaking. Your audio stays in this browser and is deleted when you stop. This demo doesn&apos;t recognize speech: after you stop, you&apos;ll see a sample transcript you can edit.
            </p>
          ) : isDisabledCapability ? (
            <p className="mt-1.5 text-xs leading-5 text-muted">
              {transcriptionAccess.reason ||
                "Voice transcription is disabled in this configuration. Type your answer directly below."}
            </p>
          ) : (
            <p className="mt-1.5 text-xs leading-5 text-muted">
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
      </div>}

      {phase === "requesting_permission" && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
          <p className="text-xs font-medium text-body">
            Requesting microphone access… Allow permission in your browser or cancel to type.
          </p>
          <button type="button" className={button} onClick={() => discardVoice(true)}>
            Cancel
          </button>
        </div>
      )}

      {phase === "recording" && (
        <div className="mt-3 border-t border-line pt-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span
                aria-hidden="true"
                className="inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-danger motion-reduce:animate-none"
              />
              <p className="text-xs font-semibold text-ink">
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
          {mode === "browser-speech" && <LiveWords text={transcriptText} />}
        </div>
      )}

      {phase === "finishing" && mode === "browser-speech" && (
        <div className="mt-3 border-t border-line pt-3">
          <p className="flex items-center gap-2 text-xs font-medium text-body">
            <span
              aria-hidden="true"
              className="inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-marigold motion-reduce:animate-none"
            />
            Finishing…
          </p>
          <LiveWords text={transcriptText} />
        </div>
      )}

      {phase === "normalizing" && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
          <p className="text-xs font-medium text-body">
            Normalizing captured audio to 16 kHz mono WAV…
          </p>
          <button type="button" className={button} onClick={() => discardVoice(true)}>
            Discard
          </button>
        </div>
      )}

      {phase === "ready_to_transcribe" && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
          <p className="text-xs text-body">
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
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
          <p className="text-xs font-medium text-body">
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
        <div className={mode === "sample" ? undefined : "mt-3 border-t border-line pt-3"}>
          <label
            htmlFor="voice-transcript-review"
            className="block text-xs font-bold text-ink"
          >
            {reviewLabel}
          </label>
          <p id="voice-transcript-description" className="mt-1 text-xs text-muted">
            {reviewDescription}
          </p>
          <textarea
            ref={transcriptTextareaRef}
            id="voice-transcript-review"
            aria-describedby="voice-transcript-description"
            value={transcriptText}
            disabled={evaluationPending}
            maxLength={10000}
            onChange={(event) => setTranscriptText(event.target.value)}
            placeholder="Transcript is empty. Type or edit here, or re-record."
            className="mt-2 min-h-28 w-full resize-y rounded-xl border border-line-strong bg-white p-3 text-sm leading-6 focus:border-line-strong focus:outline-none focus:ring-2 focus:ring-line-strong"
          />
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted">
              {transcriptText.length}/10,000 characters
              {isTranscriptEmpty
                ? " · Enter at least 1 character to use this transcript"
                : isTranscriptBelowMinimum
                  ? " · Under 20 characters (you can apply it to your draft, then expand before getting feedback)"
                  : ""}
            </p>
            {hasExistingTypedDraft && (
              <p className="text-xs font-medium text-ink">
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
              {mode === "server" ? "Use confirmed transcript" : "Use in answer draft"}
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
              {mode === "server" ? "Discard transcript" : "Discard"}
            </button>
          </div>
        </div>
      )}

      {phase === "error" && error && (
        <div
          role="alert"
          className="mt-3 rounded-xl border border-danger-line bg-danger-tint p-3 text-xs text-danger"
        >
          <p className="font-medium">{error}</p>
          <p className="mt-1 text-danger">
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
                className={mode === "browser-speech" ? primaryButton : button}
                onClick={() => void startRecording()}
              >
                {hasRetainedAudio ? "Re-record" : "Try recording again"}
              </button>
            )}
            <button
              type="button"
              disabled={evaluationPending}
              className={mode === "browser-speech" ? "rounded-xl px-3.5 py-2 text-xs font-semibold text-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink" : button}
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
