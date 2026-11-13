import { practiceStorageMode } from "../config/practice-runtime";
import { MemoryAttemptRepository } from "./memory-attempt-repository";
import { FirestoreAttemptRepository } from "./firestore-attempt-repository";

declare global { var __echoPracticeAttempts: MemoryAttemptRepository | undefined }
export function practiceRepository() {
  if (practiceStorageMode() === "firestore") return new FirestoreAttemptRepository();
  return globalThis.__echoPracticeAttempts ??= new MemoryAttemptRepository();
}
