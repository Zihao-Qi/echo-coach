import {
  CoachEvent,
  EndSessionRequest,
  LiveSession,
  PromptAgentRequest,
  StartSessionRequest,
  StartSessionResponse,
} from "../types/coach";
import {
  getInterviewQuestionByIndex,
  INTERVIEW_OPENING_QUESTION,
  MAX_INTERVIEW_QUESTIONS,
} from "./coach-config";

export class MockCoachAdapter {
  private currentSession: LiveSession | null = null;
  private eventCallback: ((event: CoachEvent) => void) | null = null;
  private pendingTimers = new Set<ReturnType<typeof setTimeout>>();

  onEvent(callback: (event: CoachEvent) => void) {
    this.eventCallback = callback;
  }

  async startSession(request: StartSessionRequest): Promise<StartSessionResponse> {
    this.clearPendingTimers();

    const sessionId = `mock-session-${Date.now()}`;

    this.currentSession = {
      sessionId,
      scenario: request.config.scenario,
      openingQuestion: INTERVIEW_OPENING_QUESTION,
      currentQuestion: INTERVIEW_OPENING_QUESTION,
      questionIndex: 1,
      questionLimit: MAX_INTERVIEW_QUESTIONS,
      status: "connecting",
      startedAt: new Date().toISOString(),
    };

    this.emit({
      type: "status",
      sessionId,
      status: "connecting",
      timestamp: new Date().toISOString(),
    });

    this.schedule(() => {
      if (!this.currentSession || this.currentSession.sessionId !== sessionId) {
        return;
      }

      this.currentSession.status = "prompting";
      this.emit({
        type: "status",
        sessionId,
        status: "prompting",
        timestamp: new Date().toISOString(),
      });
      this.emit({
        type: "agent_prompt",
        sessionId,
        text: INTERVIEW_OPENING_QUESTION,
        timestamp: new Date().toISOString(),
      });

      this.schedule(() => {
        if (
          !this.currentSession ||
          this.currentSession.sessionId !== sessionId ||
          this.currentSession.status !== "prompting"
        ) {
          return;
        }

        this.currentSession.status = "ready";
        this.emit({
          type: "status",
          sessionId,
          status: "ready",
          timestamp: new Date().toISOString(),
        });
      }, 450);
    }, 800);

    return { session: this.currentSession };
  }

  async endSession(request: EndSessionRequest): Promise<void> {
    if (!this.currentSession) {
      return;
    }

    const { sessionId } = this.currentSession;
    if (request.sessionId !== sessionId) {
      this.emit({
        type: "error",
        sessionId: request.sessionId,
        code: "SESSION_MISMATCH",
        message: "Attempted to end a session that is not active.",
        timestamp: new Date().toISOString(),
      });
      return;
    }

    this.clearPendingTimers();
    this.currentSession = null;
  }

  async promptAgent(request: PromptAgentRequest): Promise<void> {
    if (!this.currentSession) {
      return;
    }

    if (request.sessionId !== this.currentSession.sessionId) {
      this.emit({
        type: "error",
        sessionId: request.sessionId,
        code: "SESSION_MISMATCH",
        message: "Attempted to prompt a session that is not active.",
        timestamp: new Date().toISOString(),
      });
      return;
    }

    this.currentSession.currentQuestion =
      request.questionText || getInterviewQuestionByIndex(request.questionIndex);
    this.currentSession.questionIndex = request.questionIndex;
    this.currentSession.status = "prompting";

    this.schedule(() => {
      if (!this.currentSession || this.currentSession.sessionId !== request.sessionId) {
        return;
      }

      this.emit({
        type: "status",
        sessionId: request.sessionId,
        status: "prompting",
        timestamp: new Date().toISOString(),
      });
      this.emit({
        type: "agent_prompt",
        sessionId: request.sessionId,
        text: this.currentSession.currentQuestion,
        timestamp: new Date().toISOString(),
      });

      this.schedule(() => {
        if (
          !this.currentSession ||
          this.currentSession.sessionId !== request.sessionId ||
          this.currentSession.status !== "prompting"
        ) {
          return;
        }

        this.currentSession.status = "ready";
        this.emit({
          type: "status",
          sessionId: request.sessionId,
          status: "ready",
          timestamp: new Date().toISOString(),
        });
      }, 300);
    }, 250);
  }

  async interruptPlayback(): Promise<void> {
    this.clearPendingTimers();
  }

  private emit(event: CoachEvent) {
    if (this.eventCallback) {
      this.eventCallback(event);
    }
  }

  private schedule(callback: () => void, delayMs: number) {
    const timer = setTimeout(() => {
      this.pendingTimers.delete(timer);
      callback();
    }, delayMs);
    this.pendingTimers.add(timer);
  }

  private clearPendingTimers() {
    for (const timer of this.pendingTimers) {
      clearTimeout(timer);
    }
    this.pendingTimers.clear();
  }
}
