# Echo Coach

When you practice for an interview alone, it’s easy to move on after one answer. Echo Coach helps you take a second pass: pick a question, write your answer, revise one detail, and compare the two attempts.

[Try the public demo](https://echo-coach-demo-189032457820.us-central1.run.app) — no account or key needed. Use a fictional answer: the demo shows **sample feedback**, and its recorder returns sample text, not your spoken words.

## How practice works

Choose one of nine behavioral, software engineering, or AI/ML questions. Get a hint if you’re stuck, then use the retry prompt to guide your revision. For an uninterrupted run, try the three-question typed mock interview instead.

## What’s been tested

At release, the [public demo checks](docs/public-demo-update.md#record-2026-11-26) confirmed that both practice modes loaded and all 15 audio clips were served correctly. For the **private preview**, local Chrome tests with a real Gemini key produced feedback, played a suggested answer aloud, and transcribed test audio. Those are functional checks, not a measure of coaching quality. [Hosted microphone and Gemini checks are still pending.](docs/implementation-status.md)

## Run locally

With Node.js 22:

```sh
npm ci
npm run dev
```

Open [localhost:3000](http://localhost:3000). The default setup uses sample feedback and needs no key.

[Release status](docs/implementation-status.md) · [Future ideas](docs/future-ideas.md)
