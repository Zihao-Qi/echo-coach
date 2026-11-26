import test from "node:test";
import assert from "node:assert/strict";
import { initialRound, MAX_ANSWER_LENGTH, MOCK_PROMPTS, reduceRound } from "../../src/features/mock-interview/round";

test("mock round is fixed, does not double-advance, and opens debrief only on request", () => {
  assert.deepEqual(MOCK_PROMPTS.map((q) => q.id), ["behavioral-project", "swe-hash-map", "ml-data-leakage"]);
  let state = reduceRound(initialRound, { type: "start" });
  assert.equal(reduceRound(state, { type: "debrief" }), state);
  assert.equal(reduceRound(state, { type: "next", questionIndex: 0 }), state);
  state = reduceRound(state, { type: "draft", questionIndex: 0, text: "  My original\nanswer. " });
  state = reduceRound(state, { type: "next", questionIndex: 0 });
  assert.equal(reduceRound(state, { type: "next", questionIndex: 0 }), state);
  assert.equal(reduceRound(state, { type: "draft", questionIndex: 0, text: "Stale editor" }), state);
  state = reduceRound(state, { type: "skip", questionIndex: 1 });
  state = reduceRound(state, { type: "draft", questionIndex: 2, text: "x".repeat(MAX_ANSWER_LENGTH + 1) });
  state = reduceRound(state, { type: "next", questionIndex: 2 });
  assert.equal(state.phase, "review");
  if (state.phase !== "review") throw new Error("Expected review");
  assert.equal(state.showDebrief, false);
  assert.equal(state.turns[0].answer, "  My original\nanswer. ");
  assert.equal(state.turns[1].answer, null);
  assert.equal(state.turns[2].answer?.length, MAX_ANSWER_LENGTH);
  assert.equal(reduceRound(state, { type: "revise", questionIndex: 0, text: "Too early" }), state);
  state = reduceRound(state, { type: "debrief" });
  state = reduceRound(state, { type: "revise", questionIndex: 0, text: "A separate revision" });
  assert.deepEqual(state, { phase: "review", turns: [
    { questionIndex: 0, answer: "  My original\nanswer. " }, { questionIndex: 1, answer: null }, { questionIndex: 2, answer: "x".repeat(MAX_ANSWER_LENGTH) },
  ], showDebrief: true, revisions: { 0: "A separate revision" } });
  assert.equal(reduceRound(state, { type: "discard" }), initialRound);
});

test("ending early keeps only reached submissions and current nonblank answer", () => {
  let state = reduceRound(initialRound, { type: "start" });
  const empty = reduceRound(state, { type: "end", questionIndex: 0 });
  assert.deepEqual(empty, { phase: "review", turns: [], showDebrief: false, revisions: {} });
  assert.equal(reduceRound(empty, { type: "debrief" }), empty);
  state = reduceRound(state, { type: "draft", questionIndex: 0, text: "An answered question." });
  state = reduceRound(state, { type: "next", questionIndex: 0 });
  state = reduceRound(state, { type: "draft", questionIndex: 1, text: "  unfinished answer " });
  state = reduceRound(state, { type: "end", questionIndex: 1 });
  assert.equal(state.phase, "review");
  if (state.phase !== "review") throw new Error("Expected review");
  assert.deepEqual(state.turns, [
    { questionIndex: 0, answer: "An answered question." }, { questionIndex: 1, answer: "  unfinished answer " },
  ]);
  const debrief = reduceRound(state, { type: "debrief" });
  assert.equal(reduceRound(debrief, { type: "revise", questionIndex: 2, text: "Question not reached" }), debrief);
});
