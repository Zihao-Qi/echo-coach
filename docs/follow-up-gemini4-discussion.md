# Gemini 4 follow-up design discussion

Model: gemini-4-argon. Thinking: LOW. This is external model advice, not an accepted specification or verified implementation. One user-requested design call; no personal answers or credentials supplied. Finish reason: STOP.

### Core Architecture & Contracts

#### 1. Follow-up Proposal (Embedded in Evaluation Output)
Generated optionally within the single Gemini 3.8 Flash LOW call for root attempts only. 
*   **Contract:** `FollowUpProposal { prompt: string (max 300 chars), focusDimension: string, rubricCriteria: string[] (1-3 items, max 150 chars each), rationale: string (max 200 chars) }`.
*   **Failure Recovery (Partial Validation):** Treat `followUpProposal` as an untrusted, nullable sub-schema. Use a non-throwing custom parser (e.g., Zod `.safeParse` on the sub-node). If the proposal exceeds bounds, fails validation, or is hallucinated on a non-root attempt, strip it (`proposal = null`), log a telemetry warning, and persist the core evaluation so the user never loses feedback or wastes quota.

#### 2. Attempt Identity, Lineage, and Immutable Snapshot
Instead of polymorphic question repositories, embed an immutable `QuestionSnapshot` inside every `Attempt` record.
*   **Contract:** 
    *   `rootQuestionId`: ID of the curated question (indexed for grouping).
    *   `attemptKind`: `'ROOT' | 'FOLLOW_UP'`.
    *   `retryOfAttemptId`: Nullable ID of a prior attempt of the *same* kind and question snapshot (for before/after diffs).
    *   `parentAttemptId`: Nullable ID of the root attempt that spawned this follow-up.
    *   `questionSnapshot`: `{ prompt: string, rubricCriteria: string[], sourceType: 'CURATED' | 'GENERATED' }`.
    *   `idempotencyKey`: Client-generated UUID per draft submission, scoped to `(ownerId, idempotencyKey)` during the lease/quota transaction to prevent double-billing on network retries.

#### 3. Server-Owned Resolution
Clients never submit prompts or rubrics. A submission payload contains `{ targetMode: 'ROOT' | 'FOLLOW_UP', referenceAttemptId?: string, answerText: string, idempotencyKey: string }`.
*   If `ROOT`: Server loads curated question; if `referenceAttemptId` is present, validates it is a `ROOT` attempt for the same `ownerId` and `rootQuestionId`, setting `retryOfAttemptId`.
*   If `FOLLOW_UP`: Server loads `referenceAttemptId` (the parent), verifies `ownerId`, verifies `parent.attemptKind === 'ROOT'`, extracts `parent.evaluation.followUpProposal`, and constructs the new attempt's `questionSnapshot` server-side. The evaluation prompt sent to Gemini suppresses further follow-up generation.

#### 4. UI Transitions & Drafts
Local drafts must be keyed by `(rootQuestionId, 'ROOT')` vs `(parentAttemptId, 'FOLLOW_UP')` so switching between "Retry Original" and "Answer Follow-up" preserves in-progress typing. Historical views reconstruct the tree under `rootQuestionId`, visually distinguishing horizontal retries from vertical follow-up branches.

---

### Design Debate: Storage Strategy

#### Option A: Embed Proposal in Source Evaluation & Derive Snapshot on Submission
The generated follow-up lives only inside `Attempt.evaluation.followUpProposal`. When answered, the server copies the prompt/rubric into the child attempt's `questionSnapshot`.
*   **Pros:** Zero new Firestore collections or demo-memory stores; single-document atomic write after the LLM call; natural lifecycle tying (no orphaned un-answered questions); trivial owner-access enforcement via existing attempt queries.
*   **Cons:** Follow-up questions do not have standalone global IDs until answered (addressed by referencing `(parentAttemptId, 'FOLLOW_UP')`).

#### Option B: Separate Generated-Question Repository
Persist a new `GeneratedQuestion` entity during evaluation creation, linking it by ID.
*   **Pros:** Uniform foreign-key reference (`questionId`) across all attempts.
*   **Cons:** Requires cross-collection transactions or multi-step writes during evaluation; bloats storage with un-attempted follow-ups (~70%+ may be ignored by users); requires duplicating owner-scoped security rules and memory-repo methods.

#### Recommendation: **Option A**
Given a modular monolith, constrained budget, and max depth of 1, **Option A** is strictly superior. Persisting an immutable `questionSnapshot` on the child attempt upon submission satisfies historical reopening and protects against curated question edits without introducing repository sprawl.

---

### Trade-offs & Uncertainties
*   **Trade-off (Denormalization vs. Normalization):** Option A duplicates the prompt/rubric into the child attempt's snapshot (~500 bytes). This trades negligible storage overhead for complete read-isolation and historical immutability.
*   **Trade-off (Single-Call Latency/Tokens vs. Orchestration):** Generating the follow-up in the initial evaluation call adds ~100–150 output tokens to every root evaluation, even when the user chooses not to answer it. However, this avoids a second network round-trip, double prompt-prefix billing, and complex async UI states.
*   **Uncertainty (Model Compliance under "LOW" Thinking):** Gemini 3.8 Flash LOW may occasionally produce generic follow-ups or fail strict length bounds when simultaneously scoring complex rubrics. Strict post-processing truncation/rejection is mandatory.

---

### Key Invariants
1.  **Zero Client Trust:** Prompt text and evaluation rubrics are resolved exclusively on the server from curated storage or verified parent attempt records.
2.  **Depth Boundary:** An attempt with `attemptKind === 'FOLLOW_UP'` can never be used as a `parentAttemptId`, nor can its evaluation persist a `followUpProposal`.
3.  **Lineage Orthogonality:** `retryOfAttemptId` (baseline comparison) and `parentAttemptId` (follow-up origin) are mutually exclusive on the initial follow-up attempt.
4.  **Tenant & Root Isolation:** `ownerId` and `rootQuestionId` must match across parent, child, and retry links.
5.  **Core Evaluation Survivability:** Malformed model output in the follow-up sub-schema must degrade gracefully to `followUpProposal: null` without failing the evaluation transaction.

### Non-Goals
*   Multi-turn conversational chains (depth > 1) or interactive chat agents.
*   Retrying a follow-up *and* generating a before/after diff against the root attempt (diffs only apply to same-snapshot retries).
*   Cross-user sharing or promotion of generated follow-ups into the global curated question bank.

---

### Six Critical Regression Tests
1.  **Tampered Rubric/Prompt Rejection:** Client submits a follow-up attempt payload containing modified rubric or prompt fields; assert the server ignores/rejects client fields and evaluates strictly against the parent attempt's stored `followUpProposal`.
2.  **Cross-Owner & Cross-Question Lineage Violation:** User A attempts to submit a follow-up referencing User B's `parentAttemptId`, or passes a `retryOfAttemptId` belonging to a different question snapshot; assert `403/400` rejection prior to acquiring a quota lease.
3.  **Depth > 1 Prevention:** Submit a follow-up attempt referencing a `parentAttemptId` that is itself a `FOLLOW_UP` (or mock Gemini returning a `followUpProposal` on a follow-up evaluation); assert server rejects the submission and strips any nested proposal.
4.  **Graceful Degradation on Malformed Proposal:** Mock Gemini returning a valid core evaluation JSON but an oversized or schema-invalid `followUpProposal`; assert the attempt saves successfully with `followUpProposal: null` and quota is consumed normally.
5.  **Retry vs. Follow-up Semantic Separation:** Create Root Attempt 1, then submit Follow-up Attempt 2 referencing Attempt 1; assert Attempt 2 has `parentAttemptId = Attempt 1`, `retryOfAttemptId = null`, and does not trigger the "before/after retry comparison" logic against Attempt 1's score.
6.  **Legacy Record & Idempotency Compatibility:** Load a historical pre-feature attempt lacking `attemptKind` and `followUpProposal` (assert defaults to `'ROOT'` and `null` without crashing UI/server), and replay an identical follow-up submission with the same `idempotencyKey` (assert single Gemini call and single persisted attempt).
