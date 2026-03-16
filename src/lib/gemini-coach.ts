import {
  type LiveServerMessage,
  type Session,
  GoogleGenAI,
  Modality,
} from "@google/genai";
import {
  CoachEvent,
  EndSessionRequest,
  LiveSession,
  PromptAgentRequest,
  SessionBootstrap,
  StartSessionRequest,
  StartSessionResponse,
} from "../types/coach";
import { LIVE_VOICE_NAME, MAX_INTERVIEW_QUESTIONS } from "./coach-config";

export class GeminiCoachAdapter {
  private currentSession: LiveSession | null = null;
  private eventCallback: ((event: CoachEvent) => void) | null = null;
  private readonly bootstrap: SessionBootstrap;
  private readonly ai: GoogleGenAI;
  private liveSession: Session | null = null;
  private audioContext: AudioContext | null = null;
  private activeAudioSource: AudioBufferSourceNode | null = null;
  private playbackToken = 0;
  private suppressIncomingAudioUntilNextPrompt = false;
  private pendingAudioChunks: Uint8Array[] = [];
  private pendingAudioMimeType = "audio/pcm;rate=24000";

  constructor(bootstrap: SessionBootstrap) {
    this.bootstrap = bootstrap;
    this.ai = new GoogleGenAI({
      apiKey: bootstrap.token,
      httpOptions: { apiVersion: "v1alpha" },
    });
  }

  onEvent(callback: (event: CoachEvent) => void) {
    this.eventCallback = callback;
  }

  async startSession(
    request: StartSessionRequest
  ): Promise<StartSessionResponse> {
    const sessionId = `gemini-session-${Date.now()}`;

    this.currentSession = {
      sessionId,
      scenario: request.config.scenario,
      openingQuestion: this.bootstrap.openingQuestion,
      currentQuestion: this.bootstrap.openingQuestion,
      questionIndex: 1,
      questionLimit: MAX_INTERVIEW_QUESTIONS,
      status: "connecting",
      startedAt: new Date().toISOString(),
    };

    this.emit({
      type: "status",
      sessionId,
      status: "connecting",
      timestamp: new Date().toISOString(),
    });

    try {
      await this.initializeAudioContext();

      this.liveSession = await this.ai.live.connect({
        model: this.bootstrap.model,
        config: {
          responseModalities: this.bootstrap.responseModalities.map(
            (modality) => Modality[modality]
          ),
          systemInstruction: {
            parts: [{ text: this.bootstrap.systemInstruction }],
          },
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: LIVE_VOICE_NAME,
              },
            },
          },
        },
        callbacks: {
          onmessage: (data: LiveServerMessage) => {
            this.handleGeminiMessage(data);
          },
          onerror: (err: unknown) => {
            this.emit({
              type: "error",
              sessionId,
              code: "GEMINI_ERROR",
              message: (err as Error).message || "Gemini connection error",
              timestamp: new Date().toISOString(),
            });
          },
          onclose: () => {
            if (this.currentSession) {
              this.emit({
                type: "status",
                sessionId,
                status: "error",
                message: "Connection closed unexpectedly.",
                timestamp: new Date().toISOString(),
              });
            }
          },
        },
      });
    } catch (err: unknown) {
      this.emit({
        type: "error",
        sessionId,
        code: "CONNECTION_FAILED",
        message: (err as Error).message || "Failed to connect to Gemini Live API.",
        timestamp: new Date().toISOString(),
      });
      throw err;
    }

    return { session: this.currentSession };
  }

  async endSession(request: EndSessionRequest): Promise<void> {
    if (!this.currentSession) {
      return;
    }

    if (request.sessionId !== this.currentSession.sessionId) {
      this.emit({
        type: "error",
        sessionId: request.sessionId,
        code: "SESSION_MISMATCH",
        message: "Attempted to end a session that is not active.",
        timestamp: new Date().toISOString(),
      });
      return;
    }

    this.liveSession?.close();
    this.liveSession = null;
    this.stopAudioPlayback();
    this.pendingAudioChunks = [];
    this.pendingAudioMimeType = "audio/pcm;rate=24000";

    if (this.audioContext) {
      void this.audioContext.close();
      this.audioContext = null;
    }

    this.currentSession = null;
  }

  async interruptPlayback(): Promise<void> {
    this.stopAudioPlayback();
    this.suppressIncomingAudioUntilNextPrompt = true;
    this.pendingAudioChunks = [];
    this.pendingAudioMimeType = "audio/pcm;rate=24000";
  }

  async promptAgent(request: PromptAgentRequest): Promise<void> {
    if (!this.currentSession) {
      return;
    }

    if (request.sessionId !== this.currentSession.sessionId) {
      this.emit({
        type: "error",
        sessionId: request.sessionId,
        code: "SESSION_MISMATCH",
        message: "Attempted to prompt a session that is not active.",
        timestamp: new Date().toISOString(),
      });
      return;
    }

    this.currentSession.currentQuestion = request.questionText;
    this.currentSession.questionIndex = request.questionIndex;
    this.currentSession.status = "prompting";
    this.suppressIncomingAudioUntilNextPrompt = false;
    this.emit({
      type: "status",
      sessionId: request.sessionId,
      status: "prompting",
      timestamp: new Date().toISOString(),
    });
    this.emit({
      type: "agent_prompt",
      sessionId: request.sessionId,
      text: request.questionText,
      timestamp: new Date().toISOString(),
    });

    if (!this.liveSession) {
      return;
    }

    await this.liveSession.sendClientContent({
      turns: [
        {
          role: "user",
          parts: [
            {
              text: `Ask exactly this follow-up interview question and then wait silently for the user's answer: ${request.questionText}`,
            },
          ],
        },
      ],
      turnComplete: true,
    });
  }

  private handleGeminiMessage(data: LiveServerMessage) {
    if (data.serverContent?.interrupted) {
      this.pendingAudioChunks = [];
      this.pendingAudioMimeType = "audio/pcm;rate=24000";
    }

    const parts = data.serverContent?.modelTurn?.parts || [];
    for (const part of parts) {
      if (
        part.inlineData?.mimeType?.startsWith("audio/pcm") &&
        part.inlineData.data
      ) {
        if (this.suppressIncomingAudioUntilNextPrompt) {
          continue;
        }
        this.pendingAudioChunks.push(this.decodeBase64ToBytes(part.inlineData.data));
        this.pendingAudioMimeType = part.inlineData.mimeType;
      }
    }

    if (
      this.pendingAudioChunks.length > 0 &&
      (data.serverContent?.turnComplete || data.serverContent?.generationComplete)
    ) {
      const bufferedChunks = this.pendingAudioChunks;
      const mimeType = this.pendingAudioMimeType;
      this.pendingAudioChunks = [];
      this.pendingAudioMimeType = "audio/pcm;rate=24000";
      void this.playBufferedAudio(bufferedChunks, mimeType);
    }
  }

  private async initializeAudioContext() {
    if (typeof window === "undefined") {
      return;
    }

    if (!this.audioContext) {
      this.audioContext = new (
        window.AudioContext ||
        (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      )();
    }

    if (this.audioContext.state === "suspended") {
      await this.audioContext.resume();
    }
  }

  private parseSampleRate(mimeType?: string) {
    const match = mimeType?.match(/rate=(\d+)/i);
    return match ? Number(match[1]) : 24000;
  }

  private decodeBase64ToBytes(base64Data: string) {
    const binaryString = window.atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let index = 0; index < binaryString.length; index++) {
      bytes[index] = binaryString.charCodeAt(index);
    }

    return bytes;
  }

  private decodePcm16Bytes(bytes: Uint8Array) {

    const sampleCount = Math.floor(bytes.byteLength / 2);
    const samples = new Float32Array(sampleCount);
    for (let index = 0; index < sampleCount; index++) {
      const lo = bytes[index * 2] ?? 0;
      const hi = bytes[index * 2 + 1] ?? 0;
      const value = (hi << 8) | lo;
      const signed = value >= 0x8000 ? value - 0x10000 : value;
      samples[index] = signed / 32768;
    }

    return samples;
  }

  private mergeChunks(chunks: Uint8Array[]) {
    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const merged = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }
    return merged;
  }

  private async playBufferedAudio(chunks: Uint8Array[], mimeType?: string) {
    try {
      await this.initializeAudioContext();
      if (!this.audioContext) {
        return;
      }

      const playbackToken = ++this.playbackToken;
      if (
        playbackToken !== this.playbackToken ||
        this.suppressIncomingAudioUntilNextPrompt
      ) {
        return;
      }
      const sampleRateHz = this.parseSampleRate(mimeType);
      const mergedBytes = this.mergeChunks(chunks);
      const pcmSamples = this.decodePcm16Bytes(mergedBytes);
      const audioBuffer = this.audioContext.createBuffer(1, pcmSamples.length, sampleRateHz);
      const channelData = audioBuffer.getChannelData(0);
      channelData.set(pcmSamples);

      if (
        playbackToken !== this.playbackToken ||
        this.suppressIncomingAudioUntilNextPrompt
      ) {
        return;
      }

      const source = this.audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.audioContext.destination);
      this.activeAudioSource = source;
      source.onended = () => {
        if (this.activeAudioSource === source) {
          this.activeAudioSource = null;
        }
        if (
          this.currentSession &&
          this.playbackToken === playbackToken &&
          this.currentSession.status === "prompting"
        ) {
          this.currentSession.status = "ready";
          this.emit({
            type: "status",
            sessionId: this.currentSession.sessionId,
            status: "ready",
            timestamp: new Date().toISOString(),
          });
        }
      };
      source.start();
    } catch (error) {
      console.error("Live audio playback error:", error);
    }
  }

  private stopAudioPlayback() {
    this.playbackToken += 1;

    if (!this.activeAudioSource) {
      return;
    }

    try {
      this.activeAudioSource.stop();
    } catch (error) {
      console.error("Stop live audio error:", error);
    }
    this.activeAudioSource.disconnect();
    this.activeAudioSource = null;
  }

  private emit(event: CoachEvent) {
    if (this.eventCallback) {
      this.eventCallback(event);
    }
  }
}
