# Echo Coach Architecture

## Submission Diagram

```mermaid
flowchart LR
    U["Browser UI<br/>Mic, session controls, recap"] --> CR["Cloud Run Backend<br/>Next.js app + API routes"]
    CR --> STT["Chirp 3<br/>Speech transcription"]
    CR --> RW["Gemini 2.5 Flash<br/>Rewrite + coaching"]
    CR --> TTS["Gemini TTS (Flash/Pro)<br/>Spoken playback"]
    CR --> IMG["Imagen 4<br/>Momentum Card image"]
    CR --> FS["Firestore<br/>Session history + recap persistence"]
```

## Notes

- `Browser UI` captures microphone input and renders the coaching and recap experience.
- `Cloud Run Backend` hosts the Next.js app and orchestrates the Google model stack.
- `Chirp 3` handles speech transcription.
- `Gemini 2.5 Flash` rewrites the answer and returns coaching output.
- `Gemini TTS` handles spoken playback with model fallback between Flash and Pro.
- `Imagen 4` generates the Momentum Card recap image.
- `Firestore` stores persisted session history and recap data.
