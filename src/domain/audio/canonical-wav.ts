// Shared transport contract. No browser, Node, provider, or HTTP dependencies.
export const AUDIO_SAMPLE_RATE = 16_000;
export const AUDIO_MAX_SECONDS = 120;
export const AUDIO_MAX_FRAMES = AUDIO_SAMPLE_RATE * AUDIO_MAX_SECONDS;
export const WAV_HEADER_BYTES = 44;
export const AUDIO_MAX_DATA_BYTES = AUDIO_MAX_FRAMES * 2;
export const AUDIO_MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

export class AudioValidationError extends Error {}

export interface CanonicalWavInfo {
  frames: number;
  durationSeconds: number;
  sampleRate: typeof AUDIO_SAMPLE_RATE;
  channels: 1;
  dataBytes: number;
}

function tag(view: DataView, offset: number, value: string) {
  return [...value].every((char, index) => view.getUint8(offset + index) === char.charCodeAt(0));
}

export function validateCanonicalWav(bytes: Uint8Array): CanonicalWavInfo {
  if (bytes.byteLength < WAV_HEADER_BYTES || bytes.byteLength > AUDIO_MAX_UPLOAD_BYTES) {
    throw new AudioValidationError("Audio must be a bounded canonical PCM WAV file.");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const dataBytes = bytes.byteLength - WAV_HEADER_BYTES;
  if (
    !tag(view, 0, "RIFF") || !tag(view, 8, "WAVE") || !tag(view, 12, "fmt ") || !tag(view, 36, "data") ||
    view.getUint32(4, true) !== bytes.byteLength - 8 || view.getUint32(16, true) !== 16 ||
    view.getUint16(20, true) !== 1 || view.getUint16(22, true) !== 1 ||
    view.getUint32(24, true) !== AUDIO_SAMPLE_RATE || view.getUint32(28, true) !== AUDIO_SAMPLE_RATE * 2 ||
    view.getUint16(32, true) !== 2 || view.getUint16(34, true) !== 16 ||
    view.getUint32(40, true) !== dataBytes || dataBytes % 2 !== 0 ||
    dataBytes === 0 || dataBytes > AUDIO_MAX_DATA_BYTES
  ) {
    throw new AudioValidationError("Audio must be mono 16 kHz, 16-bit PCM, at most 120 seconds, with exact lengths.");
  }
  // Reject only actual digital zero, not quiet speech or a guessed voice threshold.
  let nonzero = false;
  for (let offset = WAV_HEADER_BYTES; offset < bytes.byteLength; offset++) {
    if (bytes[offset] !== 0) { nonzero = true; break; }
  }
  if (!nonzero) throw new AudioValidationError("The recording contains only digital silence.");
  const frames = dataBytes / 2;
  return { frames, durationSeconds: frames / AUDIO_SAMPLE_RATE, sampleRate: AUDIO_SAMPLE_RATE, channels: 1, dataBytes };
}

export function encodeCanonicalWav(samples: Float32Array): Uint8Array<ArrayBuffer> {
  if (!samples.length || samples.length > AUDIO_MAX_FRAMES) {
    throw new AudioValidationError("Recording length is outside the supported range.");
  }
  const bytes = new Uint8Array(WAV_HEADER_BYTES + samples.length * 2);
  const view = new DataView(bytes.buffer);
  function text(offset: number, value: string) {
    for (let index = 0; index < value.length; index++) view.setUint8(offset + index, value.charCodeAt(index));
  }
  text(0, "RIFF"); view.setUint32(4, bytes.length - 8, true); text(8, "WAVE");
  text(12, "fmt "); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, 1, true); view.setUint32(24, AUDIO_SAMPLE_RATE, true);
  view.setUint32(28, AUDIO_SAMPLE_RATE * 2, true); view.setUint16(32, 2, true);
  view.setUint16(34, 16, true); text(36, "data"); view.setUint32(40, samples.length * 2, true);
  for (let index = 0; index < samples.length; index++) {
    if (!Number.isFinite(samples[index])) throw new AudioValidationError("Recording contains invalid samples.");
    const sample = Math.max(-1, Math.min(1, samples[index]));
    view.setInt16(WAV_HEADER_BYTES + index * 2, Math.round(sample * (sample < 0 ? 32768 : 32767)), true);
  }
  validateCanonicalWav(bytes);
  return bytes;
}
