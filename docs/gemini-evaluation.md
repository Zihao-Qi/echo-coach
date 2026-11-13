# Gemini coaching evaluation checkpoint

## What changed

- Four criterion-level observations: content accuracy, reasoning, structure/clarity, and specific evidence. These are qualitative findings, not calibrated hiring scores.
- One runtime schema supplies both Gemini structured-output guidance and validation. Strength/criterion quotations must occur in the unchanged answer. Old attempts without criteria remain readable.
- Question and rubric are supplied explicitly. The policy separates technical correctness from eloquence, accepts new-graduate project experience, rejects embedded answer instructions, and prohibits fabricated achievements or voice judgments from text.
- Provider output is capped at 4096 tokens, requests time out after 45 seconds, and SDK retries are disabled. Incomplete or invalid output is rejected rather than silently shown as coaching.
- Provider input/output/thinking/total token counts are recorded when present. They are not dollar-denominated cost estimates.

## Local-only, login-free testing

User requested login remain disabled during development. An explicit development-only exception is available with all of:

```dotenv
USE_MOCK=false
ALLOW_LOCAL_GEMINI=true
PRACTICE_AUTH_MODE=demo
PRACTICE_STORAGE=memory
AUTH_URL=http://localhost:3000
GEMINI_API_KEY=<private value in .env.local, never chat>
GEMINI_EVALUATION_MODEL=gemini-3.8-flash
```

Bind the dev server to `localhost` (for example `npm run dev -- --hostname localhost --port 3000`). Never expose it through a tunnel or bind it publicly. Matching loopback URL, canonical Origin, and Host are required. Production rejects this exception even if the opt-in variable is present. Hosted real evaluation still requires authentication and Firestore. Legacy real-mode voice/image endpoints are blocked while the local Gemini opt-in is enabled, so following the original demo link cannot silently make uncapped legacy model calls.

The local provider budget is shared across cookies: 10 attempted provider calls per server process, one active call, at least three seconds between starts, including failed calls. Idempotent completed attempts do not call the provider again. This counter is process memory, resets on restart, and is not a billing hard cap. Input is bounded by the existing answer request/character limits; only output has a token limit. Provider quota/billing controls remain necessary.

**Current configuration: user approved a $1 test allowance and selected `gemini-3.8-flash` with LOW thinking. Ten comparison calls completed, estimated at $0.029198 using published token rates. Real local feedback is now enabled; login remains off and storage remains memory-only.** See [smoke review](gemini-smoke-review.md) for findings, fixes, usage, and limitations. No additional automated calls are authorized by that completed ten-call comparison; interactive submissions are initiated by the user.

## Current model research

Official sources retrieved during implementation:
- https://ai.google.dev/gemini-api/docs/models
- https://ai.google.dev/gemini-api/docs/pricing
- https://ai.google.dev/gemini-api/docs/structured-output

The model index lists `gemini-3.8-flash` as a stable intelligent Flash model and `gemini-4-argon` as a flagship reasoning model. These are candidates, not benchmark winners. The reused project's read-only model list includes both candidates. The user chose only `gemini-3.8-flash` with LOW thinking; ten real generations succeeded on that model. No Argon request was made. The current index recommends newer Flash models for new projects rather than blindly retaining the prototype's 2.5 defaults.

The pricing page's standard paid-tier table lists Gemini 3.8 Flash at $0.75 input / $3.75 output per million tokens through December 31, 2026, and $1.50 / $7.50 thereafter; output includes thinking. Listed free-tier allowances are not a guarantee of this project's eligibility or bill. Prices are time-sensitive and must be rechecked before paid runs. No search/grounding, tools, images, or audio are enabled in this evaluation workflow.

## Bounded benchmark

Five synthetic fixtures cover a correct SWE answer, confidently incorrect SWE claims, incomplete ML reasoning, a thin behavioral project story, and an answer with an instruction-injection attempt.

Dry run (no requests):

```sh
npm run benchmark:coaching -- --models=gemini-3.8-flash,gemini-4-argon
```

An intentional `--execute` enables up to 10 calls across the five cases and at most two explicit models. It requires a private API key. A run records latency, structured-validity failures, token usage when available, and feedback under ignored `benchmark-results/`. This command is a separate explicit CLI execution, not part of the local server's shared counter. It is capped at 10 calls per invocation; repeated invocations can incur additional charges.

Results remain **UNREVIEWED** until a person checks the fixture probes: are corrections correct, are important omissions caught, are quotations real, are personal facts preserved, and are next steps actionable? Keyword matching is not used as proof of coaching quality. Five cases are a smoke benchmark, not comprehensive validation.

## Current use and remaining validation

The existing key was reused with explicit permission, remains private, and has completed the approved initial comparison. The local app is enabled for user-initiated practice on Gemini 3.8 Flash / LOW. The server's ten-attempt process guard is separate from the completed benchmark invocation. Neither is a dollar cap. Keep the app bound to localhost; hosted real mode still requires login and durable storage.

Never paste keys into chat. Broader question coverage, human review, and cross-device Firestore validation remain pending. Technical feedback is model-generated, not guaranteed correct.
