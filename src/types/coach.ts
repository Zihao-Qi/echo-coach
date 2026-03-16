export type PracticeScenario = "interview";

export type SessionStatus =
  | "idle"
  | "connecting"
  | "prompting"
  | "ready"
  | "listening"
  | "analyzing"
  | "ready_to_practice"
  | "recap"
  | "error";

export interface SessionConfig {
  scenario: PracticeScenario;
  language: "en-US";
  userGoal?: string;
}

export interface LiveSession {
  sessionId: string;
  scenario: PracticeScenario;
  openingQuestion: string;
  currentQuestion: string;
  questionIndex: number;
  questionLimit: number;
  status: SessionStatus;
  startedAt: string;
}

export interface CoachingTurn {
  sessionId: string;
  questionIndex: number;
  questionText: string;
  originalTranscript: string;
  polishedAnswer: string;
  improvementTags: string[];
  coachMessage: string;
  encouragementLine: string;
  roleLabel: string;
  strengthKeyword: string;
  momentumCardSpec: MomentumCardSpec;
  timestamp: string;
}

export interface MomentumCardSpec {
  [key: string]: string;
  roleLabel: string;
  careerDirection: string;
  strengthKeyword: string;
  encouragingCaption: string;
  imagePrompt: string;
}

export interface Recap {
  sessionId: string;
  originalAnswer: string;
  polishedAnswer: string;
  primaryFocus: string;
  coachMessage: string;
  encouragementLine: string;
  roleLabel: string;
  strengthKeyword: string;
  assetDataUrl?: string;
  assetAlt?: string;
  assetModel?: string;
}

export interface SessionHistoryItem {
  sessionId: string;
  scenario: PracticeScenario;
  startedAt: string;
  updatedAt: string;
  primaryFocus: string;
  polishedAnswerPreview: string;
}

export interface StatusEvent {
  type: "status";
  sessionId: string;
  status: SessionStatus;
  message?: string;
  timestamp: string;
}

export interface AgentPromptEvent {
  type: "agent_prompt";
  sessionId: string;
  text: string;
  timestamp: string;
}

export interface ErrorEvent {
  type: "error";
  sessionId: string;
  code: string;
  message: string;
  timestamp: string;
}

export type CoachEvent =
  | StatusEvent
  | AgentPromptEvent
  | ErrorEvent;

export interface StartSessionRequest {
  config: SessionConfig;
}

export interface StartSessionResponse {
  session: LiveSession;
}

export interface SessionBootstrap {
  token: string;
  projectId: string;
  endpoint: string;
  model: string;
  analysisModel: string;
  ttsModel: string;
  recapCardModel: string;
  transcriptionModel: string;
  responseModalities: ("AUDIO" | "TEXT" | "IMAGE")[];
  systemInstruction: string;
  openingQuestion: string;
  language: "en-US";
  useMock: boolean;
}

export interface AnalyzeAnswerRequest {
  sessionId: string;
  transcript?: string;
  questionIndex?: number;
  questionText?: string;
  audioChunk?: {
    data: string;
    mimeType: string;
  };
}

export interface AnalyzeAnswerResponse {
  coachingTurn: CoachingTurn;
  transcriptSource: "mock" | "chirp_3" | "fallback";
  transcriptionModel: string;
  analysisModel: string;
}

export interface EndSessionRequest {
  sessionId: string;
}

export interface PromptAgentRequest {
  sessionId: string;
  questionText: string;
  questionIndex: number;
}

export interface SpeakPracticeRequest {
  sessionId: string;
  text: string;
}

export interface SpeakPracticeResponse {
  model: string;
  useBrowserTts?: boolean;
  fallbackText?: string;
  audioData?: string;
  mimeType?: string;
  sampleRateHz?: number;
}

export interface GenerateRecapCardRequest {
  sessionId: string;
  encouragingCaption: string;
  imagePrompt: string;
}

export interface GenerateRecapCardResponse {
  model: string;
  prompt: string;
  alt: string;
  assetDataUrl: string;
}

export interface SessionRecapPayload {
  recap: Recap;
  coachingHistory: CoachingTurn[];
}

export interface NextQuestionRequest {
  sessionId: string;
  questionIndex: number;
  questionLimit: number;
  previousTranscript?: string;
  polishedAnswer?: string;
}

export interface NextQuestionResponse {
  sessionId: string;
  questionText: string;
  questionIndex: number;
  questionLimit: number;
}
