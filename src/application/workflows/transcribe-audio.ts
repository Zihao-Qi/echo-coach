import { createHash } from "node:crypto";
import { z } from "zod";
import type { AudioTranscriber, AudioTranscription } from "../ports/audio-transcriber";
import { validateCanonicalWav } from "../../domain/audio/canonical-wav";

export const transcriptionRequestSchema = z.object({ id: z.uuid(), intent: z.enum(["start", "recover"]) }).strict();
const tokens = z.number().int().nonnegative().optional();
const resultSchema = z.object({ text: z.string().max(10000), mode: z.enum(["demo", "gemini"]), model: z.string().min(1).max(200),
  usage: z.object({ inputTokens: tokens, outputTokens: tokens, totalTokens: tokens }).strict().optional(),
}).strict();
export class TranscriptionError extends Error {
  constructor(message: string, readonly status: number, readonly code: string) { super(message); }
}
export type TranscriptionReceipt = AudioTranscription & { id: string; expiresAt: string };
type Entry = {
  hash: string; expiresAt: number; state: "running" | "completed" | "ended";
  receipt?: TranscriptionReceipt; timer: ReturnType<typeof setTimeout>;
};

// One bounded local replay cache; NO audio, disk store, leases, or hosted guarantees.
// Demo receipts are capacity-limited but do not consume the real evaluation budget.
export class TranscriptionReplayCache {
  private readonly entries = new Map<string, Entry>();
  private readonly now: () => number;
  private readonly ttlMs: number;
  private readonly deadlineMs: number;
  private readonly capacity: number;
  constructor(options: { now?: () => number; ttlMs?: number; deadlineMs?: number; capacity?: number } = {}) {
    this.now = options.now || Date.now;
    this.ttlMs = options.ttlMs ?? 10 * 60 * 1000;
    this.deadlineMs = options.deadlineMs ?? 45000;
    this.capacity = options.capacity ?? 10;
  }
  private remove(key: string) {
    const entry = this.entries.get(key);
    if (entry) clearTimeout(entry.timer);
    this.entries.delete(key);
  }
  private prune() {
    for (const [key, entry] of this.entries) if (entry.expiresAt <= this.now()) this.remove(key);
  }
  async run(owner: string, input: z.infer<typeof transcriptionRequestSchema>, audio: Uint8Array, transcriber: AudioTranscriber): Promise<TranscriptionReceipt> {
    validateCanonicalWav(audio);
    this.prune();
    const key = JSON.stringify([owner, input.id]);
    const hash = createHash("sha256").update(audio).digest("hex");
    const existing = this.entries.get(key);
    if (existing) {
      if (existing.hash !== hash) throw new TranscriptionError("This transcription ID was used for different audio.", 409, "conflict");
      if (existing.state === "completed") return structuredClone(existing.receipt!);
      if (existing.state === "running") throw new TranscriptionError("Transcription is still running. Recover explicitly after waiting.", 409, "running");
      throw new TranscriptionError("This attempt ended without a recoverable result. Start a new attempt explicitly.", 502, "ended");
    }
    if (input.intent === "recover") throw new TranscriptionError("The transcription receipt expired or is unavailable after restart. A new attempt must be started explicitly.", 410, "expired");
    if (this.entries.size >= this.capacity) throw new TranscriptionError("The demo transcription recovery cache is full. Keep your draft and wait for receipts to expire.", 429, "limited");
    const expiresAt = this.now() + this.ttlMs;
    const entry: Entry = { hash, expiresAt, state: "running", timer: setTimeout(() => { if (this.entries.get(key) === entry) this.remove(key); }, this.ttlMs) };
    entry.timer.unref();
    this.entries.set(key, entry); // Synchronous claim before any adapter work.
    const controller = new AbortController();
    let deadline: ReturnType<typeof setTimeout> | undefined;
    try {
      const result = await Promise.race([
        Promise.resolve().then(() => transcriber.transcribe(audio, controller.signal)),
        new Promise<never>((_, reject) => { deadline = setTimeout(() => { controller.abort(); reject(new Error("Transcription deadline")); }, this.deadlineMs); }),
      ]);
      const parsed = resultSchema.parse(result);
      const receipt = { ...parsed, id: input.id, expiresAt: new Date(expiresAt).toISOString() };
      // An expired operation must not restore an evicted receipt.
      if (this.entries.get(key) === entry) { entry.state = "completed"; entry.receipt = structuredClone(receipt); }
      return receipt;
    } catch {
      if (this.entries.get(key) === entry) entry.state = "ended";
      throw new TranscriptionError("Transcription ended without a recoverable result. This ID will not generate again while retained. Start a new attempt explicitly.", 502, "ended");
    } finally { clearTimeout(deadline); }
  }
}

declare global { var __echoTranscriptionReplay: TranscriptionReplayCache | undefined }
export function transcriptionReplayCache() {
  return globalThis.__echoTranscriptionReplay ??= new TranscriptionReplayCache();
}
