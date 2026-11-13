"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AUDIO_MAX_SECONDS } from "../../../domain/audio/canonical-wav";
import type { PracticeTranscriptionAccess } from "../usePracticeAccess";
import { MAX_ENCODED_RECORDING_BYTES, normalizeRecording } from "./normalize-recording";

export type VoiceRecordingPhase =
  | "idle"
  | "requesting_permission"
  | "recording"
  | "normalizing"
  | "ready_to_transcribe"
  | "transcribing"
  | "review"
  | "error";

export type VoiceErrorRecovery = "none" | "recover" | "new_attempt";

interface CapturedVoiceJob {
  generation: number;
  questionId: string;
  wavBytes: Uint8Array | null;
  durationSeconds: number;
  requestId: string | null;
}

const CLIENT_TRANSCRIPTION_TIMEOUT_MS = 60_000;

function stopMediaStreamTracks(stream: MediaStream | null | undefined) {
  if (!stream) return;
  for (const track of stream.getTracks()) {
    try {
      track.stop();
    } catch {
      // Ignore already-stopped track errors.
    }
  }
}

export function formatVoiceSeconds(totalSeconds: number): string {
  const clamped = Math.max(0, Math.min(AUDIO_MAX_SECONDS, Math.floor(totalSeconds)));
  const minutes = Math.floor(clamped / 60);
  const seconds = clamped % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function useVoiceRecording({
  activeQuestionId,
  transcriptionAccess,
  getHeaders,
  getCurrentDraft,
  applyDraft,
  focusAnswerTextarea,
}: {
  activeQuestionId: string;
  transcriptionAccess: PracticeTranscriptionAccess;
  getHeaders: () => Promise<Record<string, string>>;
  getCurrentDraft: () => string;
  applyDraft: (value: string) => void;
  focusAnswerTextarea: () => void;
}) {
  const [phase, setPhase] = useState<VoiceRecordingPhase>("idle");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [durationSeconds, setDurationSeconds] = useState(0);
  const [transcriptText, setTranscriptText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [errorRecovery, setErrorRecovery] = useState<VoiceErrorRecovery>("none");
  const [statusAnnouncement, setStatusAnnouncement] = useState("");

  const phaseRef = useRef<VoiceRecordingPhase>("idle");
  const generationRef = useRef(0);
  const activeQuestionIdRef = useRef(activeQuestionId);
  activeQuestionIdRef.current = activeQuestionId;

  const jobRef = useRef<CapturedVoiceJob | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopDeadlineRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fetchControllerRef = useRef<AbortController | null>(null);
  const clientTimeoutAbortRef = useRef(false);

  const stopButtonRef = useRef<HTMLButtonElement | null>(null);
  const transcriptTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  const updatePhase = useCallback((next: VoiceRecordingPhase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  const readCurrentPhase = useCallback((): VoiceRecordingPhase => {
    return phaseRef.current;
  }, []);

  const clearRecordingTimers = useCallback(() => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (stopDeadlineRef.current !== null) {
      clearTimeout(stopDeadlineRef.current);
      stopDeadlineRef.current = null;
    }
  }, []);

  const releaseActiveMedia = useCallback(() => {
    clearRecordingTimers();
    const recorder = recorderRef.current;
    recorderRef.current = null;
    if (recorder) {
      try {
        recorder.ondataavailable = null;
        recorder.onstop = null;
        recorder.onerror = null;
        if (recorder.state !== "inactive") {
          recorder.stop();
        }
      } catch {
        // Ignore recorder stop errors during forced cleanup.
      }
    }
    const stream = streamRef.current;
    streamRef.current = null;
    stopMediaStreamTracks(stream);
  }, [clearRecordingTimers]);

  const invalidateAndRelease = useCallback(
    (announcement = "") => {
      generationRef.current += 1;
      releaseActiveMedia();
      if (fetchControllerRef.current) {
        fetchControllerRef.current.abort();
        fetchControllerRef.current = null;
      }
      clientTimeoutAbortRef.current = false;
      if (jobRef.current?.wavBytes) {
        jobRef.current.wavBytes.fill(0);
      }
      jobRef.current = null;
      updatePhase("idle");
      setElapsedSeconds(0);
      setDurationSeconds(0);
      setTranscriptText("");
      setError(null);
      setErrorRecovery("none");
      setStatusAnnouncement(announcement);
    },
    [releaseActiveMedia, updatePhase],
  );

  // Unmount cleanup
  useEffect(() => {
    return () => {
      generationRef.current += 1;
      releaseActiveMedia();
      if (fetchControllerRef.current) {
        fetchControllerRef.current.abort();
        fetchControllerRef.current = null;
      }
      if (jobRef.current?.wavBytes) {
        jobRef.current.wavBytes.fill(0);
      }
      jobRef.current = null;
    };
  }, [releaseActiveMedia]);

  // If activeQuestionId changes externally, invalidate any stale voice state bound to an old questionId
  useEffect(() => {
    if (jobRef.current && jobRef.current.questionId !== activeQuestionId) {
      invalidateAndRelease();
    } else if (phaseRef.current === "error") {
      updatePhase("idle");
      setError(null);
      setErrorRecovery("none");
    }
  }, [activeQuestionId, invalidateAndRelease, updatePhase]);

  const isHardLocked =
    phase === "requesting_permission" ||
    phase === "recording" ||
    phase === "normalizing" ||
    phase === "transcribing";

  const hasRetainedAudio = !!jobRef.current?.wavBytes;
  const hasUnappliedVoiceState =
    phase === "ready_to_transcribe" ||
    phase === "review" ||
    (phase === "error" && (hasRetainedAudio || transcriptText.trim().length > 0));

  const startRecording = useCallback(async () => {
    if (!transcriptionAccess.available || transcriptionAccess.mode === "disabled") {
      return;
    }
    if (
      phaseRef.current === "requesting_permission" ||
      phaseRef.current === "recording" ||
      phaseRef.current === "normalizing" ||
      phaseRef.current === "transcribing" ||
      recorderRef.current !== null ||
      streamRef.current !== null
    ) {
      return;
    }

    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices ||
      typeof navigator.mediaDevices.getUserMedia !== "function" ||
      typeof MediaRecorder === "undefined" ||
      typeof OfflineAudioContext === "undefined"
    ) {
      updatePhase("error");
      setError(
        "Voice recording is not supported in this browser. Use the typed answer box below instead.",
      );
      setErrorRecovery("none");
      setStatusAnnouncement("Voice recording unavailable. Typed answer ready.");
      return;
    }

    // Invalidate any prior retained job before starting a new recording
    generationRef.current += 1;
    const jobGeneration = generationRef.current;
    const capturedQuestionId = activeQuestionIdRef.current;

    if (jobRef.current?.wavBytes) {
      jobRef.current.wavBytes.fill(0);
    }
    jobRef.current = {
      generation: jobGeneration,
      questionId: capturedQuestionId,
      wavBytes: null,
      durationSeconds: 0,
      requestId: null,
    };

    setElapsedSeconds(0);
    setDurationSeconds(0);
    setTranscriptText("");
    setError(null);
    setErrorRecovery("none");
    updatePhase("requesting_permission");
    setStatusAnnouncement("Requesting microphone permission…");

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      if (
        generationRef.current !== jobGeneration ||
        activeQuestionIdRef.current !== capturedQuestionId
      ) {
        return;
      }
      jobRef.current = null;
      updatePhase("error");
      setError(
        "Microphone access was denied or no microphone was found. You can continue with a typed answer below.",
      );
      setErrorRecovery("none");
      setStatusAnnouncement("Microphone unavailable. Typed answer ready.");
      return;
    }

    // Late permission check: if discarded, unmounted, or question changed while awaiting getUserMedia
    if (
      generationRef.current !== jobGeneration ||
      activeQuestionIdRef.current !== capturedQuestionId ||
      readCurrentPhase() !== "requesting_permission"
    ) {
      stopMediaStreamTracks(stream);
      return;
    }

    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0 || audioTracks.every((t) => t.readyState === "ended")) {
      stopMediaStreamTracks(stream);
      jobRef.current = null;
      updatePhase("error");
      setError("The selected microphone track is unavailable. Use a typed answer instead.");
      setErrorRecovery("none");
      setStatusAnnouncement("Microphone unavailable.");
      return;
    }

    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream);
    } catch {
      stopMediaStreamTracks(stream);
      jobRef.current = null;
      updatePhase("error");
      setError("Audio recording could not be initialized. Use a typed answer instead.");
      setErrorRecovery("none");
      setStatusAnnouncement("Audio recorder initialization failed.");
      return;
    }

    streamRef.current = stream;
    recorderRef.current = recorder;

    const chunks: BlobPart[] = [];
    let totalEncodedBytes = 0;
    let oversizedAbort = false;
    let trackLostBeforeStop = false;
    let recorderFailed = false;
    let stopRequested = false;

    const handleTrackEnded = () => {
      if (
        generationRef.current !== jobGeneration ||
        recorderFailed ||
        recorderRef.current !== recorder
      ) {
        return;
      }
      if (!stopRequested && readCurrentPhase() === "recording") {
        trackLostBeforeStop = true;
        stopRequested = true;
        clearRecordingTimers();
        if (recorder.state !== "inactive") {
          try {
            recorder.stop();
          } catch {
            // handled below
          }
        }
        stopMediaStreamTracks(stream);
      }
    };

    for (const track of audioTracks) {
      track.addEventListener("ended", handleTrackEnded, { once: true });
    }

    recorder.ondataavailable = (event: BlobEvent) => {
      if (
        generationRef.current !== jobGeneration ||
        recorderFailed ||
        recorderRef.current !== recorder
      ) {
        return;
      }
      if (event.data && event.data.size > 0) {
        totalEncodedBytes += event.data.size;
        if (totalEncodedBytes > MAX_ENCODED_RECORDING_BYTES) {
          oversizedAbort = true;
          stopRequested = true;
          clearRecordingTimers();
          if (recorder.state !== "inactive") {
            try {
              recorder.stop();
            } catch {
              // ignore
            }
          }
          stopMediaStreamTracks(stream);
          return;
        }
        chunks.push(event.data);
      }
    };

    recorder.onerror = () => {
      stopMediaStreamTracks(stream);
      if (
        recorderFailed ||
        generationRef.current !== jobGeneration ||
        activeQuestionIdRef.current !== capturedQuestionId ||
        recorderRef.current !== recorder
      ) {
        chunks.length = 0;
        return;
      }
      recorderFailed = true;
      stopRequested = true;
      chunks.length = 0;
      generationRef.current += 1;
      clearRecordingTimers();
      recorder.ondataavailable = null;
      recorder.onstop = null;
      recorder.onerror = null;
      if (recorder.state !== "inactive") {
        try {
          recorder.stop();
        } catch {
          // ignore
        }
      }
      recorderRef.current = null;
      streamRef.current = null;
      jobRef.current = null;
      updatePhase("error");
      setError("Recording stopped due to a microphone or media error. You can retry or type your answer.");
      setErrorRecovery("none");
      setStatusAnnouncement("Recording failed.");
    };

    recorder.onstop = async () => {
      // Stop this capture's microphone tracks promptly on recorder stop before decoding/normalizing
      stopMediaStreamTracks(stream);

      if (
        recorderFailed ||
        generationRef.current !== jobGeneration ||
        activeQuestionIdRef.current !== capturedQuestionId ||
        recorderRef.current !== recorder
      ) {
        chunks.length = 0;
        return;
      }

      clearRecordingTimers();
      recorderRef.current = null;
      streamRef.current = null;

      if (oversizedAbort) {
        jobRef.current = null;
        updatePhase("error");
        setError("Recording exceeded the 10 MiB size limit. Record a shorter answer or type below.");
        setErrorRecovery("none");
        setStatusAnnouncement("Recording exceeded size limit.");
        return;
      }

      if (trackLostBeforeStop && chunks.length === 0) {
        jobRef.current = null;
        updatePhase("error");
        setError("Microphone disconnected during recording. Reconnect or type your answer below.");
        setErrorRecovery("none");
        setStatusAnnouncement("Microphone disconnected.");
        return;
      }

      const mimeType = recorder.mimeType || "audio/webm";
      const recordingBlob = new Blob(chunks, { type: mimeType });
      chunks.length = 0;

      if (!recordingBlob.size) {
        jobRef.current = null;
        updatePhase("error");
        setError("No audio was captured. Check your microphone or type your answer below.");
        setErrorRecovery("none");
        setStatusAnnouncement("No audio captured.");
        return;
      }

      updatePhase("normalizing");
      setStatusAnnouncement("Preparing captured audio…");

      try {
        const normalized = await normalizeRecording(recordingBlob);
        if (
          generationRef.current !== jobGeneration ||
          activeQuestionIdRef.current !== capturedQuestionId
        ) {
          normalized.bytes.fill(0);
          return;
        }
        jobRef.current = {
          generation: jobGeneration,
          questionId: capturedQuestionId,
          wavBytes: normalized.bytes,
          durationSeconds: normalized.info.durationSeconds,
          requestId: null,
        };
        setDurationSeconds(normalized.info.durationSeconds);
        updatePhase("ready_to_transcribe");
        setStatusAnnouncement(
          `Recording ready (${Math.max(1, Math.round(normalized.info.durationSeconds))} seconds). Choose Transcribe (demo) to continue.`,
        );
      } catch (cause) {
        if (
          generationRef.current !== jobGeneration ||
          activeQuestionIdRef.current !== capturedQuestionId
        ) {
          return;
        }
        jobRef.current = null;
        updatePhase("error");
        setError(
          cause instanceof Error
            ? cause.message
            : "Could not process the captured recording. Please re-record or type your answer.",
        );
        setErrorRecovery("none");
        setStatusAnnouncement("Audio normalization failed.");
      }
    };

    try {
      recorder.start(250);
    } catch {
      clearRecordingTimers();
      recorderRef.current = null;
      streamRef.current = null;
      stopMediaStreamTracks(stream);
      jobRef.current = null;
      updatePhase("error");
      setError("Could not start audio capture. Use the typed answer box below.");
      setErrorRecovery("none");
      setStatusAnnouncement("Audio capture failed to start.");
      return;
    }

    const startedAt = Date.now();
    updatePhase("recording");
    setStatusAnnouncement("Recording in progress. Maximum 2 minutes.");
    requestAnimationFrame(() => {
      stopButtonRef.current?.focus();
    });

    timerRef.current = setInterval(() => {
      if (generationRef.current !== jobGeneration || readCurrentPhase() !== "recording") return;
      const elapsed = Math.min(AUDIO_MAX_SECONDS, Math.floor((Date.now() - startedAt) / 1000));
      setElapsedSeconds(elapsed);
    }, 250);

    stopDeadlineRef.current = setTimeout(() => {
      if (generationRef.current !== jobGeneration || readCurrentPhase() !== "recording") return;
      stopRequested = true;
      setElapsedSeconds(AUDIO_MAX_SECONDS);
      clearRecordingTimers();
      if (recorder.state !== "inactive") {
        try {
          recorder.stop();
        } catch {
          stopMediaStreamTracks(stream);
        }
      }
    }, AUDIO_MAX_SECONDS * 1000);
  }, [clearRecordingTimers, readCurrentPhase, transcriptionAccess.available, transcriptionAccess.mode, updatePhase]);

  const stopRecording = useCallback(() => {
    if (phaseRef.current !== "recording") return;
    clearRecordingTimers();
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      try {
        recorder.stop();
      } catch {
        stopMediaStreamTracks(streamRef.current);
      }
    } else {
      stopMediaStreamTracks(streamRef.current);
    }
  }, [clearRecordingTimers]);

  const sendTranscription = useCallback(
    async (intent: "start" | "recover", forceNewRequestId = false) => {
      const currentJob = jobRef.current;
      if (
        !currentJob ||
        !currentJob.wavBytes ||
        currentJob.generation !== generationRef.current ||
        currentJob.questionId !== activeQuestionIdRef.current
      ) {
        return;
      }
      if (phaseRef.current === "transcribing") return;

      let requestId = currentJob.requestId;
      if (intent === "start") {
        if (!requestId || forceNewRequestId) {
          requestId = crypto.randomUUID();
          currentJob.requestId = requestId;
        }
      } else if (!requestId) {
        return;
      }

      const jobGeneration = currentJob.generation;
      const capturedQuestionId = currentJob.questionId;
      const wavBytes = currentJob.wavBytes;

      const controller = new AbortController();
      fetchControllerRef.current = controller;
      clientTimeoutAbortRef.current = false;

      const timeoutId = setTimeout(() => {
        clientTimeoutAbortRef.current = true;
        controller.abort();
      }, CLIENT_TRANSCRIPTION_TIMEOUT_MS);

      setError(null);
      setErrorRecovery("none");
      updatePhase("transcribing");
      setStatusAnnouncement(
        intent === "recover" ? "Recovering demo transcript…" : "Transcribing recording (demo)…",
      );

      try {
        const authHeaders = await getHeaders();
        if (
          generationRef.current !== jobGeneration ||
          activeQuestionIdRef.current !== capturedQuestionId
        ) {
          return;
        }
        const bodyBuffer = wavBytes.buffer.slice(
          wavBytes.byteOffset,
          wavBytes.byteOffset + wavBytes.byteLength,
        ) as ArrayBuffer;

        const response = await fetch("/api/practice/transcriptions", {
          method: "POST",
          headers: {
            "Content-Type": "audio/wav",
            "Idempotency-Key": requestId,
            "X-Transcription-Intent": intent,
            ...authHeaders,
          },
          body: bodyBuffer,
          signal: controller.signal,
        });

        let payload: {
          transcription?: {
            id: string;
            text: string;
            mode: "demo";
            model: string;
            expiresAt: string;
          };
          error?: string;
          code?: string;
        } = {};
        try {
          payload = (await response.json()) as typeof payload;
        } catch {
          payload = {};
        }

        if (
          generationRef.current !== jobGeneration ||
          activeQuestionIdRef.current !== capturedQuestionId
        ) {
          return;
        }

        if (response.ok && payload.transcription && typeof payload.transcription.text === "string") {
          const text = payload.transcription.text.slice(0, 10000);
          setTranscriptText(text);
          setError(null);
          setErrorRecovery("none");
          updatePhase("review");
          setStatusAnnouncement(
            text.trim().length === 0
              ? "Demo transcript returned empty text. Edit below or re-record."
              : "Demo transcript ready for review. Edit if needed, then select Use confirmed transcript.",
          );
          requestAnimationFrame(() => {
            transcriptTextareaRef.current?.focus();
          });
          return;
        }

        const code = payload.code;
        const status = response.status;
        const serverMessage = payload.error || "Transcription failed.";

        if (code === "running" || (status === 409 && code !== "conflict")) {
          updatePhase("error");
          setError(
            payload.error ||
              "This transcription attempt is still in progress on the server. Wait a moment and select Recover transcript.",
          );
          setErrorRecovery("recover");
          setStatusAnnouncement("Transcription still running. Recovery available.");
          return;
        }

        if (
          code === "ended" ||
          code === "expired" ||
          code === "conflict" ||
          status === 410
        ) {
          // Terminal for this requestId: do not reuse this requestId, allow explicit new attempt with fresh UUID
          currentJob.requestId = null;
          updatePhase("error");
          setError(serverMessage);
          setErrorRecovery("new_attempt");
          setStatusAnnouncement(
            "Transcription attempt ended. You can start a new transcription or discard.",
          );
          return;
        }

        if (
          code === "disabled" ||
          code === "limited" ||
          status === 400 ||
          status === 401 ||
          status === 403 ||
          status === 429
        ) {
          currentJob.requestId = null;
          updatePhase("error");
          setError(serverMessage);
          setErrorRecovery("none");
          setStatusAnnouncement("Transcription unavailable.");
          return;
        }

        // Uncertain or transient server/gateway failures (including 500, 502 without code="ended", 503 without code="disabled"):
        // preserve currentJob.requestId + wavBytes for explicit lookup-only recover.
        updatePhase("error");
        setError(serverMessage);
        setErrorRecovery("recover");
        setStatusAnnouncement("Transcription request failed. Recovery available.");
      } catch {
        if (
          generationRef.current !== jobGeneration ||
          activeQuestionIdRef.current !== capturedQuestionId
        ) {
          return;
        }
        updatePhase("error");
        if (clientTimeoutAbortRef.current) {
          setError(
            "Waiting for transcription timed out after 60 seconds. The server may still finish; use Recover transcript to check without starting a new request.",
          );
        } else if (controller.signal.aborted) {
          setError(
            "Stopped waiting for the transcription response. Use Recover transcript to check if the request completed, or discard the recording.",
          );
        } else {
          setError(
            "Network error while contacting transcription. Your recording is preserved—use Recover transcript to check the existing request.",
          );
        }
        setErrorRecovery("recover");
        setStatusAnnouncement("Transcription interrupted. Recovery available.");
      } finally {
        clearTimeout(timeoutId);
        if (fetchControllerRef.current === controller) {
          fetchControllerRef.current = null;
        }
      }
    },
    [getHeaders, updatePhase],
  );

  const startTranscription = useCallback(() => {
    void sendTranscription("start", false);
  }, [sendTranscription]);

  const recoverTranscription = useCallback(() => {
    void sendTranscription("recover", false);
  }, [sendTranscription]);

  const startNewTranscriptionAttempt = useCallback(() => {
    void sendTranscription("start", true);
  }, [sendTranscription]);

  const cancelTranscriptionWait = useCallback(() => {
    if (phaseRef.current !== "transcribing" || !fetchControllerRef.current) return;
    clientTimeoutAbortRef.current = false;
    fetchControllerRef.current.abort();
  }, []);

  const discardVoice = useCallback(
    (focusTypedAnswer = true) => {
      invalidateAndRelease("Discarded voice recording.");
      if (focusTypedAnswer) {
        requestAnimationFrame(() => {
          focusAnswerTextarea();
        });
      }
    },
    [focusAnswerTextarea, invalidateAndRelease],
  );

  const applyConfirmedTranscript = useCallback(() => {
    if (phaseRef.current !== "review") return;
    if (transcriptText.trim().length === 0) return;

    const currentDraft = getCurrentDraft();
    if (
      currentDraft.trim().length > 0 &&
      currentDraft !== transcriptText &&
      typeof window !== "undefined"
    ) {
      const confirmed = window.confirm(
        "Replace your current typed answer draft with this confirmed transcript?",
      );
      if (!confirmed) return;
    }

    const nextText = transcriptText.slice(0, 10000);
    applyDraft(nextText);
    invalidateAndRelease("Applied confirmed transcript to your answer draft.");
    requestAnimationFrame(() => {
      focusAnswerTextarea();
    });
  }, [applyDraft, focusAnswerTextarea, getCurrentDraft, invalidateAndRelease, transcriptText]);

  const confirmDiscardIfNeeded = useCallback(
    (reason = "Discard your unapplied voice recording or transcript?"): boolean => {
      if (
        phaseRef.current === "requesting_permission" ||
        phaseRef.current === "recording" ||
        phaseRef.current === "normalizing" ||
        phaseRef.current === "transcribing"
      ) {
        return false;
      }
      const unapplied =
        phaseRef.current === "ready_to_transcribe" ||
        phaseRef.current === "review" ||
        (phaseRef.current === "error" && !!jobRef.current?.wavBytes);
      if (!unapplied) {
        if (phaseRef.current === "error") {
          invalidateAndRelease();
        }
        return true;
      }
      if (typeof window !== "undefined") {
        const confirmed = window.confirm(reason);
        if (!confirmed) return false;
      }
      invalidateAndRelease();
      return true;
    },
    [invalidateAndRelease],
  );

  return {
    phase,
    isHardLocked,
    hasUnappliedVoiceState,
    hasRetainedAudio,
    elapsedSeconds,
    durationSeconds,
    transcriptText,
    setTranscriptText: (value: string) => setTranscriptText(value.slice(0, 10000)),
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
    confirmDiscardIfNeeded,
  };
}
