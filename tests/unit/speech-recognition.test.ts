import assert from "node:assert/strict";
import test from "node:test";
import { applySpeechResult, type SpeechDraft } from "../../src/features/practice/audio/speech-results";

test("speech results keep finals and replace repeated interim text", () => {
  const draft: SpeechDraft = { finals: "", interim: "" };
  assert.equal(applySpeechResult(draft, 0, [{ isFinal: false, transcript: "hel" }]), "hel");
  assert.equal(applySpeechResult(draft, 0, [{ isFinal: false, transcript: "hello" }]), "hello");
  assert.equal(applySpeechResult(draft, 0, [{ isFinal: true, transcript: "hello " }]), "hello ");
  assert.equal(
    applySpeechResult(draft, 1, [
      { isFinal: true, transcript: "hello " },
      { isFinal: false, transcript: "there" },
    ]),
    "hello there",
  );
  assert.equal(
    applySpeechResult(draft, 1, [
      { isFinal: true, transcript: "hello " },
      { isFinal: true, transcript: "there" },
    ]),
    "hello there",
  );
  const capped = applySpeechResult(
    { finals: "stale", interim: "stale" },
    0,
    [{ isFinal: true, transcript: `${"x".repeat(9_995)}0123456789` }],
  );
  assert.equal(capped.length, 10_000);
  assert.equal(capped.endsWith("01234"), true);
  assert.equal(capped.startsWith("x"), true);
});

test("an unchanged interim prefix survives a later resultIndex and a shorter list replaces the snapshot", () => {
  const draft: SpeechDraft = { finals: "", interim: "" };
  assert.equal(applySpeechResult(draft, 0, [
    { isFinal: false, transcript: "one" },
    { isFinal: false, transcript: "two" },
  ]), "onetwo");
  assert.equal(applySpeechResult(draft, 1, [
    { isFinal: false, transcript: "one" },
    { isFinal: false, transcript: "three" },
  ]), "onethree");
  assert.equal(applySpeechResult(draft, 0, [
    { isFinal: false, transcript: "one" },
    { isFinal: false, transcript: "three" },
    { isFinal: false, transcript: "four" },
  ]), "onethreefour");
  assert.equal(applySpeechResult(draft, 1, [
    { isFinal: false, transcript: "one" },
  ]), "one");
  assert.equal(draft.finals, "");
  assert.equal(draft.interim, "one");
});
