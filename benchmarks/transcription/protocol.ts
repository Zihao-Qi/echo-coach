import { z } from "zod";
import { validateCanonicalWav } from "../../src/domain/audio/canonical-wav";
import { ENDPOINT, FLASH_INSTRUCTION, GENERATION_CONFIGS, PRICES, REQUESTED_OUTPUT_TOKENS, reservationNanoUsd, type PilotModel } from "./spec";

// Request construction only: this preparation module has no fetch/key/env access.
export function buildInteractionRequest(model: PilotModel, audio: Uint8Array) {
  validateCanonicalWav(audio);
  const generation_config = structuredClone(GENERATION_CONFIGS[model]);
  return { url: ENDPOINT, method: "POST", redirect: "error" as const, deadlineMs: 45000, automaticRetries: 0,
    body: { model, store: false, background: false, stream: false, generation_config,
      ...(model === "gemini-3.8-flash" ? { system_instruction: FLASH_INSTRUCTION } : {}),
      input: [{ type: "audio", mime_type: "audio/wav", data: Buffer.from(audio).toString("base64") }],
    },
  };
}
const count = z.number().int().nonnegative().max(10_000_000);
const usageSchema = z.object({ total_input_tokens: count, total_output_tokens: count,
  total_thought_tokens: count.optional(), total_tokens: count, total_tool_use_tokens: count.optional(),
});
export class PilotContractError extends Error {
  constructor(readonly scope: "batch" | "candidate", readonly code: string) { super(`Transcription pilot contract failure: ${code}`); }
}

export function inspectInteraction(model: PilotModel, value: unknown, frames: number) {
  const envelope = z.object({ model: z.string(), status: z.string(), usage: z.unknown().optional(), steps: z.unknown().optional() }).passthrough().safeParse(value);
  if (!envelope.success || envelope.data.model.replace(/^models\//, "") !== model) throw new PilotContractError("batch", "model-or-envelope");
  const usage = usageSchema.safeParse(envelope.data.usage);
  if (!usage.success) throw new PilotContractError("batch", "missing-or-invalid-usage");
  if (model === "gemini-3.8-flash" && usage.data.total_thought_tokens === undefined) throw new PilotContractError("batch", "missing-thinking-usage");
  const u = { ...usage.data, total_thought_tokens: usage.data.total_thought_tokens ?? 0 };
  if ((u.total_tool_use_tokens || 0) !== 0 || u.total_tokens !== u.total_input_tokens + u.total_output_tokens + u.total_thought_tokens) {
    throw new PilotContractError("batch", "ambiguous-usage-or-tools");
  }
  const generated = u.total_output_tokens + u.total_thought_tokens;
  if (generated > REQUESTED_OUTPUT_TOKENS) throw new PilotContractError("batch", "output-cap-overrun");
  const costNanoUsd = u.total_input_tokens * PRICES[model].inputNanoUsd + generated * PRICES[model].outputNanoUsd;
  if (costNanoUsd > reservationNanoUsd(model, frames)) throw new PilotContractError("batch", "cost-reservation-overrun");
  if (envelope.data.status !== "completed") return { status: "candidate-failed" as const, reason: "not-completed", usage: u, costNanoUsd };
  const steps = z.array(z.object({ type: z.string(), content: z.unknown().optional() }).passthrough()).safeParse(envelope.data.steps);
  if (!steps.success) return { status: "candidate-failed" as const, reason: "invalid-steps", usage: u, costNanoUsd };
  const text: string[] = [];
  for (const step of steps.data) {
    if (step.type === "thought" || step.type === "user_input") continue;
    if (step.type !== "model_output") throw new PilotContractError("batch", "unexpected-step");
    const content = z.array(z.object({ type: z.literal("text"), text: z.string() }).passthrough()).safeParse(step.content);
    if (!content.success) return { status: "candidate-failed" as const, reason: "nontext-output", usage: u, costNanoUsd };
    for (const part of content.data) text.push(part.text);
  }
  if (!text.length && u.total_output_tokens !== 0) return { status: "candidate-failed" as const, reason: "missing-text-block", usage: u, costNanoUsd };
  const transcript = text.join("\n");
  if (transcript.length > 10000) return { status: "candidate-failed" as const, reason: "transcript-too-long", usage: u, costNanoUsd };
  // No raw response/chain of thought is returned or persisted.
  return { status: "completed" as const, text: transcript, usage: {
    total_input_tokens: u.total_input_tokens, total_output_tokens: u.total_output_tokens,
    total_thought_tokens: u.total_thought_tokens, total_tokens: u.total_tokens,
  }, costNanoUsd };
}
