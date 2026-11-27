import type { AudioTranscriber, AudioTranscription } from "../../../application/ports/audio-transcriber";
import { DEMO_TRANSCRIPT_TEXT } from "../../../content/questions/demo-transcription";

export class DemoAudioTranscriber implements AudioTranscriber {
  async transcribe(): Promise<AudioTranscription> {
    return {
      mode: "demo", model: "demo-transcription-v1",
      text: DEMO_TRANSCRIPT_TEXT,
    };
  }
}
