import { GeminiFailure, malformed, responseText, resultParts, type GeminiResponse } from "../../../application/workflows/gemini-evaluation";
import { credential } from "./key-store";
import { decodeVoice } from "./voice-format";

export const MODEL = "gemini-3.8-flash";
const TTS = "gemini-3.8-flash-tts";
const base = "https://generativelanguage.googleapis.com/v1beta/models/";
const network = () => new GeminiFailure("Couldn't reach Google. Try again.");
export function providerError(http: number, payload: { error?: { status?: string; details?: { reason?: string }[] } } | null, model: string) {
  const status = payload?.error?.status;
  const reasons = Array.isArray(payload?.error?.details) ? payload.error.details.map(d => d?.reason) : [];
  const audioUnavailable = model === TTS && (http === 403 || http === 429);
  const invalid = http === 401 || (http === 400 && reasons.includes("API_KEY_INVALID"));
  const restricted = http === 403 && reasons.some(r => r === "API_KEY_HTTP_REFERRER_BLOCKED" || r === "API_KEY_SERVICE_BLOCKED");
  const denied = http === 403 || status === "PERMISSION_DENIED";
  const message = audioUnavailable ? "Audio isn't available with this key. You can still use feedback."
    : invalid ? "Google didn't accept this key."
    : restricted ? "This key's restrictions block this site or the Gemini API. Allow this site's address and the Generative Language API."
    : http === 404 ? `This key can't use ${model}.`
    : http === 429 || status === "RESOURCE_EXHAUSTED" ? "Your key's quota or rate limit was reached. Try again later."
    : denied ? "Google denied access for this key."
    : http >= 500 || status === "INTERNAL" || status === "UNAVAILABLE" ? "Gemini is temporarily unavailable. Try again."
    : "Google refused this request.";
  return new GeminiFailure(message, !audioUnavailable && (invalid || (denied && !restricted)));
}
async function request(model: typeof MODEL | typeof TTS, key: string, body: object | undefined, ms: number, signal: AbortSignal): Promise<GeminiResponse> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal.addEventListener("abort", abort, { once: true });
  if (signal.aborted) abort();
  const timer = setTimeout(abort, ms);
  try {
    const response = await fetch(base + model + (body ? ":generateContent" : ""), {
      method: body ? "POST" : "GET", headers: { "x-goog-api-key": key, ...(body && { "Content-Type": "application/json" }) },
      body: body && JSON.stringify(body), credentials: "omit", redirect: "error", cache: "no-store", signal: controller.signal,
    });
    const data = await response.json().catch(() => null);
    if (controller.signal.aborted) throw network();
    if (!response.ok) throw providerError(response.status, data, model);
    if (!data) throw malformed();
    return data;
  } catch (e) { throw e instanceof GeminiFailure ? e : network(); }
  finally { clearTimeout(timer); signal.removeEventListener("abort", abort); }
}
export const checkKey = (key: string, signal: AbortSignal) => request(MODEL, key, undefined, 15_000, signal);
export function generate(body: object, signal: AbortSignal, ms = 45_000, model: typeof MODEL | typeof TTS = MODEL) {
  const active = credential();
  if (!active) throw new GeminiFailure("Add your Gemini key first.");
  return request(model, active.key, body, ms, AbortSignal.any([signal, active.signal]));
}
export async function transcribe(bytes: Uint8Array, signal: AbortSignal) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  const result = await generate({ contents: [{ role: "user", parts: [{ text: "Transcribe only the verbatim words. No preamble, timestamps or formatting. Return empty text if there is no speech." }, { inlineData: { mimeType: "audio/wav", data: btoa(binary) } }] }], generationConfig: { thinkingConfig: { thinkingLevel: "LOW" }, maxOutputTokens: 2048 } }, signal, 60_000);
  return responseText(result, true).slice(0, 10_000);
}
export async function speak(text: string, signal: AbortSignal) {
  const parts = resultParts(await generate({ contents: [{ role: "user", parts: [{ text }] }], generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Sulafat" } } } } }, signal, 60_000, TTS));
  const audio = parts.find(part => part.inlineData)?.inlineData;
  if (!audio?.data || !audio.mimeType) throw malformed();
  try { return decodeVoice(Uint8Array.from(atob(audio.data), c => c.charCodeAt(0)), audio.mimeType); } catch { throw malformed(); }
}
