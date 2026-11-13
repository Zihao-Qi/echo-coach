# Echo Coach reconstruction proposal

Status: architecture/delivery direction approved and implementation underway. Existing project `echo-490312` will be reused. User selected Auth.js + Google OAuth instead of Firebase Authentication; Firestore and Cloud Run remain the storage/hosting targets. See `implementation-status.md` for current evidence and remaining setup.

## Confirmed product direction

- Personal web app, with cross-device access and later presentations.
- New-graduate software engineering and AI/ML interview preparation.
- Behavioral and technical question answering first.
- Preserve the supportive interview-coach idea; redesign the experience.
- Retain Gemini as the initial AI provider; reconsider all individual model choices.
- No existing deployment or saved data must be migrated.
- Future scope: sourced preparation resources, mindset guidance, and richer agent workflows.

## Product experience

### Practice home

Choose SWE, AI/ML, or shared behavioral practice. Select a topic and start a short practice round. Show recent attempts and areas to revisit. Avoid claiming verified question-frequency rankings until supporting resources are available.

### Focused practice workspace

Question → typed or recorded answer → transcript confirmation when applicable → structured feedback → retry or follow-up.

Feedback prioritizes:
1. What was correct or effective, citing the answer.
2. Missing concepts, incorrect claims, or missing behavioral evidence.
3. One or two actionable improvements.
4. An optional improved answer, preserving the candidate's actual experience.

Do not infer spoken confidence or delivery from text alone. Preserve the submitted answer/transcript separately from generated suggestions. Technical evaluation can express uncertainty rather than confidently assert an unsupported correction.

### Review and momentum

Compare attempts on the same question. End a round with a concise learning recap and a supportive Momentum Card. Card text is useful without generated imagery; optional imagery must never block coaching or saving.

### Live mock interview

A subsequent mode with genuine streamed audio, native Gemini Live turn-taking, transcript capture, and post-interview evaluation. It shares questions, attempts, and rubrics with focused practice. Live conversation is an explicit requirement on the roadmap, not a renamed HTTP recording flow.

## Initial content coverage

Shared behavioral: introduction, motivation, project contribution, teamwork, disagreement, setbacks, learning, and ownership. Use coursework, internships, research, open-source contributions, and personal projects as valid new-graduate evidence.

SWE: data structures and complexity explanations, HTTP/networking, databases, testing/debugging, concurrency basics, and small-scale design trade-offs. Defer a code execution sandbox and full coding-interview workspace.

AI/ML: train/validation/test splits, leakage, overfitting, regularization, metrics, class imbalance, baseline/model selection, error analysis, and deployment fundamentals. Support project deep dives. Avoid assuming production experience.

Questions have competency tags, difficulty, expected concepts, misconceptions, and rubric versions. Initial ordering is editorial; source-backed priority can be added later.

## Architecture: modular monolith

Keep one Next.js/TypeScript application and deployment. No microservices, generic plugin engine, or multi-agent framework initially.

```text
src/
  app/                         # pages and thin API handlers
  features/
    practice/                  # workspace, session controller
    review/                    # attempts, recaps
    audio/                     # recording and playback hooks
  domain/
    interview/                 # questions, rubrics, attempts, evaluations
  application/
    workflows/                 # use cases and explicit orchestration
    ports/                     # AI, speech, repositories, knowledge contracts
  infrastructure/
    ai/gemini/                 # reasoning and structured generation
    audio/                     # transcription, speech, later Live transport
    persistence/               # selected durable storage adapter
    auth/                      # identity/session integration
  content/
    questions/                 # curated versioned starter bank
```

Dependency rule: domain does not import React, Next.js, Google SDKs, or database clients. Application uses domain types and ports. Infrastructure implements ports. The web layer composes these capabilities.

### Core records

- Question: ID, track, competency, difficulty, prompt, rubric reference/version.
- Practice session: opaque ID, owner ID, mode, selected track/topics, status, timestamps.
- Answer attempt: immutable ID, session/question IDs, input mode, submitted text, original transcription when applicable, retry relationship, timestamps.
- Evaluation: attempt ID, rubric/model/prompt versions, criterion-level findings, supporting excerpts, gaps, uncertainty, improvement steps, optional suggested answer.
- Recap: session-level learning summary and optional card asset reference.

Progress is derived from evaluated attempts; do not equate model scores with calibrated hiring outcomes. Numeric scoring can be added only with anchored rubrics and quality evaluation.

### Workflows

Start practice, submit attempt, evaluate attempt, retry question, select follow-up, complete session, load review.

Persist accepted attempts before generation. Track evaluation failure explicitly so it can be retried without losing the answer. Persist recap text before optional imagery. Make external generation calls time-bounded; use stable IDs/idempotency to avoid duplicate records.

Follow-up selection uses the actual question, answer, and evaluation rather than the polished answer alone. Future knowledge retrieval is added behind a port with source attribution and trust boundaries, not by scattering resource text into UI prompts.

## AI configuration and evaluation

Use a server-side capability registry rather than fixed model names throughout the application. Separate evaluator, follow-up generation, transcription, speech, Live interviewing, and optional image generation. Capabilities may share a model; they need not be separate agents or calls.

Before picking exact versions, verify current Gemini availability and compare representative correct, partially correct, confidently incorrect, vague, and fabricated-experience-prone answers. Assess correctness, specificity, preservation of facts, uncertainty, latency, and cost. Model upgrades require rerunning these fixtures.

Use runtime-validated structured outputs. Store original input unchanged. Treat answer/resource text as untrusted data, not instructions overriding evaluator policy.

## Hosting and persistence decision

Recommended hosting candidate: Cloud Run, reusing the existing standalone container approach. Native Live can connect browser-to-Gemini with backend-issued short-lived credentials; HTTP workflows remain server-side.

Two reasonable storage choices:
- Firestore: fewer changes to the existing provider ecosystem; suitable for personal sessions and attempts if document updates and owner-scoped access are implemented correctly.
- Managed Postgres: clearer relational constraints and future competency/resource analytics; requires choosing another service or Cloud SQL and managing migrations.

Provisional recommendation: Cloud Run + Firestore for the first personal hosted release, with repositories isolating storage. This avoids introducing a database migration solely for architecture. User approval is required before provisioning or locking this choice. Supabase/Postgres remains a reasonable alternative if relational analytics is the priority.

Authentication, owner-scoped authorization, runtime input validation, payload limits, and model-use rate/budget controls are release requirements. A mock presentation mode should not need cloud AI credentials. Use managed secrets; no permanent Gemini key in browser code.

## Delivery phases

### Phase 1: foundation and redesigned text practice

- Bring repository into the working directory on a reconstruction branch after approval.
- Preserve legacy flow until the replacement is usable; upgrade vulnerable dependencies with checks.
- Establish domain types, schemas, repositories, and workflow tests.
- Build redesigned text practice for behavioral, SWE, and AI/ML questions.
- Add question-aware evaluation and immutable retries.
- Add authenticated durable history and structured recaps before hosted release.
- Momentum Card works with text; generated imagery is optional.

Acceptance: submit an answer, inspect question-aware feedback, retry, compare both attempts, and reopen the saved review from another authenticated browser. Unit/API tests and deterministic browser tests cover this flow and relevant failure cases. Credentialed model checks require explicit setup.

### Phase 2: recorded voice

Event-driven recording finalization, configurable transcription, editable transcript confirmation, optional speech playback, and real-device validation. Reuse Phase 1 submission/evaluation workflows.

### Phase 3: live interviewing

Streamed microphone input, incremental playback, interruption handling, credential renewal/reconnection as required, transcript capture, and post-interview feedback. Confirm provider behavior and device constraints before promising session lengths or latency.

### Phase 4: knowledge and personalization

User-provided resource ingestion with attribution, question prioritization, preparation plans, mindset guidance, and explicit agent/tool workflows where useful. External content must not acquire instruction authority over the application.

## Confirmation needed before application work

1. Approve the modular-monolith direction and text-practice-first delivery order, followed by recorded voice and genuine Live mode?
2. Approve Cloud Run + Firestore as the initial hosting/storage target, or prefer managed Postgres?

No cloud resources will be created, paid APIs invoked, or application source replaced without confirmation.
