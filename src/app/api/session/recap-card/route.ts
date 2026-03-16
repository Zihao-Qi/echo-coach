import { NextResponse } from "next/server";
import { GenerateRecapCardRequest } from "../../../../types/coach";
import { getOrCreateMomentumCard } from "../../../../lib/server/momentum-card-cache";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as GenerateRecapCardRequest;

    if (
      !body.sessionId ||
      !body.encouragingCaption?.trim() ||
      !body.imagePrompt?.trim()
    ) {
      return NextResponse.json(
        {
          error: "sessionId, encouragingCaption, and imagePrompt are required.",
        },
        { status: 400 }
      );
    }

    const response = await getOrCreateMomentumCard(body);
    return NextResponse.json(response);
  } catch (error: unknown) {
    console.error("Recap card generation error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate recap card." },
      { status: 500 }
    );
  }
}
