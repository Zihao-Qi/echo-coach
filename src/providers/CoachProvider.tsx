"use client";

import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { MockCoachAdapter } from "../lib/mock-coach";
import { GeminiCoachAdapter } from "../lib/gemini-coach";
import {
  DEFAULT_ROLE_LABEL,
  DEFAULT_STRENGTH_KEYWORD,
  getMockInterviewExample,
} from "../lib/coach-config";
import { saveRecapSnapshot } from "../lib/recap-storage";
import {
  AnalyzeAnswerResponse,
  CoachEvent,
  CoachingTurn,
  ErrorEvent,
  GenerateRecapCardResponse,
  LiveSession,
  NextQuestionResponse,
  PromptAgentRequest,
  Recap,
  SessionRecapPayload,
  SessionBootstrap,
  SessionConfig,
  SessionStatus,
  SpeakPracticeResponse,
} from "../types/coach";

interface ICoachAdapter {
  onEvent(callback: (event: CoachEvent) => void): void;
  startSession(request: { config: SessionConfig }): Promise<{ session: LiveSession }>;
  endSession(request: { sessionId: string }): Promise<void>;
  promptAgent(request: PromptAgentRequest): Promise<void>;
  interruptPlayback(): Promise<void>;
}

interface CoachContextState {
  session: LiveSession | null;
  status: SessionStatus;
  isMockMode: boolean;
  isRecordingAnswer: boolean;
  events: CoachEvent[];
  coachingHistory: CoachingTurn[];
  latestCoachingTurn: CoachingTurn | null;
  recap: Recap | null;
  error: ErrorEvent | null;
  agentPrompt: string | null;
  transcriptSource: string | null;
  isPlayingPractice: boolean;
  isPreparingPracticeAudio: boolean;
  isLoadingNextQuestion: boolean;
  isEndingSession: boolean;
  hasPracticedCurrentTurn: boolean;
  startSession: (config: SessionConfig) => Promise<string | undefined>;
  beginAnswerRecording: () => Promise<void>;
  coachCurrentAnswer: () => Promise<void>;
  playPracticeLine: () => Promise<void>;
  requestNextQuestion: () => Promise<void>;
  endSession: () => Promise<void>;
}

const CoachContext = createContext<CoachContextState | undefined>(undefined);

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("Failed to encode audio blob."));
        return;
      }
      resolve(result.split(",")[1] || "");
    };
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read audio blob."));
    reader.readAsDataURL(blob);
  });
}

function getPreferredRecorderMimeType() {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
  ];

  for (const candidate of candidates) {
    if (
      typeof MediaRecorder !== "undefined" &&
      typeof MediaRecorder.isTypeSupported === "function" &&
      MediaRecorder.isTypeSupported(candidate)
    ) {
      return candidate;
    }
  }

  return "";
}

export function CoachProvider({ children }: { children: React.ReactNode }) {
  type NextQuestionPrefetch = {
    sourceQuestionIndex: number;
    response: NextQuestionResponse;
    audio: SpeakPracticeResponse | null;
  };

  const adapterRef = useRef<ICoachAdapter | null>(null);
  const bootstrapRef = useRef<SessionBootstrap | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const answerChunksRef = useRef<Blob[]>([]);
  const practiceAudioContextRef = useRef<AudioContext | null>(null);
  const practiceAudioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const practicePlaybackRunRef = useRef(0);
  const practicePreloadRunRef = useRef(0);
  const nextQuestionPrefetchRunRef = useRef(0);
  const lastCompletedCoachingTurnRef = useRef<CoachingTurn | null>(null);
  const momentumCardSourceTurnRef = useRef<CoachingTurn | null>(null);
  const recapCardPromiseRef = useRef<Promise<GenerateRecapCardResponse> | null>(null);
  const analyzeAbortControllerRef = useRef<AbortController | null>(null);
  const analyzeRunRef = useRef(0);
  const openingQuestionAudioRef = useRef<SpeakPracticeResponse | null>(null);
  const openingQuestionPreloadPromiseRef = useRef<Promise<void> | null>(null);
  const nextQuestionPrefetchRef = useRef<NextQuestionPrefetch | null>(null);
  const prefetchedRecapCardRef = useRef<{
    sessionId: string;
    sourceQuestionIndex: number;
    card: GenerateRecapCardResponse;
  } | null>(null);

  const [session, setSession] = useState<LiveSession | null>(null);
  const [status, setStatus] = useState<SessionStatus>("idle");
  const [events, setEvents] = useState<CoachEvent[]>([]);
  const [coachingHistory, setCoachingHistory] = useState<CoachingTurn[]>([]);
  const [latestCoachingTurn, setLatestCoachingTurn] = useState<CoachingTurn | null>(null);
  const [recap, setRecap] = useState<Recap | null>(null);
  const [error, setError] = useState<ErrorEvent | null>(null);
  const [agentPrompt, setAgentPrompt] = useState<string | null>(null);
  const [transcriptSource, setTranscriptSource] = useState<string | null>(null);
  const [isMockMode, setIsMockMode] = useState(true);
  const [isRecordingAnswer, setIsRecordingAnswer] = useState(false);
  const [isPlayingPractice, setIsPlayingPractice] = useState(false);
  const [isPreparingPracticeAudio, setIsPreparingPracticeAudio] = useState(false);
  const [isLoadingNextQuestion, setIsLoadingNextQuestion] = useState(false);
  const [isEndingSession, setIsEndingSession] = useState(false);
  const [hasPracticedCurrentTurn, setHasPracticedCurrentTurn] = useState(false);
  const [cachedPracticeAudio, setCachedPracticeAudio] = useState<SpeakPracticeResponse | null>(
    null
  );

  const setupAdapterEventHandlers = (adapter: ICoachAdapter) => {
    adapter.onEvent((event) => {
      setEvents((prev) => [...prev, event]);

      switch (event.type) {
        case "status":
          setStatus(event.status);
          setSession((prev) =>
            prev
              ? {
                  ...prev,
                  status: event.status,
                }
              : prev
          );
          break;
        case "agent_prompt":
          setAgentPrompt(event.text);
          setSession((prev) =>
            prev
              ? {
                  ...prev,
                  currentQuestion: event.text,
                }
              : prev
          );
          break;
        case "error":
          setError(event);
          setStatus("error");
          break;
      }
    });
  };

  const createSessionBootstrap = async (
    config: SessionConfig
  ): Promise<SessionBootstrap> => {
    const response = await fetch("/api/session", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ scenario: config.scenario }),
    });

    const payload = (await response.json()) as
      | SessionBootstrap
      | { error?: string };

    if (!response.ok) {
      throw new Error(
        "error" in payload && payload.error
          ? payload.error
          : "Failed to create session bootstrap."
      );
    }

    if (
      !("token" in payload) ||
      !payload.token ||
      !payload.model ||
      !payload.analysisModel ||
      !payload.ttsModel ||
      !payload.recapCardModel ||
      !payload.transcriptionModel ||
      !payload.responseModalities?.length ||
      !payload.systemInstruction ||
      !payload.openingQuestion
    ) {
      throw new Error("Session bootstrap response was incomplete.");
    }

    return payload;
  };

  const startAnswerCapture = async () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      setIsRecordingAnswer(true);
      return;
    }

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaStreamRef.current = stream;

    const mimeType = getPreferredRecorderMimeType();
    const recorder = mimeType
      ? new MediaRecorder(stream, { mimeType })
      : new MediaRecorder(stream);
    mediaRecorderRef.current = recorder;
    answerChunksRef.current = [];

    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        answerChunksRef.current.push(event.data);
      }
    };

    recorder.start(800);
    setIsRecordingAnswer(true);
  };

  const stopAnswerCapture = () => {
    if (mediaRecorderRef.current) {
      if (mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }
      mediaRecorderRef.current.ondataavailable = null;
      mediaRecorderRef.current = null;
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }

    answerChunksRef.current = [];
    setIsRecordingAnswer(false);
  };

  const snapshotAnswerAudio = async () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder) {
      throw new Error("Microphone recording is not active.");
    }

    recorder.requestData();
    await new Promise((resolve) => window.setTimeout(resolve, 150));

    const mimeType = recorder.mimeType || "audio/webm";
    const blob = new Blob(answerChunksRef.current, { type: mimeType });
    if (blob.size < 1024) {
      throw new Error("Please speak for a little longer before asking for coaching.");
    }

    answerChunksRef.current = [];
    return {
      data: await blobToBase64(blob),
      mimeType,
    };
  };

  const ensurePracticeAudioContext = async () => {
    if (!practiceAudioContextRef.current) {
      practiceAudioContextRef.current = new (window.AudioContext ||
        (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)();
    }

    if (practiceAudioContextRef.current.state === "suspended") {
      await practiceAudioContextRef.current.resume();
    }

    return practiceAudioContextRef.current;
  };

  const playPcmAudio = async (
    base64Data: string,
    sampleRateHz = 24000
  ) => {
    const audioContext = await ensurePracticeAudioContext();
    const binaryString = window.atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let index = 0; index < binaryString.length; index++) {
      bytes[index] = binaryString.charCodeAt(index);
    }

    const pcm16 = new Int16Array(bytes.buffer);
    const audioBuffer = audioContext.createBuffer(1, pcm16.length, sampleRateHz);
    const channelData = audioBuffer.getChannelData(0);
    for (let index = 0; index < pcm16.length; index++) {
      channelData[index] = pcm16[index] / 32768;
    }

    const source = audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioContext.destination);
    practiceAudioSourceRef.current = source;
    source.start();

    await new Promise((resolve) => {
      source.onended = () => {
        if (practiceAudioSourceRef.current === source) {
          practiceAudioSourceRef.current = null;
        }
        resolve(undefined);
      };
    });
  };

  const stopPracticePlayback = () => {
    practicePlaybackRunRef.current += 1;

    if (practiceAudioSourceRef.current) {
      try {
        practiceAudioSourceRef.current.stop();
      } catch (error) {
        console.error("Stop practice audio error:", error);
      }
      practiceAudioSourceRef.current.disconnect();
      practiceAudioSourceRef.current = null;
    }

    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }

    setIsPlayingPractice(false);
  };

  const interruptCurrentAudio = async () => {
    stopPracticePlayback();

    if (adapterRef.current) {
      try {
        await adapterRef.current.interruptPlayback();
      } catch (error) {
        console.error("Interrupt agent audio error:", error);
      }
    }
  };

  const createRecapCard = async (coachingTurn: CoachingTurn) => {
    const response = await fetch("/api/session/recap-card", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sessionId: coachingTurn.sessionId,
        encouragingCaption: coachingTurn.momentumCardSpec.encouragingCaption,
        imagePrompt: coachingTurn.momentumCardSpec.imagePrompt,
      }),
    });

    const payload = (await response.json()) as
      | GenerateRecapCardResponse
      | { error?: string };

    if (!response.ok || !("assetDataUrl" in payload)) {
      throw new Error(
        "error" in payload && payload.error
          ? payload.error
          : "Failed to build the recap card."
      );
    }

    return payload;
  };

  const playSpeechPayload = async (
    payload: SpeakPracticeResponse,
    fallbackText: string,
    playbackRun = ++practicePlaybackRunRef.current
  ) => {
    if (practicePlaybackRunRef.current !== playbackRun) {
      return;
    }

    if ("useBrowserTts" in payload && payload.useBrowserTts) {
      if (
        typeof window === "undefined" ||
        !("speechSynthesis" in window) ||
        typeof SpeechSynthesisUtterance === "undefined"
      ) {
        return;
      }

      const utterance = new SpeechSynthesisUtterance(payload.fallbackText || fallbackText);
      utterance.lang = bootstrapRef.current?.language || "en-US";
      await new Promise<void>((resolve) => {
        const fallbackDurationMs = Math.min(
          5000,
          Math.max(1400, utterance.text.length * 55)
        );
        const finish = () => {
          window.clearTimeout(timeoutId);
          utterance.onend = null;
          utterance.onerror = null;
          resolve();
        };
        const timeoutId = window.setTimeout(() => {
          window.speechSynthesis.cancel();
          finish();
        }, fallbackDurationMs);
        utterance.onend = () => finish();
        utterance.onerror = () => finish();
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(utterance);
      });
      if (practicePlaybackRunRef.current !== playbackRun) {
        return;
      }
      return;
    }

    if ("audioData" in payload && payload.audioData) {
      await playPcmAudio(payload.audioData, payload.sampleRateHz || 24000);
      if (practicePlaybackRunRef.current !== playbackRun) {
        return;
      }
    }
  };

  const playQuestionAudio = async (
    sessionState: LiveSession,
    questionText: string,
    prefetchedAudio?: SpeakPracticeResponse | null
  ) => {
    const questionPlaybackRun = ++practicePlaybackRunRef.current;
    setAgentPrompt(questionText);
    setStatus("prompting");
    setSession((prev) =>
      prev
        ? {
            ...prev,
            currentQuestion: questionText,
            questionIndex: sessionState.questionIndex,
            status: "prompting",
          }
        : prev
    );

    try {
      const payload =
        prefetchedAudio || (await requestPracticeAudio(questionText, sessionState.sessionId));
      await playSpeechPayload(payload, questionText, questionPlaybackRun);
    } catch (error) {
      console.error("Question audio playback failed:", error);
      setError({
        type: "error",
        sessionId: sessionState.sessionId,
        code: "QUESTION_AUDIO_FAILED",
        message:
          error instanceof Error
            ? error.message
            : "The question loaded, but the spoken prompt failed.",
        timestamp: new Date().toISOString(),
      });
    } finally {
      if (
        practicePlaybackRunRef.current !== questionPlaybackRun ||
        (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive")
      ) {
        return;
      }
      setStatus("ready");
      setSession((prev) =>
        prev
          ? {
              ...prev,
              status: "ready",
            }
          : prev
      );
    }
  };

  const warmNextQuestion = async (coachingTurn: CoachingTurn, questionLimit: number) => {
    if (coachingTurn.questionIndex >= questionLimit) {
      nextQuestionPrefetchRef.current = null;
      return;
    }

    const preloadRun = ++nextQuestionPrefetchRunRef.current;
    try {
      const response = await fetch("/api/session/next-question", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sessionId: coachingTurn.sessionId,
          questionIndex: coachingTurn.questionIndex,
          questionLimit,
          previousTranscript: coachingTurn.originalTranscript,
          polishedAnswer: coachingTurn.polishedAnswer,
        }),
      });

      const payload = (await response.json()) as NextQuestionResponse | { error?: string };
      if (!response.ok || !("questionText" in payload) || !payload.questionText) {
        throw new Error(
          "error" in payload && payload.error
            ? payload.error
            : "Failed to preload the next question."
        );
      }

      let audio: SpeakPracticeResponse | null = null;
      try {
        audio = await requestPracticeAudio(payload.questionText, coachingTurn.sessionId);
      } catch (audioError) {
        console.error("Next question audio preload failed:", audioError);
      }

      if (nextQuestionPrefetchRunRef.current === preloadRun) {
        nextQuestionPrefetchRef.current = {
          sourceQuestionIndex: coachingTurn.questionIndex,
          response: payload,
          audio,
        };
      }
    } catch (error) {
      console.error("Next question preload failed:", error);
      if (nextQuestionPrefetchRunRef.current === preloadRun) {
        nextQuestionPrefetchRef.current = null;
      }
    }
  };

  const warmRecapCard = async (coachingTurn: CoachingTurn) => {
    if (
      prefetchedRecapCardRef.current ||
      recapCardPromiseRef.current ||
      momentumCardSourceTurnRef.current
    ) {
      return;
    }

    momentumCardSourceTurnRef.current = coachingTurn;
    const promise = createRecapCard(coachingTurn)
      .then((card) => {
        if (
          momentumCardSourceTurnRef.current?.sessionId === coachingTurn.sessionId &&
          momentumCardSourceTurnRef.current?.questionIndex === coachingTurn.questionIndex
        ) {
          prefetchedRecapCardRef.current = {
            sessionId: coachingTurn.sessionId,
            sourceQuestionIndex: coachingTurn.questionIndex,
            card,
          };
        }
        return card;
      })
      .catch((error) => {
        console.error("Recap card preload failed:", error);
        if (
          momentumCardSourceTurnRef.current?.sessionId === coachingTurn.sessionId &&
          momentumCardSourceTurnRef.current?.questionIndex === coachingTurn.questionIndex
        ) {
          prefetchedRecapCardRef.current = null;
        }
        throw error;
      })
      .finally(() => {
        if (recapCardPromiseRef.current === promise) {
          recapCardPromiseRef.current = null;
        }
      });

    recapCardPromiseRef.current = promise;
  };

  const startSession = async (config: SessionConfig): Promise<string | undefined> => {
    setEvents([]);
    setCoachingHistory([]);
    setLatestCoachingTurn(null);
    setRecap(null);
    setError(null);
    setAgentPrompt(null);
    setTranscriptSource(null);
    setStatus("connecting");
    setIsRecordingAnswer(false);
    setIsPlayingPractice(false);
    setIsPreparingPracticeAudio(false);
    setIsLoadingNextQuestion(false);
    setIsEndingSession(false);
    setHasPracticedCurrentTurn(false);
    setCachedPracticeAudio(null);
    setIsMockMode(true);
    bootstrapRef.current = null;
    lastCompletedCoachingTurnRef.current = null;
    nextQuestionPrefetchRunRef.current += 1;
    nextQuestionPrefetchRef.current = null;
    prefetchedRecapCardRef.current = null;
    recapCardPromiseRef.current = null;
    momentumCardSourceTurnRef.current = null;

    try {
      bootstrapRef.current = await createSessionBootstrap(config);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Failed to initialize the live session boundary.";

      setError({
        type: "error",
        sessionId: "bootstrap",
        code: "BOOTSTRAP_FAILED",
        message,
        timestamp: new Date().toISOString(),
      });
      setStatus("error");
      return undefined;
    }

    if (bootstrapRef.current.useMock) {
      adapterRef.current = new MockCoachAdapter();
      setIsMockMode(true);
    } else {
      adapterRef.current = new GeminiCoachAdapter(bootstrapRef.current);
      setIsMockMode(false);
    }

    setupAdapterEventHandlers(adapterRef.current);

    try {
      const response = await adapterRef.current.startSession({ config });
      const nextSession = bootstrapRef.current.useMock
        ? response.session
        : {
            ...response.session,
            status: "prompting" as const,
          };
      setSession(nextSession);
      if (!bootstrapRef.current.useMock) {
        setAgentPrompt(response.session.openingQuestion);
        setStatus("prompting");
        void playQuestionAudio(
          nextSession,
          response.session.openingQuestion,
          openingQuestionAudioRef.current
        );
      }
      void fetch(`/api/session/${response.session.sessionId}/state`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          session: response.session,
          language: config.language,
        }),
      }).catch((error) => {
        console.error("Persist session request failed:", error);
      });

      return response.session.sessionId;
    } catch (err: unknown) {
      setStatus("error");
      setError({
        type: "error",
        sessionId: "bootstrap",
        code: "CONNECTION_FAILED",
        message: (err as Error).message || "Failed to start session",
        timestamp: new Date().toISOString(),
      });
      return undefined;
    }
  };

  const beginAnswerRecording = async () => {
    if (
      !session ||
      isMockMode ||
      isRecordingAnswer ||
      isEndingSession ||
      status === "connecting"
    ) {
      return;
    }

    await interruptCurrentAudio();
    practicePreloadRunRef.current += 1;
    nextQuestionPrefetchRunRef.current += 1;
    setError(null);
    setLatestCoachingTurn(null);
    setTranscriptSource(null);
    setCachedPracticeAudio(null);
    setIsPreparingPracticeAudio(false);
    setHasPracticedCurrentTurn(false);

    try {
      await startAnswerCapture();
      setStatus("listening");
      setSession((prev) =>
        prev
          ? {
              ...prev,
              status: "listening",
            }
          : prev
      );
    } catch (err: unknown) {
      setError({
        type: "error",
        sessionId: session.sessionId,
        code: "RECORDING_FAILED",
        message:
          err instanceof Error
            ? err.message
            : "Failed to start recording your answer.",
        timestamp: new Date().toISOString(),
      });
    }
  };

  const requestPracticeAudio = async (ttsText: string, sessionId: string) => {
    const response = await fetch("/api/session/speak", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sessionId,
        text: ttsText,
      }),
    });

    const payload = (await response.json()) as
      | SpeakPracticeResponse
      | { error?: string };

    if (!response.ok) {
      throw new Error(
        "error" in payload && payload.error
          ? payload.error
          : "Failed to synthesize the polished answer audio."
      );
    }

    return payload as SpeakPracticeResponse;
  };

  const warmPracticeAudio = async (coachingTurn: CoachingTurn) => {
    const preloadRun = ++practicePreloadRunRef.current;
    setIsPreparingPracticeAudio(true);
    try {
      const payload = await requestPracticeAudio(
        coachingTurn.polishedAnswer,
        coachingTurn.sessionId
      );
      if (practicePreloadRunRef.current === preloadRun) {
        setCachedPracticeAudio(payload);
      }
    } catch (error) {
      console.error("Practice audio preload failed:", error);
      if (practicePreloadRunRef.current === preloadRun) {
        setCachedPracticeAudio(null);
      }
    } finally {
      if (practicePreloadRunRef.current === preloadRun) {
        setIsPreparingPracticeAudio(false);
      }
    }
  };

  const coachCurrentAnswer = async () => {
    if (!session || isEndingSession) {
      return;
    }

    if (!isMockMode && !isRecordingAnswer) {
      setError({
        type: "error",
        sessionId: session.sessionId,
        code: "RECORDING_REQUIRED",
        message: "Start recording your answer before asking for coaching.",
        timestamp: new Date().toISOString(),
      });
      return;
    }

    setError(null);
    setStatus("analyzing");
    stopPracticePlayback();
    practicePreloadRunRef.current += 1;
    nextQuestionPrefetchRunRef.current += 1;
    setCachedPracticeAudio(null);
    setIsPreparingPracticeAudio(false);
    setIsLoadingNextQuestion(false);

    try {
      const body = isMockMode
        ? {
            sessionId: session.sessionId,
            questionIndex: session.questionIndex,
            questionText: session.currentQuestion,
            transcript: getMockInterviewExample(session.questionIndex).originalTranscript,
          }
        : {
            sessionId: session.sessionId,
            questionIndex: session.questionIndex,
            questionText: session.currentQuestion,
            audioChunk: await snapshotAnswerAudio(),
          };

      if (!isMockMode) {
        stopAnswerCapture();
      }

      const runId = ++analyzeRunRef.current;
      const abortController = new AbortController();
      analyzeAbortControllerRef.current = abortController;
      const response = await fetch("/api/session/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: abortController.signal,
      });
      if (analyzeRunRef.current !== runId) {
        return;
      }

      const payload = (await response.json()) as
        | AnalyzeAnswerResponse
        | { error?: string };

      if (!response.ok || !("coachingTurn" in payload)) {
        throw new Error(
          "error" in payload && payload.error
            ? payload.error
            : "Failed to coach the current answer."
        );
      }

      setLatestCoachingTurn(payload.coachingTurn);
      setCoachingHistory((prev) => {
        const withoutCurrent = prev.filter(
          (turn) => turn.questionIndex !== payload.coachingTurn.questionIndex
        );
        return [...withoutCurrent, payload.coachingTurn].sort(
          (left, right) => left.questionIndex - right.questionIndex
        );
      });
      lastCompletedCoachingTurnRef.current = payload.coachingTurn;
      setTranscriptSource(payload.transcriptSource);
      setStatus("ready_to_practice");
      setHasPracticedCurrentTurn(false);
      void warmPracticeAudio(payload.coachingTurn);
      void warmNextQuestion(payload.coachingTurn, session.questionLimit);
      if (!momentumCardSourceTurnRef.current) {
        void warmRecapCard(payload.coachingTurn);
      }
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setStatus("ready");
        return;
      }
      if (!isMockMode) {
        stopAnswerCapture();
      }
      setError({
        type: "error",
        sessionId: session.sessionId,
        code: "ANALYSIS_FAILED",
        message: (err as Error).message || "Failed to coach the current answer.",
        timestamp: new Date().toISOString(),
      });
      setStatus("ready");
    } finally {
      analyzeAbortControllerRef.current = null;
    }
  };

  const requestNextQuestion = async () => {
    if (
      !session ||
      isEndingSession ||
      isLoadingNextQuestion ||
      session.questionIndex >= session.questionLimit
    ) {
      return;
    }

    setError(null);
    setIsLoadingNextQuestion(true);
    analyzeRunRef.current += 1;
    analyzeAbortControllerRef.current?.abort();
    await interruptCurrentAudio();
    practicePreloadRunRef.current += 1;
    setCachedPracticeAudio(null);
    setIsPreparingPracticeAudio(false);
    stopAnswerCapture();

    try {
      let payload: NextQuestionResponse;
      let prefetchedAudio: SpeakPracticeResponse | null = null;

      const prefetched = nextQuestionPrefetchRef.current;
      if (
        prefetched &&
        prefetched.sourceQuestionIndex === session.questionIndex &&
        prefetched.response.questionIndex === session.questionIndex + 1
      ) {
        payload = prefetched.response;
        prefetchedAudio = prefetched.audio;
      } else {
        const response = await fetch("/api/session/next-question", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            sessionId: session.sessionId,
            questionIndex: session.questionIndex,
            questionLimit: session.questionLimit,
            previousTranscript: latestCoachingTurn?.originalTranscript,
            polishedAnswer: latestCoachingTurn?.polishedAnswer,
          }),
        });

        const responsePayload = (await response.json()) as
          | NextQuestionResponse
          | { error?: string };

        if (
          !response.ok ||
          !("questionText" in responsePayload) ||
          !responsePayload.questionText
        ) {
          throw new Error(
            "error" in responsePayload && responsePayload.error
              ? responsePayload.error
              : "Failed to load the next interview question."
          );
        }
        payload = responsePayload;
      }

      nextQuestionPrefetchRef.current = null;

      const nextSessionState: LiveSession = {
        ...session,
        currentQuestion: payload.questionText,
        questionIndex: payload.questionIndex,
        questionLimit: payload.questionLimit,
        status: "prompting",
      };

      setSession(nextSessionState);
      setAgentPrompt(payload.questionText);
      setLatestCoachingTurn(null);
      setTranscriptSource(null);
      setStatus("prompting");
      setHasPracticedCurrentTurn(false);

      if (isMockMode && adapterRef.current) {
        try {
          await adapterRef.current.promptAgent({
            sessionId: session.sessionId,
            questionText: payload.questionText,
            questionIndex: payload.questionIndex,
          });
        } catch (promptError) {
          console.error("Prompt next question failed:", promptError);
          setError({
            type: "error",
            sessionId: session.sessionId,
            code: "NEXT_QUESTION_AUDIO_FAILED",
            message:
              promptError instanceof Error
                ? promptError.message
                : "The follow-up question text loaded, but the spoken prompt failed.",
            timestamp: new Date().toISOString(),
          });
        }
      } else {
        void playQuestionAudio(nextSessionState, payload.questionText, prefetchedAudio);
      }
    } catch (err: unknown) {
      setError({
        type: "error",
        sessionId: session.sessionId,
        code: "NEXT_QUESTION_FAILED",
        message:
          err instanceof Error
            ? err.message
            : "Failed to load the next interview question.",
        timestamp: new Date().toISOString(),
      });
    } finally {
      setIsLoadingNextQuestion(false);
    }
  };

  const playPracticeLine = async () => {
    if (!session || !latestCoachingTurn || isEndingSession) {
      return;
    }

    setIsPlayingPractice(true);
    setError(null);

    try {
      const playbackRun = ++practicePlaybackRunRef.current;
      const payload =
        cachedPracticeAudio ||
        (await requestPracticeAudio(latestCoachingTurn.polishedAnswer, session.sessionId));

      if (!cachedPracticeAudio) {
        setCachedPracticeAudio(payload);
      }

      setHasPracticedCurrentTurn(true);

      await playSpeechPayload(payload, latestCoachingTurn.polishedAnswer, playbackRun);
      if (practicePlaybackRunRef.current !== playbackRun) {
        return;
      }
    } catch (err: unknown) {
      setError({
        type: "error",
        sessionId: session.sessionId,
        code: "TTS_FAILED",
        message: (err as Error).message || "Failed to play the polished answer.",
        timestamp: new Date().toISOString(),
      });
    } finally {
      setIsPlayingPractice(false);
    }
  };

  const endSession = async () => {
    if (!session || isEndingSession) {
      return;
    }

    setIsEndingSession(true);
    stopPracticePlayback();
    practicePreloadRunRef.current += 1;
    stopAnswerCapture();
    analyzeRunRef.current += 1;
    analyzeAbortControllerRef.current?.abort();

    try {
      if (adapterRef.current) {
        await adapterRef.current.endSession({
          sessionId: session.sessionId,
        });
      }
    } catch (err) {
      console.error("End session adapter error:", err);
    }

    const recapSourceTurn = latestCoachingTurn || lastCompletedCoachingTurnRef.current;
    const provisionalRecap: Recap = recapSourceTurn
      ? {
          sessionId: recapSourceTurn.sessionId,
          originalAnswer: recapSourceTurn.originalTranscript,
          polishedAnswer: recapSourceTurn.polishedAnswer,
          primaryFocus:
            recapSourceTurn.improvementTags[0] || "Clearer professional phrasing",
          coachMessage: recapSourceTurn.coachMessage,
          encouragementLine: recapSourceTurn.encouragementLine,
          roleLabel: recapSourceTurn.roleLabel,
          strengthKeyword: recapSourceTurn.strengthKeyword,
          assetModel: "pending",
        }
      : {
          sessionId: session.sessionId,
          originalAnswer: "No coached answer was captured in this session.",
          polishedAnswer:
            "Coach one interview answer next time to get a polished response and speaking card.",
          primaryFocus: "Use the coaching button after you finish an answer",
          coachMessage:
            "The live session started correctly, but no answer was analyzed before the session ended.",
          encouragementLine:
            "You are one coached answer away from a much stronger interview story.",
          roleLabel: DEFAULT_ROLE_LABEL,
          strengthKeyword: DEFAULT_STRENGTH_KEYWORD,
          assetModel: "failed",
        };

    const snapshotHistory =
      recapSourceTurn && !coachingHistory.some((turn) => turn.questionIndex === recapSourceTurn.questionIndex)
        ? [...coachingHistory, recapSourceTurn].sort(
            (left, right) => left.questionIndex - right.questionIndex
          )
        : coachingHistory;

    const provisionalPayload: SessionRecapPayload = {
      recap: provisionalRecap,
      coachingHistory: snapshotHistory,
    };

    setRecap(provisionalRecap);
    saveRecapSnapshot(provisionalPayload);
    setStatus("recap");
    setIsEndingSession(false);

    void (async () => {
      let finalizedRecap = provisionalRecap;

      const cardSourceTurn = momentumCardSourceTurnRef.current || recapSourceTurn;

      if (cardSourceTurn) {
        try {
          const prefetchedCard =
            prefetchedRecapCardRef.current &&
            prefetchedRecapCardRef.current.sessionId === cardSourceTurn.sessionId &&
            prefetchedRecapCardRef.current.sourceQuestionIndex ===
              cardSourceTurn.questionIndex
              ? prefetchedRecapCardRef.current.card
              : recapCardPromiseRef.current
                ? await recapCardPromiseRef.current
                : await createRecapCard(cardSourceTurn);
          const card = prefetchedCard;
          finalizedRecap = {
            ...provisionalRecap,
            assetDataUrl: card.assetDataUrl,
            assetAlt: card.alt,
            assetModel: card.model,
          };
        } catch (err: unknown) {
          finalizedRecap = {
            ...provisionalRecap,
            assetModel: "failed",
          };
          setError({
            type: "error",
            sessionId: recapSourceTurn?.sessionId || session.sessionId,
            code: "RECAP_CARD_FAILED",
            message:
              err instanceof Error
                ? err.message
                : "The recap card could not be generated.",
            timestamp: new Date().toISOString(),
          });
        }
      }

      setRecap(finalizedRecap);
      saveRecapSnapshot({
        recap: finalizedRecap,
        coachingHistory: snapshotHistory,
      });

      try {
        const response = await fetch(`/api/session/${session.sessionId}/recap`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(finalizedRecap),
        });

        if (!response.ok) {
          const payload = (await response.json()) as { error?: string };
          throw new Error(payload.error || "Failed to persist recap.");
        }
      } catch (error) {
        console.error("Persist recap request failed:", error);
      }
    })();
  };

  useEffect(() => {
    if (
      openingQuestionAudioRef.current ||
      openingQuestionPreloadPromiseRef.current ||
      typeof window === "undefined"
    ) {
      return;
    }

    openingQuestionPreloadPromiseRef.current = requestPracticeAudio(
      getMockInterviewExample(1).question,
      "opening-question-preload"
    )
      .then((payload) => {
        openingQuestionAudioRef.current = payload;
      })
      .catch((error) => {
        console.error("Opening question audio preload failed:", error);
      })
      .finally(() => {
        openingQuestionPreloadPromiseRef.current = null;
      });
  }, []);

  useEffect(() => {
    return () => {
      stopPracticePlayback();
      stopAnswerCapture();
      if (practiceAudioContextRef.current) {
        void practiceAudioContextRef.current.close();
        practiceAudioContextRef.current = null;
      }
      if (adapterRef.current) {
        adapterRef.current.onEvent(() => {});
      }
    };
  }, []);

  return (
    <CoachContext.Provider
      value={{
        session,
        status,
        isMockMode,
        isRecordingAnswer,
        events,
        coachingHistory,
        latestCoachingTurn,
        recap,
        error,
        agentPrompt,
        transcriptSource,
        isPlayingPractice,
        isPreparingPracticeAudio,
        isLoadingNextQuestion,
        isEndingSession,
        hasPracticedCurrentTurn,
        startSession,
        beginAnswerRecording,
        coachCurrentAnswer,
        playPracticeLine,
        requestNextQuestion,
        endSession,
      }}
    >
      {children}
    </CoachContext.Provider>
  );
}

export function useCoachSession() {
  const context = useContext(CoachContext);
  if (context === undefined) {
    throw new Error("useCoachSession must be used within a CoachProvider");
  }
  return context;
}
