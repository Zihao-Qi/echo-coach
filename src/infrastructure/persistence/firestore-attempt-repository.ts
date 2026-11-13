import { randomUUID } from "node:crypto";
import { FieldPath, FieldValue } from "@google-cloud/firestore";
import type { AttemptRepository, AttemptCursor, EvaluationClaim } from "../../application/ports/attempt-repository";
import type { AttemptRecord } from "../../domain/interview/attempt-record";
import type { AnswerAttempt, InterviewQuestion } from "../../domain/interview/practice";
import { firestoreClient } from "./firestore-client";

export class FirestoreAttemptRepository implements AttemptRepository {
  private get db() { return firestoreClient(); }
  private attempts(ownerId: string) { return this.db.collection("practiceUsers").doc(encodeURIComponent(ownerId)).collection("attempts"); }
  async create(ownerId: string, record: AttemptRecord) {
    const ref = this.attempts(ownerId).doc(record.id);
    return this.db.runTransaction(async (tx) => {
      const snapshot = await tx.get(ref);
      if (snapshot.exists) return snapshot.data() as AttemptRecord;
      const data = Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined));
      tx.create(ref, data);
      return record;
    });
  }
  async get(ownerId: string, id: string) {
    const snapshot = await this.attempts(ownerId).doc(id).get();
    return snapshot.exists ? snapshot.data() as AttemptRecord : null;
  }
  async initializeSnapshot(ownerId: string, id: string, question: InterviewQuestion, rootQuestionId: string) {
    const ref = this.attempts(ownerId).doc(id);
    return this.db.runTransaction(async (tx) => {
      const snapshot = await tx.get(ref);
      const record = snapshot.data() as AttemptRecord | undefined;
      if (!record || record.questionId !== question.id || (record.rootQuestionId && record.rootQuestionId !== rootQuestionId)) throw new Error("Snapshot target mismatch.");
      if (record.questionSnapshot || record.status === "completed") return record;
      tx.update(ref, { questionSnapshot: question, rootQuestionId });
      return { ...record, questionSnapshot: question, rootQuestionId };
    });
  }
  async list(ownerId: string, cursor?: AttemptCursor) {
    let query = this.attempts(ownerId).orderBy("submittedAt", "desc").orderBy(FieldPath.documentId(), "desc");
    if (cursor) query = query.startAfter(cursor.submittedAt, cursor.id);
    const snapshot = await query.limit(51).get();
    const records = snapshot.docs.slice(0, 50).map((doc) => doc.data() as AttemptRecord);
    const last = records.at(-1);
    return { records, cursor: snapshot.size > 50 && last ? { submittedAt: last.submittedAt, id: last.id } : null };
  }
  async claim(ownerId: string, id: string, dailyLimit: number): Promise<EvaluationClaim> {
    const ref = this.attempts(ownerId).doc(id);
    const day = new Date().toISOString().slice(0, 10);
    const budgetRef = this.db.collection("practiceUsers").doc(encodeURIComponent(ownerId)).collection("budgets").doc(day);
    return this.db.runTransaction(async (tx) => {
      const [snapshot, budget] = await Promise.all([tx.get(ref), tx.get(budgetRef)]);
      if (!snapshot.exists) throw new Error("Attempt not found.");
      const record = snapshot.data() as AttemptRecord;
      if (record.status === "completed") return { kind: "completed" };
      if (record.status === "evaluating" && record.leaseExpiresAt! > new Date().toISOString()) return { kind: "busy" };
      const count = Number(budget.data()?.count || 0);
      if (count >= dailyLimit) return { kind: "limited" };
      const leaseId = randomUUID();
      tx.set(budgetRef, { count: count + 1 });
      tx.update(ref, { status: "evaluating", leaseId, leaseExpiresAt: new Date(Date.now() + 120000).toISOString() });
      return { kind: "claimed", leaseId };
    });
  }
  async finish(ownerId: string, id: string, leaseId: string, result: Pick<AnswerAttempt, "evaluation" | "provenance">) {
    const ref = this.attempts(ownerId).doc(id);
    await this.db.runTransaction(async (tx) => {
      const snapshot = await tx.get(ref);
      if (snapshot.data()?.leaseId !== leaseId) throw new Error("Evaluation lease expired.");
      tx.update(ref, { ...result, status: "completed", leaseId: FieldValue.delete(), leaseExpiresAt: FieldValue.delete() });
    });
  }
  async fail(ownerId: string, id: string, leaseId: string) {
    const ref = this.attempts(ownerId).doc(id);
    await this.db.runTransaction(async (tx) => {
      const snapshot = await tx.get(ref);
      if (snapshot.data()?.leaseId !== leaseId) return;
      tx.update(ref, { status: "failed", leaseId: FieldValue.delete(), leaseExpiresAt: FieldValue.delete() });
    });
  }
}
