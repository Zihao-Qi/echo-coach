import { randomUUID } from "node:crypto";
import type { AttemptRepository, AttemptCursor, EvaluationClaim } from "../../application/ports/attempt-repository";
import type { AttemptRecord } from "../../domain/interview/attempt-record";
import type { AnswerAttempt, InterviewQuestion } from "../../domain/interview/practice";

// Explicit demo adapter. Not durable and not shared across server instances.
export class MemoryAttemptRepository implements AttemptRepository {
  private records = new Map<string, Map<string, AttemptRecord>>();
  private budgets = new Map<string, { day: string; count: number }>();
  private recordCount = 0;
  private bucket(ownerId: string) {
    let bucket = this.records.get(ownerId);
    if (!bucket) {
      if (this.records.size >= 256) throw new Error("Demo session capacity reached.");
      bucket = new Map(); this.records.set(ownerId, bucket);
    }
    return bucket;
  }
  async create(ownerId: string, record: AttemptRecord) {
    const bucket = this.bucket(ownerId);
    const existing = bucket.get(record.id);
    if (existing) return structuredClone(existing);
    if (bucket.size >= 100 || this.recordCount >= 1000) throw new Error("Demo history capacity reached. Demo storage is intentionally bounded.");
    bucket.set(record.id, structuredClone(record));
    this.recordCount++;
    return structuredClone(record);
  }
  async get(ownerId: string, id: string) {
    const record = this.bucket(ownerId).get(id);
    return record ? structuredClone(record) : null;
  }
  async initializeSnapshot(ownerId: string, id: string, question: InterviewQuestion, rootQuestionId: string) {
    const record = this.bucket(ownerId).get(id);
    if (!record || record.questionId !== question.id || (record.rootQuestionId && record.rootQuestionId !== rootQuestionId)) throw new Error("Snapshot target mismatch.");
    if (!record.questionSnapshot && record.status !== "completed") {
      record.questionSnapshot = structuredClone(question);
      record.rootQuestionId = rootQuestionId;
    }
    return structuredClone(record);
  }
  async list(ownerId: string, cursor?: AttemptCursor) {
    let records = [...this.bucket(ownerId).values()].sort((a, b) => b.submittedAt.localeCompare(a.submittedAt) || b.id.localeCompare(a.id));
    if (cursor) records = records.filter((record) => record.submittedAt < cursor.submittedAt || (record.submittedAt === cursor.submittedAt && record.id < cursor.id));
    const page = records.slice(0, 50);
    const last = page.at(-1);
    return { records: structuredClone(page), cursor: records.length > 50 && last ? { submittedAt: last.submittedAt, id: last.id } : null };
  }
  async claim(ownerId: string, id: string, dailyLimit: number): Promise<EvaluationClaim> {
    const record = this.bucket(ownerId).get(id);
    if (!record) throw new Error("Attempt not found.");
    if (record.status === "completed") return { kind: "completed" };
    if (record.status === "evaluating" && record.leaseExpiresAt! > new Date().toISOString()) return { kind: "busy" };
    const day = new Date().toISOString().slice(0, 10);
    const budget = this.budgets.get(ownerId);
    const count = budget?.day === day ? budget.count : 0;
    if (count >= dailyLimit) return { kind: "limited" };
    this.budgets.set(ownerId, { day, count: count + 1 });
    const leaseId = randomUUID();
    Object.assign(record, { status: "evaluating", leaseId, leaseExpiresAt: new Date(Date.now() + 120000).toISOString() });
    return { kind: "claimed", leaseId };
  }
  async finish(ownerId: string, id: string, leaseId: string, result: Pick<AnswerAttempt, "evaluation" | "provenance">) {
    const record = this.bucket(ownerId).get(id);
    if (!record || record.leaseId !== leaseId) throw new Error("Evaluation lease expired.");
    Object.assign(record, structuredClone(result), { status: "completed" });
    delete record.leaseId; delete record.leaseExpiresAt;
  }
  async fail(ownerId: string, id: string, leaseId: string) {
    const record = this.bucket(ownerId).get(id);
    if (record?.leaseId !== leaseId) return;
    record.status = "failed"; delete record.leaseId; delete record.leaseExpiresAt;
  }
}
