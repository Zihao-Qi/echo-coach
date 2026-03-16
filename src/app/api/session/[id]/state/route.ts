import { NextResponse } from "next/server";
import { DEFAULT_LANGUAGE } from "../../../../../lib/server/coach-server";
import { LiveSession } from "../../../../../types/coach";
import { persistSessionRecord } from "../../../../../lib/server/session-store";

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const body = (await req.json()) as {
      session: LiveSession;
      language?: typeof DEFAULT_LANGUAGE;
    };

    if (!id || !body.session) {
      return NextResponse.json(
        { error: "session id and session payload are required" },
        { status: 400 }
      );
    }

    if (body.session.sessionId !== id) {
      return NextResponse.json(
        { error: "session id does not match route id" },
        { status: 400 }
      );
    }

    await persistSessionRecord(body.session, body.language || DEFAULT_LANGUAGE);
    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    console.error("Persist session error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to persist session." },
      { status: 500 }
    );
  }
}
