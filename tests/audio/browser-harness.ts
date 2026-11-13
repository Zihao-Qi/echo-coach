import { normalizeRecording, MAX_ENCODED_RECORDING_BYTES } from "../../src/features/practice/audio/normalize-recording";

// Test-only page: not imported by any application route and never contacts a model.
let microphoneCalls = 0;
let recording: Blob | null = null;
const originalGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
navigator.mediaDevices.getUserMedia = (constraints) => {
  microphoneCalls++;
  return originalGetUserMedia(constraints);
};

const audioSpike = {
  microphoneCalls: () => microphoneCalls,
  async capture(milliseconds: number) {
    if (milliseconds < 1000 || milliseconds > 120000) throw new Error("Invalid test duration.");
    const stream = await navigator.mediaDevices.getUserMedia({ audio: {
      sampleRate: 48000, channelCount: 1,
      echoCancellation: false, noiseSuppression: false, autoGainControl: false,
    } });
    let timer: ReturnType<typeof setTimeout> | undefined;
    let recorder: MediaRecorder | undefined;
    try {
      const mimeType = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((type) => MediaRecorder.isTypeSupported(type));
      if (!mimeType) throw new Error("No supported capture format.");
      recorder = new MediaRecorder(stream, { mimeType });
      const chunks: Blob[] = [];
      let size = 0;
      const started = performance.now();
      const blob = await new Promise<Blob>((resolve, reject) => {
        recorder!.ondataavailable = (event) => {
          size += event.data.size;
          if (size > MAX_ENCODED_RECORDING_BYTES) { reject(new Error("Encoded capture exceeded limit.")); return; }
          if (event.data.size) chunks.push(event.data);
        };
        recorder!.onerror = () => reject(new Error("Capture failed."));
        recorder!.onstop = () => resolve(new Blob(chunks, { type: recorder!.mimeType }));
        recorder!.start(250);
        timer = setTimeout(() => recorder!.stop(), milliseconds);
      });
      recording = blob;
      const settings = stream.getAudioTracks()[0].getSettings();
      return { encodedBytes: blob.size, mimeType: blob.type, elapsedMs: performance.now() - started, inputSampleRate: settings.sampleRate, inputChannels: settings.channelCount };
    } finally {
      clearTimeout(timer);
      if (recorder && recorder.state !== "inactive") recorder.stop();
      for (const track of stream.getTracks()) track.stop();
      if (stream.getTracks().some((track) => track.readyState !== "ended")) throw new Error("Microphone tracks did not stop.");
    }
  },
  async normalize() {
    if (!recording) throw new Error("Capture first.");
    const normalizationStartedAt = Date.now();
    const started = performance.now();
    const normalized = await normalizeRecording(recording);
    const normalizationMs = performance.now() - started;
    const normalizationEndedAt = Date.now();
    // Probe beginning, middle, and end; a one-second intact island is not enough.
    const view = new DataView(normalized.bytes.buffer);
    const windowFrames = 16000;
    const starts = [4000, Math.floor((normalized.info.frames - windowFrames) / 2), normalized.info.frames - 20000];
    const waveformWindows = starts.map((start) => {
      let crossings = 0; let squareSum = 0;
      for (let index = start; index < start + windowFrames; index++) {
        const sample = view.getInt16(44 + index * 2, true);
        squareSum += (sample / 32768) ** 2;
        if (index > start && view.getInt16(44 + (index - 1) * 2, true) <= 0 && sample > 0) crossings++;
      }
      const result = { startFrame: start, frequencyHz: crossings, rms: Math.sqrt(squareSum / windowFrames) };
      if (Math.abs(result.frequencyHz - 440) >= 5 || result.rms < 0.02) throw new Error("Waveform was damaged during conversion.");
      return result;
    });
    const response = await fetch("/validate", { method: "POST", headers: { "Content-Type": "audio/wav" }, body: normalized.bytes });
    if (!response.ok) throw new Error("Server rejected normalized WAV.");
    const server = await response.json();
    if (server.frames !== normalized.info.frames) throw new Error("Server/browser frame counts differ.");
    return { normalizationMs, normalizationStartedAt, normalizationEndedAt, waveformWindows,
      ...normalized.info, decodedChannels: normalized.decodedChannels,
      decodedFrames: normalized.decodedFrames, clippedPaddingFrames: normalized.clippedPaddingFrames,
      outputBytes: normalized.bytes.length, knownBufferBytes: normalized.knownBufferBytes,
      observedFrequencyHz: waveformWindows[0].frequencyHz, serverValidated: true };
  },
  async downmixFixture() {
    // Asymmetric stereo PCM: selecting a single channel instead of averaging fails.
    const bytes = new Uint8Array(44 + 16000 * 4);
    const view = new DataView(bytes.buffer);
    const text = (offset: number, value: string) => [...value].forEach((char, i) => view.setUint8(offset + i, char.charCodeAt(0)));
    text(0, "RIFF"); view.setUint32(4, bytes.length - 8, true); text(8, "WAVEfmt ");
    view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 2, true);
    view.setUint32(24, 16000, true); view.setUint32(28, 64000, true);
    view.setUint16(32, 4, true); view.setUint16(34, 16, true); text(36, "data"); view.setUint32(40, 64000, true);
    const left = [16384, 8192, -16384, -8192];
    const right = [-8192, 0, 8192, 0];
    const expected = [4096, 4096, -4096, -4096];
    for (let index = 0; index < 16000; index++) {
      view.setInt16(44 + index * 4, left[index % 4], true);
      view.setInt16(46 + index * 4, right[index % 4], true);
    }
    const normalized = await normalizeRecording(new Blob([bytes], { type: "audio/wav" }));
    const output = new DataView(normalized.bytes.buffer);
    for (let index = 0; index < 16000; index++) {
      if (Math.abs(output.getInt16(44 + index * 2, true) - expected[index % 4]) > 1) throw new Error("Incorrect stereo downmix.");
    }
  },
  async invalidInputs() {
    for (const blob of [new Blob(), new Blob([new Uint8Array(MAX_ENCODED_RECORDING_BYTES + 1)]), new Blob(["not audio"])]) {
      let rejected = false;
      try { await normalizeRecording(blob); } catch { rejected = true; }
      if (!rejected) throw new Error("Invalid recording was accepted.");
    }
  },
  discard() { recording = null; },
};

declare global { interface Window { audioSpike: typeof audioSpike } }
window.audioSpike = audioSpike;
