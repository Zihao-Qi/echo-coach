import { randomUUID } from "node:crypto";
import type { AttemptRepository, AttemptCursor, EvaluationClaim } from "../../application/ports/attempt-repository";
import type { AttemptRecord } from "../../domain/interview/attempt-record";
import type { AnswerAttempt, InterviewQuestion } from "../../domain/interview/practice";

export const PUBLIC_DEMO_IDLE_MS = 30 * 60_000;
export const MEMORY_EVALUATION_LEASE_MS = 120_000;

export class DemoCapacityError extends Error {
  constructor(readonly scope: "visitor" | "shared") {
    super(scope === "visitor" ? "This demo session reached its answer limit. Your draft is still here." :
      "The demo is full right now. Your draft is still here; try again later.");
  }
}

type Bucket = {
  records: Map<string, AttemptRecord>;
  lastActivity: number;
  budget?: { day: string; count: number };
};

// Explicit demo adapter. Not durable and not shared across server instances.
export class MemoryAttemptRepository implements AttemptRepository {
  private readonly sessions = new Map<string, Bucket>();
  private recordCount = 0;
  constructor(private readonly expireIdle = false, private readonly now = Date.now) {}

  private sweep(now: number) {
    if (!this.expireIdle) return;
    for (const [owner, bucket] of this.sessions) {
      if (bucket.lastActivity > now - PUBLIC_DEMO_IDLE_MS) continue;
      if ([...bucket.records.values()].some((record) => record.status === "evaluating" && Date.parse(record.leaseExpiresAt!) > now)) continue;
      this.recordCount -= bucket.records.size;
      this.sessions.delete(owner);
    }
  }

  private open(ownerId: string, now: number) {
    if (this.sessions.size >= 256) {
      if (this.expireIdle) throw new DemoCapacityError("shared");
      throw new Error("Demo session capacity reached.");
    }
    const bucket: Bucket = { records: new Map(), lastActivity: now };
    this.sessions.set(ownerId, bucket);
    return bucket;
  }

  private existing(ownerId: string, now = this.now()) {
    this.sweep(now);
    return this.sessions.get(ownerId) ?? (this.expireIdle ? undefined : this.open(ownerId, now));
  }

  async create(ownerId: string, record: AttemptRecord) {
    const now = this.now();
    const bucket = this.existing(ownerId, now);
    const existing = bucket?.records.get(record.id);
    if (existing) return structuredClone(existing);
    if ((bucket?.records.size ?? 0) >= 100 || this.recordCount >= 1000) {
      if (this.expireIdle) throw new DemoCapacityError((bucket?.records.size ?? 0) >= 100 ? "visitor" : "shared");
      throw new Error("Demo history capacity reached. Demo storage is intentionally bounded.");
    }
    const saved = structuredClone(record);
    const target = bucket ?? this.open(ownerId, now);
    target.records.set(record.id, saved);
    target.lastActivity = now;
    this.recordCount++;
    return structuredClone(saved);
  }
  async get(ownerId: string, id: string) {
    const record = this.existing(ownerId)?.records.get(id);
    return record ? structuredClone(record) : null;
  }
  async initializeSnapshot(ownerId: string, id: string, question: InterviewQuestion, root: string) {
    const record = this.existing(ownerId)?.records.get(id);
    if (!record || record.questionId !== question.id || (record.rootQuestionId && record.rootQuestionId !== root)) throw new Error("Snapshot target mismatch.");
    if (!record.questionSnapshot && record.status !== "completed") {
      record.questionSnapshot = structuredClone(question);
      record.rootQuestionId = root;
    }
    return structuredClone(record);
  }
  async list(ownerId: string, cursor?: AttemptCursor) {
    const bucket = this.existing(ownerId);
    let records = [...(bucket?.records.values() ?? [])].sort((a, b) => b.submittedAt.localeCompare(a.submittedAt) || b.id.localeCompare(a.id));
    if (cursor) records = records.filter((record) => record.submittedAt < cursor.submittedAt || (record.submittedAt === cursor.submittedAt && record.id < cursor.id));
    const page = records.slice(0, 50);
    return { records: structuredClone(page), cursor: records.length > 50 && page.length ? { submittedAt: page.at(-1)!.submittedAt, id: page.at(-1)!.id } : null };
  }
  async claim(ownerId: string, id: string, dailyLimit: number): Promise<EvaluationClaim> {
    const now = this.now();
    const bucket = this.existing(ownerId, now);
    const record = bucket?.records.get(id);
    if (!bucket || !record) throw new Error("Attempt not found.");
    if (record.status === "completed") return { kind: "completed" };
    if (record.status === "evaluating" && Date.parse(record.leaseExpiresAt!) > now) return { kind: "busy" };
    const day = new Date(now).toISOString().slice(0, 10);
    const count = bucket.budget?.day === day ? bucket.budget.count : 0;
    if (count >= dailyLimit) return { kind: "limited" };
    bucket.budget = { day, count: count + 1 };
    bucket.lastActivity = now;
    const leaseId = randomUUID();
    Object.assign(record, { status: "evaluating", leaseId, leaseExpiresAt: new Date(now + MEMORY_EVALUATION_LEASE_MS).toISOString() });
    return { kind: "claimed", leaseId };
  }
  async finish(ownerId: string, id: string, leaseId: string, result: Pick<AnswerAttempt, "evaluation" | "provenance">) {
    const record = this.existing(ownerId)?.records.get(id);
    if (!record || record.leaseId !== leaseId) throw new Error("Evaluation lease expired.");
    Object.assign(record, structuredClone(result), { status: "completed" });
    delete record.leaseId; delete record.leaseExpiresAt;
  }
  async fail(ownerId: string, id: string, leaseId: string) {
    const record = this.existing(ownerId)?.records.get(id);
    if (record?.leaseId !== leaseId) return;
    record.status = "failed"; delete record.leaseId; delete record.leaseExpiresAt;
  }
}
