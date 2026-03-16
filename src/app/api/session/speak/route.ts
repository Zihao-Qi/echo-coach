import { Modality } from "@google/genai";
import { NextResponse } from "next/server";
import { SpeakPracticeRequest, SpeakPracticeResponse } from "../../../../types/coach";
import {
  createGeminiClient,
  DEFAULT_LANGUAGE,
  resolveMockMode,
  TTS_FALLBACK_MODEL,
  TTS_MODEL,
} from "../../../../lib/server/coach-server";

const MAX_TTS_CACHE_ENTRIES = 24;

declare global {
  var __echoCoachTtsResponseCache:
    | Map<string, SpeakPracticeResponse>
    | undefined;
  var __echoCoachTtsQuotaResetByModel:
    | Map<string, number>
    | undefined;
}

function getTtsResponseCache() {
  if (!globalThis.__echoCoachTtsResponseCache) {
    globalThis.__echoCoachTtsResponseCache = new Map();
  }

  return globalThis.__echoCoachTtsResponseCache;
}

function getTtsQuotaResetByModel() {
  if (!globalThis.__echoCoachTtsQuotaResetByModel) {
    globalThis.__echoCoachTtsQuotaResetByModel = new Map();
  }

  return globalThis.__echoCoachTtsQuotaResetByModel;
}

function getTtsCacheKey(model: string, text: string) {
  return `${model}:${DEFAULT_LANGUAGE}:${text}`;
}

function rememberTtsResponse(cacheKey: string, response: SpeakPracticeResponse) {
  const cache = getTtsResponseCache();
  cache.set(cacheKey, response);

  if (cache.size <= MAX_TTS_CACHE_ENTRIES) {
    return;
  }

  const oldestKey = cache.keys().next().value;
  if (oldestKey) {
    cache.delete(oldestKey);
  }
}

function parseQuotaRetryDelayMs(message: string) {
  const retryInfoMatch = message.match(/retryDelay":"(\d+)s"/i);
  if (retryInfoMatch) {
    return Number(retryInfoMatch[1]) * 1000;
  }

  const humanMatch = message.match(
    /Please retry in (?:(\d+)h)?(?:(\d+)m)?(?:(\d+(?:\.\d+)?)s)?/i
  );
  if (!humanMatch) {
    return null;
  }

  const hours = Number(humanMatch[1] || 0);
  const minutes = Number(humanMatch[2] || 0);
  const seconds = Number(humanMatch[3] || 0);
  return ((hours * 60 + minutes) * 60 + seconds) * 1000;
}

function isQuotaExhausted(message: string) {
  return /RESOURCE_EXHAUSTED|quota exceeded|429/i.test(message);
}

async function synthesizeWithGeminiTts(model: string, text: string) {
  const ai = createGeminiClient();
  const ttsResponse = await ai.models.generateContent({
    model,
    contents: text,
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        languageCode: DEFAULT_LANGUAGE,
        voiceConfig: {
          prebuiltVoiceConfig: {
            voiceName: "Aoede",
          },
        },
      },
    },
  });

  const audioPart = ttsResponse.candidates
    ?.flatMap((candidate) => candidate.content?.parts || [])
    .find((part) => part.inlineData?.data);

  if (!audioPart?.inlineData?.data) {
    throw new Error("TTS response did not include audio data.");
  }

  return {
    model,
    audioData: audioPart.inlineData.data,
    mimeType: audioPart.inlineData.mimeType || "audio/pcm;rate=24000",
    sampleRateHz: 24000,
  } satisfies SpeakPracticeResponse;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as SpeakPracticeRequest;
    const text = body.text?.trim() || "";

    if (!body.sessionId || !text) {
      return NextResponse.json(
        { error: "sessionId and text are required" },
        { status: 400 }
      );
    }

    if (resolveMockMode()) {
      return NextResponse.json({
        model: "browser-speech-synthesis",
        useBrowserTts: true,
        fallbackText: text,
      } satisfies SpeakPracticeResponse);
    }

    const modelsToTry = [TTS_MODEL, TTS_FALLBACK_MODEL];
    const quotaResetByModel = getTtsQuotaResetByModel();
    let lastError: Error | null = null;

    for (const model of modelsToTry) {
      const quotaResetAt = quotaResetByModel.get(model);
      if (quotaResetAt && Date.now() < quotaResetAt) {
        continue;
      }

      const cacheKey = getTtsCacheKey(model, text);
      const cachedResponse = getTtsResponseCache().get(cacheKey);
      if (cachedResponse) {
        return NextResponse.json(cachedResponse);
      }

      try {
        const response = await synthesizeWithGeminiTts(model, text);
        rememberTtsResponse(cacheKey, response);
        return NextResponse.json(response);
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : "Failed to synthesize practice audio.";
        lastError = error instanceof Error ? error : new Error(message);
        console.error(`TTS error for ${model}:`, error);

        if (isQuotaExhausted(message)) {
          const retryDelayMs = parseQuotaRetryDelayMs(message) ?? 15 * 60 * 1000;
          quotaResetByModel.set(model, Date.now() + retryDelayMs);
          continue;
        }

        break;
      }
    }

    const quotaBlockedModels = modelsToTry.filter((model) => {
      const quotaResetAt = quotaResetByModel.get(model);
      return Boolean(quotaResetAt && Date.now() < quotaResetAt);
    });

    if (quotaBlockedModels.length === modelsToTry.length) {
      const nextRetryAt = Math.min(
        ...quotaBlockedModels.map((model) => quotaResetByModel.get(model) || Infinity)
      );
      const retryInMinutes = Math.max(
        1,
        Math.ceil((nextRetryAt - Date.now()) / (60 * 1000))
      );
      return NextResponse.json(
        {
          error: `Gemini TTS quota is exhausted for both configured voices. Retry in about ${retryInMinutes} minute(s).`,
        },
        { status: 429 }
      );
    }

    throw lastError || new Error("Failed to synthesize practice audio.");
  } catch (error: unknown) {
    console.error("TTS error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to synthesize practice audio.",
      },
      { status: 500 }
    );
  }
}
