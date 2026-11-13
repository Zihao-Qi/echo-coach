import { z } from "zod";

export const followUpSchema = z.object({
  prompt: z.string().trim().min(10).max(300),
  rationale: z.string().trim().min(1).max(200),
  focus: z.enum(["correctness", "reasoning", "structure", "evidence"]),
  expectedConcepts: z.array(z.string().trim().min(1).max(150)).min(1).max(3),
}).strict();
export function parseFollowUp(value: unknown) {
  const result = followUpSchema.safeParse(value);
  return result.success ? result.data : null;
}
