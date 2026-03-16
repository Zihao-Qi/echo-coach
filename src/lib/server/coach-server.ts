import { GoogleGenAI } from "@google/genai";
import {
  ANALYSIS_MODEL,
  DEFAULT_LANGUAGE,
  DEFAULT_ENCOURAGEMENT_LINE,
  DEFAULT_ROLE_LABEL,
  DEFAULT_STRENGTH_KEYWORD,
  getMockInterviewExample,
  INTERVIEW_OPENING_QUESTION,
  LIVE_MODEL,
  LIVE_VOICE_NAME,
  MAX_INTERVIEW_QUESTIONS,
  MVP_SCENARIO,
  RECAP_CARD_MODEL,
  TRANSCRIPTION_MODEL,
  TTS_FALLBACK_MODEL,
  TTS_MODEL,
} from "../coach-config";
import {
  CoachingTurn,
  GenerateRecapCardRequest,
  MomentumCardSpec,
  Recap,
  SessionBootstrap,
} from "../../types/coach";

export function resolveMockMode() {
  const configuredValue =
    process.env.NEXT_PUBLIC_USE_MOCK ?? process.env.USE_MOCK;

  if (configuredValue === "true") {
    return true;
  }

  if (configuredValue === "false") {
    return false;
  }

  return process.env.NODE_ENV !== "production";
}

export function createGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is required for real Gemini API requests.");
  }

  return new GoogleGenAI({
    apiKey,
    httpOptions: { apiVersion: "v1alpha" },
  });
}

export function buildLiveSystemInstruction() {
  return [
    "You are Echo Coach's live session layer.",
    "The client handles the scripted interviewer prompts separately.",
    "Stay connected and ready for explicit live audio instructions from the client.",
    "Do not coach the user, rewrite their answer, or speak unless the client explicitly asks for it.",
  ].join(" ");
}

export function createSessionBootstrap(useMock: boolean): SessionBootstrap {
  return {
    token: `mock-ephemeral-token-${Date.now()}`,
    projectId: process.env.GOOGLE_CLOUD_PROJECT || "mock-project-id",
    endpoint:
      "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent",
    model: LIVE_MODEL,
    analysisModel: ANALYSIS_MODEL,
    ttsModel: TTS_MODEL,
    recapCardModel: RECAP_CARD_MODEL,
    transcriptionModel: TRANSCRIPTION_MODEL,
    responseModalities: ["AUDIO"],
    systemInstruction: buildLiveSystemInstruction(),
    openingQuestion: INTERVIEW_OPENING_QUESTION,
    language: DEFAULT_LANGUAGE,
    useMock,
  };
}

export function createMockCoachingTurn(
  sessionId: string,
  transcript?: string,
  questionIndex = 1
): CoachingTurn {
  const example = getMockInterviewExample(questionIndex);
  const originalTranscript = transcript?.trim() || example.originalTranscript;
  const encouragementLine = DEFAULT_ENCOURAGEMENT_LINE;
  const roleLabel = example.roleLabel || DEFAULT_ROLE_LABEL;
  const strengthKeyword = example.strengthKeyword || DEFAULT_STRENGTH_KEYWORD;

  return {
    sessionId,
    questionIndex,
    questionText: example.question,
    originalTranscript,
    polishedAnswer: example.polishedAnswer,
    improvementTags: [...example.improvementTags],
    coachMessage: example.coachMessage,
    encouragementLine,
    roleLabel,
    strengthKeyword,
    momentumCardSpec: buildMomentumCardSpec({
      roleLabel,
      strengthKeyword,
      encouragingCaption: encouragementLine,
      originalTranscript,
    }),
    timestamp: new Date().toISOString(),
  };
}

export function buildMomentumCardSpec(input: {
  roleLabel?: string;
  strengthKeyword?: string;
  encouragingCaption?: string;
  originalTranscript?: string;
  careerDirection?: string;
  imagePrompt?: string;
}): MomentumCardSpec {
  const roleLabel = normalizeCardText(input.roleLabel || DEFAULT_ROLE_LABEL);
  const strengthKeyword = normalizeCardText(
    input.strengthKeyword || DEFAULT_STRENGTH_KEYWORD
  );
  const encouragingCaption = getEncouragementLine(
    input.encouragingCaption || DEFAULT_ENCOURAGEMENT_LINE
  );
  const careerDirection = normalizeCardText(
    input.careerDirection || `Growing into a stronger ${roleLabel.toLowerCase()} presence`
  );

  const imagePrompt = normalizeCardText(
    sanitizeMomentumVisualBrief(
      input.imagePrompt ||
      [
        `Show a clean modern professional context for a ${roleLabel}.`,
        `Suggest ${careerDirection}.`,
        `Let ${strengthKeyword} appear through posture, objects, and composition rather than text.`,
        "Prefer a contemporary professional atmosphere with clear symbolic details.",
      ].join(" ")
    )
  );

  return {
    roleLabel,
    careerDirection,
    strengthKeyword,
    encouragingCaption,
    imagePrompt,
  };
}

export function buildRecapFromCoachingTurn(
  coachingTurn: CoachingTurn,
  asset?: { assetDataUrl: string; alt: string; model: string }
): Recap {
  return {
    sessionId: coachingTurn.sessionId,
    originalAnswer: coachingTurn.originalTranscript,
    polishedAnswer: coachingTurn.polishedAnswer,
    primaryFocus: coachingTurn.improvementTags[0] || "Clearer professional phrasing",
    coachMessage: coachingTurn.coachMessage,
    encouragementLine: coachingTurn.encouragementLine,
    roleLabel: coachingTurn.roleLabel,
    strengthKeyword: coachingTurn.strengthKeyword,
    assetDataUrl: asset?.assetDataUrl,
    assetAlt: asset?.alt,
    assetModel: asset?.model,
  };
}

function normalizeCardText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function sanitizeMomentumVisualBrief(value: string) {
  const normalized = normalizeCardText(value);
  const segments = normalized
    .split(/(?<=[.!?])\s+/)
    .map((segment) => segment.trim())
    .filter(Boolean);
  const stylePattern =
    /\b(style|stylized|realistic|photorealistic|photo|photographic|camera|lens|lighting|render|rendered|rendering|illustration|illustrated|cartoon|anime|manga|3d|cgi|sketch|watercolor|oil painting|vector|cinematic)\b/i;

  const filteredSegments = segments.filter((segment) => !stylePattern.test(segment));
  return normalizeCardText((filteredSegments.length ? filteredSegments : segments).join(" "));
}

function trimCardText(value: string, maxLength: number) {
  const normalized = normalizeCardText(value);
  if (normalized.length <= maxLength) {
    return normalized;
  }

  const candidate = normalized.slice(0, maxLength + 1);
  const lastSpace = candidate.lastIndexOf(" ");
  const trimmed = lastSpace > maxLength * 0.6 ? candidate.slice(0, lastSpace) : candidate.slice(0, maxLength);
  return `${trimmed.trim()}...`;
}

function getEncouragementLine(value: string) {
  const normalized = normalizeCardText(value);
  const firstSentence = normalized.match(/[^.!?]+[.!?]?/)?.[0]?.trim() || normalized;
  if (!firstSentence) {
    return "Keep going.";
  }

  if (/[.!?]$/.test(firstSentence)) {
    return firstSentence;
  }

  return `${firstSentence}.`;
}

export function buildRecapCardPrompt(request: GenerateRecapCardRequest) {
  const visualBrief = trimCardText(normalizeCardText(request.imagePrompt), 520);
  const encouragementLine = getEncouragementLine(request.encouragingCaption);

  return [
    "Create a vertical 3:4 encouragement card.",
    "The card should feel simple, elegant, stylish, and youthful.",
    "Use a soft light gray or cool off-white background as the main surface of the card.",
    "Use this visual brief as the main image direction.",
    visualBrief,
    "If a figure is included, it must be a single stylized cartoon character.",
    "Do not create a realistic human, realistic portrait, photographic person, or semi-real human figure.",
    "Keep the character minimal, polished, and not overly detailed.",
    "Include one short complete encouraging sentence near the lower part of the card.",
    "Fill the portrait frame confidently and let the main visual occupy most of the card with minimal empty border space.",
    "Do not include any other readable text.",
    "Do not include any title, role label, occupation label, banner, header, or caption anywhere on the card.",
    "Do not include paragraphs, labels, fake typography, formulas, equations, code, diagrams, app UI, devices, dashboards, or clutter.",
    "Do not mix unrelated professions or settings.",
    "Do not introduce protective gear, uniforms, industrial machinery, factory floors, construction scenes, laboratories, or other domain-specific cues unless the role clearly requires them.",
    "Avoid signs, documents, screens, posters, books, clothing text, or background objects that could introduce extra words.",
    `Encouraging sentence: ${encouragementLine}`,
  ].join(" ");
}

export function createFallbackRecapCardDataUrl(request: GenerateRecapCardRequest) {
  const headline = getEncouragementLine(request.encouragingCaption);
  const escape = (value: string) =>
    value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="900" height="1200" viewBox="0 0 900 1200">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#f2f4f7"/>
          <stop offset="52%" stop-color="#e5e9ee"/>
          <stop offset="100%" stop-color="#d8dfe8"/>
        </linearGradient>
        <radialGradient id="glowOne" cx="18%" cy="16%" r="58%">
          <stop offset="0%" stop-color="#9bd3ff" stop-opacity="0.45"/>
          <stop offset="100%" stop-color="#22d3ee" stop-opacity="0"/>
        </radialGradient>
        <radialGradient id="glowTwo" cx="82%" cy="78%" r="50%">
          <stop offset="0%" stop-color="#ffd29b" stop-opacity="0.34"/>
          <stop offset="100%" stop-color="#fb7185" stop-opacity="0"/>
        </radialGradient>
        <linearGradient id="panel" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="rgba(255,255,255,0.72)"/>
          <stop offset="100%" stop-color="rgba(255,255,255,0.44)"/>
        </linearGradient>
      </defs>
      <rect width="900" height="1200" fill="url(#bg)"/>
      <rect width="900" height="1200" fill="url(#glowOne)"/>
      <rect width="900" height="1200" fill="url(#glowTwo)"/>
      <rect x="18" y="18" width="864" height="1164" rx="52" fill="rgba(255,255,255,0.55)" stroke="rgba(148,163,184,0.25)" stroke-width="2"/>
      <rect x="28" y="28" width="844" height="1144" rx="48" fill="url(#panel)"/>
      <path d="M682 124 C810 220 828 356 744 500 C672 626 694 760 804 892" stroke="rgba(148,163,184,0.16)" stroke-width="24" stroke-linecap="round" fill="none"/>
      <path d="M628 182 C734 266 748 370 688 484 C638 584 648 670 724 764" stroke="rgba(59,130,246,0.22)" stroke-width="12" stroke-linecap="round" fill="none"/>
      <circle cx="704" cy="272" r="28" fill="rgba(96,165,250,0.34)"/>
      <circle cx="734" cy="634" r="182" fill="rgba(251,191,36,0.10)"/>
      <circle cx="742" cy="636" r="82" fill="rgba(59,130,246,0.08)"/>
      <rect x="90" y="826" width="180" height="6" rx="3" fill="#60a5fa"/>
      <foreignObject x="86" y="872" width="630" height="240">
        <div xmlns="http://www.w3.org/1999/xhtml" style="font-family: Helvetica, Arial, sans-serif; font-size: 72px; line-height: 1.02; color: #0f172a; font-weight: 900;">
          ${escape(headline)}
        </div>
      </foreignObject>
    </svg>
  `.trim();

  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

export function getDefaultSessionConfig() {
  return {
    scenario: MVP_SCENARIO,
    language: DEFAULT_LANGUAGE,
  };
}

export function getSpeechRegion() {
  return process.env.GOOGLE_CLOUD_SPEECH_LOCATION || "us";
}

export {
  ANALYSIS_MODEL,
  DEFAULT_ENCOURAGEMENT_LINE,
  DEFAULT_LANGUAGE,
  DEFAULT_ROLE_LABEL,
  DEFAULT_STRENGTH_KEYWORD,
  INTERVIEW_OPENING_QUESTION,
  LIVE_MODEL,
  LIVE_VOICE_NAME,
  MVP_SCENARIO,
  RECAP_CARD_MODEL,
  TRANSCRIPTION_MODEL,
  TTS_FALLBACK_MODEL,
  TTS_MODEL,
  MAX_INTERVIEW_QUESTIONS,
};
