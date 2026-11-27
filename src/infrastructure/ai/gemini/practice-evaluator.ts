import { GoogleGenAI, ThinkingLevel, type GenerateContentParameters, type GenerateContentResponse } from "@google/genai";
import type { AnswerEvaluator } from "../../../application/ports/answer-evaluator";
import { evaluationRequest, evaluationResult } from "../../../application/workflows/gemini-evaluation";
import type { AnswerAttempt, InterviewQuestion, PreviousAnswer } from "../../../domain/interview/practice";
export { EVALUATION_INSTRUCTION, MAX_EVALUATION_OUTPUT_TOKENS } from "../../../application/workflows/gemini-evaluation";

export type GenerateEvaluation = (request: GenerateContentParameters) => Promise<GenerateContentResponse>;
export class GeminiPracticeEvaluator implements AnswerEvaluator {
  readonly mode = "gemini" as const;
  readonly thinkingLevel = "low" as const;
  usage?: AnswerAttempt["provenance"]["usage"];
  private readonly generate: GenerateEvaluation;
  constructor(readonly model: string, apiKey: string, generate?: GenerateEvaluation) {
    if (generate) this.generate = generate;
    else {
      const ai = new GoogleGenAI({ apiKey, httpOptions: { timeout: 45000, retryOptions: { attempts: 1 } } });
      this.generate = request => ai.models.generateContent(request);
    }
  }
  async evaluate(question: InterviewQuestion, answer: string, previous?: PreviousAnswer) {
    this.usage = undefined;
    const request = evaluationRequest(question, answer, previous);
    const response = await this.generate({ model: this.model, contents: request.contents[0].parts[0].text,
      config: { ...request.generationConfig, thinkingConfig: { thinkingLevel: ThinkingLevel[request.generationConfig.thinkingConfig.thinkingLevel] }, systemInstruction: request.systemInstruction.parts[0].text } });
    const result = evaluationResult(response);
    this.usage = result.usage;
    return result.evaluation;
  }
}
