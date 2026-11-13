import { z } from "zod";
import { requirePracticeOwner } from "../../../../infrastructure/auth/practice-access";
import { practiceRepository } from "../../../../infrastructure/persistence/practice-repository";
import { practiceError, practiceJson, RequestError } from "../../../../infrastructure/http/practice-http";

export const runtime = "nodejs";
const cursorSchema = z.object({ submittedAt: z.iso.datetime(), id: z.uuid() });
export async function GET(request: Request) {
  try {
    const ownerId = await requirePracticeOwner(request);
    const rawCursor = new URL(request.url).searchParams.get("cursor");
    let cursor: z.infer<typeof cursorSchema> | undefined;
    if (rawCursor) {
      if (rawCursor.length > 300) throw new RequestError("Invalid history cursor.", 400);
      try { cursor = cursorSchema.parse(JSON.parse(rawCursor)); }
      catch { throw new RequestError("Invalid history cursor.", 400); }
    }
    const page = await practiceRepository().list(ownerId, cursor);
    // Evaluation leases are backend control data, not part of public history.
    return practiceJson({ ...page, records: page.records.map((record) => {
      const publicRecord = { ...record };
      delete publicRecord.leaseId; delete publicRecord.leaseExpiresAt;
      return publicRecord;
    }) });
  } catch (error) { return practiceError(error); }
}
