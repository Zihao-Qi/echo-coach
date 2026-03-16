import { NextResponse } from "next/server";
import { PracticeScenario, SessionBootstrap } from "../../../types/coach";
import { GoogleGenAI, Modality } from "@google/genai";
import {
  LIVE_MODEL,
  LIVE_VOICE_NAME,
  MVP_SCENARIO,
} from "../../../lib/coach-config";
import {
  buildLiveSystemInstruction,
  createSessionBootstrap,
  resolveMockMode,
  ANALYSIS_MODEL,
  RECAP_CARD_MODEL,
  TTS_MODEL,
  TRANSCRIPTION_MODEL,
  INTERVIEW_OPENING_QUESTION,
} from "../../../lib/server/coach-server";

const SUPPORTED_SCENARIOS: PracticeScenario[] = [MVP_SCENARIO];

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { scenario?: string };
    const { scenario } = body;

    if (!scenario || !SUPPORTED_SCENARIOS.includes(scenario as PracticeScenario)) {
      return NextResponse.json(
        { error: "A supported scenario is required" },
        { status: 400 }
      );
    }

    const useMock = resolveMockMode();
    const systemInstruction = buildLiveSystemInstruction();

    if (useMock) {
      const bootstrap: SessionBootstrap = createSessionBootstrap(true);
      return NextResponse.json(bootstrap);
    }

    const apiKey = process.env.GEMINI_API_KEY;
    const ai = apiKey
      ? new GoogleGenAI({ apiKey, httpOptions: { apiVersion: "v1alpha" } })
      : new GoogleGenAI({ httpOptions: { apiVersion: "v1alpha" } });

    let token = "";
    try {
      const tokenResponse = await ai.authTokens.create({
        config: {
          uses: 1,
          liveConnectConstraints: {
            model: LIVE_MODEL,
            config: {
              responseModalities: [Modality.AUDIO],
              systemInstruction: {
                parts: [{ text: systemInstruction }],
              },
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: {
                    voiceName: LIVE_VOICE_NAME,
                  },
                },
              },
            },
          },
          lockAdditionalFields: [],
        },
      });
      token = tokenResponse.name || "";

      if (!token) {
        throw new Error("Auth token response did not include a token name.");
      }
    } catch (e) {
      console.error("Failed to generate auth token", e);
      return NextResponse.json(
        { error: "Failed to generate auth token. Check API key or GCP credentials." },
        { status: 500 }
      );
    }

    const bootstrap: SessionBootstrap = {
      token,
      projectId: process.env.GOOGLE_CLOUD_PROJECT || "",
      endpoint: "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent",
      model: LIVE_MODEL,
      analysisModel: ANALYSIS_MODEL,
      ttsModel: TTS_MODEL,
      recapCardModel: RECAP_CARD_MODEL,
      transcriptionModel: TRANSCRIPTION_MODEL,
      responseModalities: [Modality.AUDIO],
      systemInstruction,
      openingQuestion: INTERVIEW_OPENING_QUESTION,
      language: "en-US",
      useMock: false,
    };

    return NextResponse.json(bootstrap);
  } catch (err: unknown) {
    console.error("Session creation error:", err);
    return NextResponse.json(
      { error: "Failed to create session credentials" },
      { status: 500 }
    );
  }
}
