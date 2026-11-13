import { z } from "zod";
import { requirePracticeOwner } from "../../../../../infrastructure/auth/practice-access";
import { practiceRepository } from "../../../../../infrastructure/persistence/practice-repository";
import { practiceError, practiceJson } from "../../../../../infrastructure/http/practice-http";

export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const ownerId = await requirePracticeOwner(request);
    const { id } = await context.params;
    if (!z.uuid().safeParse(id).success) return practiceJson({ error: "Invalid attempt ID." }, 400);
    const record = await practiceRepository().get(ownerId, id);
    if (!record) return practiceJson({ error: "Saved attempt not found." }, 404);
    const publicRecord = { ...record };
    delete publicRecord.leaseId; delete publicRecord.leaseExpiresAt;
    return practiceJson({ record: publicRecord });
  } catch (error) { return practiceError(error); }
}
