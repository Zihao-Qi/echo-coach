import { NextResponse } from "next/server";
import { GoogleAuth } from "google-auth-library";
import {
  AnalyzeAnswerRequest,
  AnalyzeAnswerResponse,
  CoachingTurn,
  MomentumCardSpec,
} from "../../../../types/coach";
import {
  ANALYSIS_MODEL,
  TRANSCRIPTION_MODEL,
  buildMomentumCardSpec,
  createGeminiClient,
  createMockCoachingTurn,
  DEFAULT_LANGUAGE,
  DEFAULT_ENCOURAGEMENT_LINE,
  DEFAULT_ROLE_LABEL,
  DEFAULT_STRENGTH_KEYWORD,
  getSpeechRegion,
  resolveMockMode,
} from "../../../../lib/server/coach-server";
import { prewarmMomentumCard } from "../../../../lib/server/momentum-card-cache";
import { persistCoachingTurnRecord } from "../../../../lib/server/session-store";

async function transcribeWithChirp3(audioBase64: string, projectId: string) {
  const auth = new GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/cloud-platform"],
  });
  const token = await auth.getAccessToken();
  const region = getSpeechRegion();
  const endpoint =
    region === "global" ? "speech.googleapis.com" : `${region}-speech.googleapis.com`;

  if (!token) {
    throw new Error("Google Cloud access token is unavailable for Speech-to-Text.");
  }

  const response = await fetch(
    `https://${endpoint}/v2/projects/${projectId}/locations/${region}/recognizers/_:recognize`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "x-goog-user-project": projectId,
      },
      body: JSON.stringify({
        config: {
          autoDecodingConfig: {},
          model: TRANSCRIPTION_MODEL,
          languageCodes: [DEFAULT_LANGUAGE],
        },
        content: audioBase64,
      }),
    }
  );

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Speech-to-Text request failed with ${response.status}: ${message}`);
  }

  const payload = (await response.json()) as {
    results?: Array<{
      alternatives?: Array<{ transcript?: string }>;
    }>;
  };

  return (
    payload.results
      ?.flatMap((result) =>
        result.alternatives?.map((alternative) => alternative.transcript?.trim() || "") || []
      )
      .filter(Boolean)
      .join(" ")
      .trim() || ""
  );
}

async function transcribeWithGeminiFallback(audioBase64: string, mimeType: string) {
  const ai = createGeminiClient();
  const response = await ai.models.generateContent({
    model: ANALYSIS_MODEL,
    contents: [
      {
        role: "user",
        parts: [
          {
            text: "Transcribe this spoken English interview answer verbatim. Return only the transcript text.",
          },
          {
            inlineData: {
              data: audioBase64,
              mimeType,
            },
          },
        ],
      },
    ],
  });

  return (response.text || "").trim();
}

function extractJsonObject<T>(text: string) {
  const direct = text.trim();
  if (direct.startsWith("{")) {
    return JSON.parse(direct) as T;
  }

  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    return JSON.parse(text.slice(start, end + 1)) as T;
  }

  throw new Error("Analysis model did not return valid JSON.");
}

type RewriteAnalysis = Pick<
  CoachingTurn,
  "originalTranscript" | "polishedAnswer" | "improvementTags" | "coachMessage"
>;

async function analyzeRewrite(transcript: string) {
  const ai = createGeminiClient();
  const response = await ai.models.generateContent({
    model: ANALYSIS_MODEL,
    contents: [
      {
        role: "user",
        parts: [
          {
            text: [
              "You are Echo Coach's rewrite engine for spoken interview answers.",
              "Return a single JSON object with exactly these keys:",
              "originalTranscript, polishedAnswer, improvementTags, coachMessage.",
              "Use 1 or 2 short improvement tags.",
              "Keep the polished answer concise, professional, and natural for spoken English.",
              "Keep coachMessage under 2 sentences.",
              `Transcript: ${transcript}`,
            ].join(" "),
          },
        ],
      },
    ],
    config: {
      responseMimeType: "application/json",
    },
  });

  return extractJsonObject<RewriteAnalysis>(response.text || "");
}

async function analyzeMomentumCardSpec(transcript: string) {
  const ai = createGeminiClient();
  const response = await ai.models.generateContent({
    model: ANALYSIS_MODEL,
    contents: [
      {
        role: "user",
        parts: [
          {
            text: [
              "You are Echo Coach's momentum card extraction engine.",
              "Return a single JSON object with exactly these keys:",
              "roleLabel, careerDirection, strengthKeyword, encouragingCaption, imagePrompt.",
              "Base everything only on the user's original transcript.",
              "Keep roleLabel very short and infer it from the user's answer, like 'Backend Engineer' or 'Product Designer'.",
              "If the answer does not clearly imply a role or direction, use 'Professional Candidate'.",
              "Keep careerDirection to one short sentence fragment about the user's likely future professional direction.",
              "Keep strengthKeyword to a short word or phrase that reflects the user's strongest trait, goal, or direction.",
              "Keep encouragingCaption to 1 short complete sentence under 10 words.",
              "Keep imagePrompt as a content-only visual brief for an image model.",
              "Describe only the role context, environment, attire, symbolic details, and composition in the role's normal professional context.",
              "Do not include any art style, rendering style, realism level, camera language, lighting language, or text-layout instructions in imagePrompt.",
              `Transcript: ${transcript}`,
            ].join(" "),
          },
        ],
      },
    ],
    config: {
      responseMimeType: "application/json",
    },
  });

  return extractJsonObject<Partial<MomentumCardSpec>>(response.text || "");
}

function resolveMomentumCardSpec(
  transcript: string,
  rawMomentumSpec: Partial<MomentumCardSpec>
) {
  const encouragementLine =
    rawMomentumSpec.encouragingCaption?.trim() || DEFAULT_ENCOURAGEMENT_LINE;
  const roleLabel = rawMomentumSpec.roleLabel?.trim() || DEFAULT_ROLE_LABEL;
  const strengthKeyword =
    rawMomentumSpec.strengthKeyword?.trim() || DEFAULT_STRENGTH_KEYWORD;

  return buildMomentumCardSpec({
    roleLabel,
    strengthKeyword,
    encouragingCaption: encouragementLine,
    careerDirection: rawMomentumSpec.careerDirection,
    imagePrompt: rawMomentumSpec.imagePrompt,
    originalTranscript: transcript,
  });
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as AnalyzeAnswerRequest;

    if (!body.sessionId) {
      return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
    }

    const useMock = resolveMockMode();
    if (useMock) {
      const coachingTurn = createMockCoachingTurn(
        body.sessionId,
        body.transcript,
        body.questionIndex || 1
      );
      const response: AnalyzeAnswerResponse = {
        coachingTurn,
        transcriptSource: "mock",
        transcriptionModel: TRANSCRIPTION_MODEL,
        analysisModel: ANALYSIS_MODEL,
      };
      return NextResponse.json(response);
    }

    let transcript = body.transcript?.trim() || "";
    let transcriptSource: AnalyzeAnswerResponse["transcriptSource"] = "fallback";

    if (!transcript) {
      if (!body.audioChunk?.data || !body.audioChunk.mimeType) {
        return NextResponse.json(
          { error: "Either transcript or audioChunk is required." },
          { status: 400 }
        );
      }

      const projectId = process.env.GOOGLE_CLOUD_PROJECT;

      if (projectId) {
        try {
          transcript = await transcribeWithChirp3(body.audioChunk.data, projectId);
          transcriptSource = "chirp_3";
        } catch (error) {
          console.error("Chirp 3 transcription failed, falling back to Gemini.", error);
        }
      }

      if (!transcript) {
        transcript = await transcribeWithGeminiFallback(
          body.audioChunk.data,
          body.audioChunk.mimeType
        );
        transcriptSource = "fallback";
      }
    }

    if (!transcript) {
      return NextResponse.json(
        { error: "Transcript was empty. Try speaking for a little longer." },
        { status: 422 }
      );
    }

    const rewritePromise = analyzeRewrite(transcript);
    const rawMomentumSpecPromise = analyzeMomentumCardSpec(transcript);

    void rawMomentumSpecPromise
      .then((rawMomentumSpec) => {
        const momentumCardSpec = resolveMomentumCardSpec(transcript, rawMomentumSpec);
        return prewarmMomentumCard({
          sessionId: body.sessionId,
          encouragingCaption: momentumCardSpec.encouragingCaption,
          imagePrompt: momentumCardSpec.imagePrompt,
        });
      })
      .catch((prewarmError) => {
        console.error("Momentum card prewarm failed:", prewarmError);
      });

    const [rewriteAnalysis, rawMomentumSpec] = await Promise.all([
      rewritePromise,
      rawMomentumSpecPromise,
    ]);
    const resolvedTranscript = rewriteAnalysis.originalTranscript?.trim() || transcript;
    const momentumCardSpec = resolveMomentumCardSpec(
      resolvedTranscript,
      rawMomentumSpec
    );
    const encouragementLine = momentumCardSpec.encouragingCaption;
    const roleLabel = momentumCardSpec.roleLabel;
    const strengthKeyword = momentumCardSpec.strengthKeyword;
    const coachingTurn: CoachingTurn = {
      sessionId: body.sessionId,
      questionIndex: body.questionIndex || 1,
      questionText: body.questionText?.trim() || `Interview Question ${body.questionIndex || 1}`,
      originalTranscript: resolvedTranscript,
      polishedAnswer: rewriteAnalysis.polishedAnswer?.trim() || transcript,
      improvementTags:
        rewriteAnalysis.improvementTags?.filter(Boolean).slice(0, 2) || [
          "Clearer structure",
        ],
      coachMessage:
        rewriteAnalysis.coachMessage?.trim() ||
        "Lead with your fit, then close with the value you can bring to the role.",
      encouragementLine,
      roleLabel,
      strengthKeyword,
      momentumCardSpec,
      timestamp: new Date().toISOString(),
    };

    const response: AnalyzeAnswerResponse = {
      coachingTurn,
      transcriptSource,
      transcriptionModel: TRANSCRIPTION_MODEL,
      analysisModel: ANALYSIS_MODEL,
    };

    try {
      await persistCoachingTurnRecord(coachingTurn, transcriptSource);
    } catch (persistError) {
      console.error("Persist coaching turn failed:", persistError);
    }

    return NextResponse.json(response);
  } catch (error: unknown) {
    console.error("Analyze answer error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to analyze the answer." },
      { status: 500 }
    );
  }
}
