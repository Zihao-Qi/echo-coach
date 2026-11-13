import {
  AUDIO_MAX_FRAMES, AUDIO_SAMPLE_RATE, AudioValidationError,
  encodeCanonicalWav, validateCanonicalWav,
} from "../../../domain/audio/canonical-wav";

export const MAX_ENCODED_RECORDING_BYTES = 10 * 1024 * 1024;
// MediaRecorder's final codec packet can extend slightly beyond the stop deadline.
// Capture must independently stop at 120 seconds; this is not an arbitrary-file decoder.
export const MAX_CODEC_PADDING_FRAMES = AUDIO_SAMPLE_RATE / 4;

export async function normalizeRecording(recording: Blob) {
  if (!recording.size || recording.size > MAX_ENCODED_RECORDING_BYTES) {
    throw new AudioValidationError("The captured recording is empty or too large to decode.");
  }
  if (typeof OfflineAudioContext === "undefined") {
    throw new AudioValidationError("Audio conversion is unavailable. Use a typed answer instead.");
  }
  // decodeAudioData resamples to its context rate. Offline context opens no microphone
  // or playback device, and leaves no running real-time AudioContext to close.
  const decoder = new OfflineAudioContext(1, 1, AUDIO_SAMPLE_RATE);
  const decoded = await decoder.decodeAudioData(await recording.arrayBuffer());
  if (decoded.numberOfChannels < 1 || decoded.numberOfChannels > 2 ||
      decoded.length > AUDIO_MAX_FRAMES + MAX_CODEC_PADDING_FRAMES) {
    throw new AudioValidationError("The captured recording exceeds the supported channels or duration.");
  }
  const frames = Math.min(decoded.length, AUDIO_MAX_FRAMES);
  const mono = new Float32Array(frames);
  for (let channel = 0; channel < decoded.numberOfChannels; channel++) {
    const input = decoded.getChannelData(channel);
    for (let index = 0; index < frames; index++) mono[index] += input[index] / decoded.numberOfChannels;
  }
  const bytes = encodeCanonicalWav(mono);
  return {
    bytes,
    info: validateCanonicalWav(bytes),
    decodedChannels: decoded.numberOfChannels,
    decodedFrames: decoded.length,
    clippedPaddingFrames: decoded.length - frames,
    // ArrayBuffer lower bound only, NOT a native/process peak-memory measurement.
    knownBufferBytes: recording.size + decoded.length * decoded.numberOfChannels * 4 + mono.byteLength + bytes.byteLength,
  };
}
