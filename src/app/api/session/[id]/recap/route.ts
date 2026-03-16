import { NextResponse } from "next/server";
import {
  loadCoachingTurnRecords,
  loadRecapRecord,
  persistRecapRecord,
} from "../../../../../lib/server/session-store";
import { Recap, SessionRecapPayload } from "../../../../../types/coach";

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    if (!id) {
      return NextResponse.json({ error: "session id is required" }, { status: 400 });
    }

    const recap = await loadRecapRecord(id);
    if (!recap) {
      return NextResponse.json({ error: "recap not found" }, { status: 404 });
    }

    const coachingHistory = await loadCoachingTurnRecords(id);
    const payload: SessionRecapPayload = {
      recap,
      coachingHistory,
    };

    return NextResponse.json(payload);
  } catch (error: unknown) {
    console.error("Load recap error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load recap." },
      { status: 500 }
    );
  }
}

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const recap = (await req.json()) as Recap;

    if (!id || !recap?.sessionId) {
      return NextResponse.json(
        { error: "session id and recap payload are required" },
        { status: 400 }
      );
    }

    if (recap.sessionId !== id) {
      return NextResponse.json(
        { error: "session id does not match route id" },
        { status: 400 }
      );
    }

    await persistRecapRecord(recap);
    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    console.error("Persist recap error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to persist recap." },
      { status: 500 }
    );
  }
}
