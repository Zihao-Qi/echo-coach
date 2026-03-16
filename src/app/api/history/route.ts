import { NextResponse } from "next/server";
import { listSessionHistory } from "../../../lib/server/session-store";

export async function GET() {
  try {
    const items = await listSessionHistory();
    return NextResponse.json({ items });
  } catch (error: unknown) {
    console.error("Load history error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load session history." },
      { status: 500 }
    );
  }
}
