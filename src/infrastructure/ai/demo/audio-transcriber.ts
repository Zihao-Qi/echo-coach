import type { AudioTranscriber, AudioTranscription } from "../../../application/ports/audio-transcriber";

export class DemoAudioTranscriber implements AudioTranscriber {
  async transcribe(): Promise<AudioTranscription> {
    return {
      mode: "demo", model: "demo-transcription-v1",
      text: "I worked on a class project where I implemented an API and wrote integration tests. I would explain my own contribution, the decisions I made, and what I learned.",
    };
  }
}
