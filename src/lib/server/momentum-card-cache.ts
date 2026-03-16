import {
  GenerateRecapCardRequest,
  GenerateRecapCardResponse,
} from "../../types/coach";
import {
  buildRecapCardPrompt,
  createFallbackRecapCardDataUrl,
  createGeminiClient,
  RECAP_CARD_MODEL,
  resolveMockMode,
} from "./coach-server";

interface MomentumCardCacheEntry {
  requestKey: string;
  promise: Promise<GenerateRecapCardResponse>;
}

declare global {
  var __echoCoachMomentumCardCache:
    | Map<string, MomentumCardCacheEntry>
    | undefined;
}

function getMomentumCardCache() {
  if (!globalThis.__echoCoachMomentumCardCache) {
    globalThis.__echoCoachMomentumCardCache = new Map();
  }

  return globalThis.__echoCoachMomentumCardCache;
}

function getRequestKey(request: GenerateRecapCardRequest) {
  return JSON.stringify({
    encouragingCaption: request.encouragingCaption.trim(),
    imagePrompt: request.imagePrompt.trim(),
  });
}

async function generateMomentumCard(
  request: GenerateRecapCardRequest
): Promise<GenerateRecapCardResponse> {
  const prompt = buildRecapCardPrompt(request);
  const alt = "Encouragement card generated for the Echo Coach recap.";

  if (resolveMockMode()) {
    return {
      model: "svg-fallback",
      prompt,
      alt,
      assetDataUrl: createFallbackRecapCardDataUrl(request),
    };
  }

  try {
    const ai = createGeminiClient();
    const imageResponse = await ai.models.generateImages({
      model: RECAP_CARD_MODEL,
      prompt,
      config: {
        numberOfImages: 1,
        aspectRatio: "3:4",
      },
    });

    const imageBytes = imageResponse.generatedImages?.[0]?.image?.imageBytes;
    if (!imageBytes) {
      throw new Error("Imagen response did not include image bytes.");
    }

    return {
      model: RECAP_CARD_MODEL,
      prompt,
      alt,
      assetDataUrl: `data:image/png;base64,${imageBytes}`,
    };
  } catch (error) {
    console.error("Imagen generation failed, using fallback card.", error);
    return {
      model: "svg-fallback",
      prompt,
      alt,
      assetDataUrl: createFallbackRecapCardDataUrl(request),
    };
  }
}

function ensureMomentumCardPromise(request: GenerateRecapCardRequest) {
  const cache = getMomentumCardCache();
  const requestKey = getRequestKey(request);
  const existingEntry = cache.get(request.sessionId);

  if (existingEntry) {
    return existingEntry.promise;
  }

  const promise = generateMomentumCard(request).catch((error) => {
    const cachedEntry = cache.get(request.sessionId);
    if (cachedEntry?.promise === promise) {
      cache.delete(request.sessionId);
    }
    throw error;
  });

  cache.set(request.sessionId, {
    requestKey,
    promise,
  });

  return promise;
}

export function prewarmMomentumCard(request: GenerateRecapCardRequest) {
  return ensureMomentumCardPromise(request);
}

export function getOrCreateMomentumCard(request: GenerateRecapCardRequest) {
  const cache = getMomentumCardCache();
  const requestKey = getRequestKey(request);
  const existingEntry = cache.get(request.sessionId);

  if (existingEntry && existingEntry.requestKey === requestKey) {
    return existingEntry.promise;
  }

  return ensureMomentumCardPromise(request);
}
