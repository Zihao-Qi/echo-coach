import { practiceStorageMode } from "../config/practice-runtime";
import { PUBLIC_DEMO_BUILD } from "../config/public-demo";
import { MemoryAttemptRepository } from "./memory-attempt-repository";
import { FirestoreAttemptRepository } from "./firestore-attempt-repository";

declare global { var __echoPracticeAttempts: MemoryAttemptRepository | undefined }
export function practiceRepository() {
  if (practiceStorageMode() === "firestore") return new FirestoreAttemptRepository();
  return globalThis.__echoPracticeAttempts ??= new MemoryAttemptRepository(PUBLIC_DEMO_BUILD);
}
