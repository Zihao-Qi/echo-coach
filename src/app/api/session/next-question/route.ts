import { NextResponse } from "next/server";
import {
  NextQuestionRequest,
  NextQuestionResponse,
} from "../../../../types/coach";
import {
  ANALYSIS_MODEL,
  createGeminiClient,
  resolveMockMode,
} from "../../../../lib/server/coach-server";
import {
  getInterviewQuestionByIndex,
  MAX_INTERVIEW_QUESTIONS,
} from "../../../../lib/coach-config";

function extractQuestionText(text: string) {
  const direct = text.trim();

  if (direct.startsWith("{")) {
    const payload = JSON.parse(direct) as { questionText?: string };
    return payload.questionText?.trim() || "";
  }

  const start = direct.indexOf("{");
  const end = direct.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    const payload = JSON.parse(direct.slice(start, end + 1)) as {
      questionText?: string;
    };
    return payload.questionText?.trim() || "";
  }

  return direct.replace(/^["']|["']$/g, "").trim();
}

async function generateFollowUpQuestion(
  previousTranscript: string | undefined,
  polishedAnswer: string | undefined,
  nextQuestionIndex: number
) {
  if (!previousTranscript?.trim() || !polishedAnswer?.trim()) {
    return getInterviewQuestionByIndex(nextQuestionIndex);
  }

  const ai = createGeminiClient();
  const response = await ai.models.generateContent({
    model: ANALYSIS_MODEL,
    contents: [
      {
        role: "user",
        parts: [
          {
            text: [
              "You are Echo Coach's interview question planner.",
              "Generate exactly one concise spoken follow-up interview question.",
              "Return a JSON object with one key only: questionText.",
              "The question must be one sentence, natural to say aloud, and less than 20 words.",
              "Do not include explanations, numbering, or coaching advice.",
              `This will be question ${nextQuestionIndex} of ${MAX_INTERVIEW_QUESTIONS}.`,
              `Previous transcript: ${previousTranscript}`,
              `Polished answer: ${polishedAnswer}`,
            ].join(" "),
          },
        ],
      },
    ],
    config: {
      responseMimeType: "application/json",
    },
  });

  return extractQuestionText(response.text || "");
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as NextQuestionRequest;

    if (
      !body.sessionId ||
      !body.questionIndex
    ) {
      return NextResponse.json(
        {
          error: "sessionId and questionIndex are required.",
        },
        { status: 400 }
      );
    }

    const nextQuestionIndex = body.questionIndex + 1;
    if (nextQuestionIndex > MAX_INTERVIEW_QUESTIONS) {
      return NextResponse.json(
        { error: "No follow-up questions remain in this interview." },
        { status: 422 }
      );
    }

    let questionText = "";

    if (resolveMockMode()) {
      questionText = getInterviewQuestionByIndex(nextQuestionIndex);
    } else {
      questionText = await generateFollowUpQuestion(
        body.previousTranscript?.trim(),
        body.polishedAnswer?.trim(),
        nextQuestionIndex
      );
    }

    if (!questionText) {
      return NextResponse.json(
        { error: "Failed to generate the next question." },
        { status: 500 }
      );
    }

    const response: NextQuestionResponse = {
      sessionId: body.sessionId,
      questionText,
      questionIndex: nextQuestionIndex,
      questionLimit: MAX_INTERVIEW_QUESTIONS,
    };

    return NextResponse.json(response);
  } catch (error: unknown) {
    console.error("Next question error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to generate the next interview question.",
      },
      { status: 500 }
    );
  }
}
