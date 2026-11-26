import { findQuestion } from "../../content/questions/starter-bank";

export const MOCK_PROMPTS = ["behavioral-project", "swe-hash-map", "ml-data-leakage"].map((id) => {
  const question = findQuestion(id);
  if (!question) throw new Error(`Missing mock question: ${id}`);
  return question;
});
export const MAX_ANSWER_LENGTH = 10000;

export type Turn = { questionIndex: number; answer: string | null };
export type Round =
  | { phase: "ready" }
  | { phase: "answering"; turns: Turn[]; draft: string }
  | { phase: "review"; turns: Turn[]; showDebrief: boolean; revisions: Record<number, string> };
type Action =
  | { type: "start" | "discard" | "debrief" }
  | { type: "draft"; questionIndex: number; text: string }
  | { type: "next" | "skip" | "end"; questionIndex: number }
  | { type: "revise"; questionIndex: number; text: string };

export const initialRound: Round = { phase: "ready" };
const review = (turns: Turn[]): Round => ({ phase: "review", turns, showDebrief: false, revisions: {} });
export function reduceRound(state: Round, action: Action): Round {
  if (action.type === "discard") return initialRound;
  if (state.phase === "ready") return action.type === "start" ? { phase: "answering", turns: [], draft: "" } : state;
  if (state.phase === "review") {
    if (action.type === "debrief" && state.turns.length && !state.showDebrief) return { ...state, showDebrief: true };
    if (action.type === "revise" && state.showDebrief && state.turns.some((turn) => turn.questionIndex === action.questionIndex)) {
      return { ...state, revisions: { ...state.revisions, [action.questionIndex]: action.text.slice(0, MAX_ANSWER_LENGTH) } };
    }
    return state;
  }
  const questionIndex = state.turns.length;
  if (!("questionIndex" in action) || action.questionIndex !== questionIndex) return state;
  if (action.type === "draft") return { ...state, draft: action.text.slice(0, MAX_ANSWER_LENGTH) };
  const hasAnswer = state.draft.trim().length > 0;
  if (action.type === "end") return review(hasAnswer ? [...state.turns, { questionIndex, answer: state.draft }] : state.turns);
  if (action.type === "next" && !hasAnswer) return state;
  if (action.type !== "next" && action.type !== "skip") return state;
  const turns = [...state.turns, { questionIndex, answer: action.type === "skip" ? null : state.draft }];
  return turns.length === MOCK_PROMPTS.length ? review(turns) : { phase: "answering", turns, draft: "" };
}
