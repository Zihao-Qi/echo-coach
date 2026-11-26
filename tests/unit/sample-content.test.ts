import assert from "node:assert/strict";
import test from "node:test";
import { sampleContent, type SampleQuestionContent } from "../../src/content/questions/sample-content";
import { starterQuestions } from "../../src/content/questions/starter-bank";

const wordCount = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;

test("sample copy covers only the starter questions and reserves polished answers for technical starters", () => {
  const byId: Readonly<Record<string, SampleQuestionContent | undefined>> = sampleContent;
  assert.deepEqual(Object.keys(byId).sort(), starterQuestions.map(({ id }) => id).sort());

  for (const { id, track } of starterQuestions) {
    const sample = byId[id];
    assert.ok(sample, `${id}: missing sample content`);
    const words = wordCount(sample.sampleTranscript);
    assert.ok(words >= 40 && words <= 80, `${id}: ${words} transcript words`);

    if (track === "behavioral") {
      assert.equal(sample.polishedAnswer, undefined, `${id}: unexpected polished answer`);
      assert.equal(sample.highlights, undefined, `${id}: unexpected highlights`);
      continue;
    }

    const { polishedAnswer, highlights } = sample;
    assert.ok(polishedAnswer && highlights, `${id}: missing polished answer or highlights`);
    assert.ok(polishedAnswer.length >= 2 && polishedAnswer.length <= 3, `${id}: wrong paragraph count`);
    assert.ok(polishedAnswer.every(paragraph => paragraph.trim() && !paragraph.includes("\n")), `${id}: invalid paragraph`);
    const text = polishedAnswer.join("\n\n");
    const polishedWords = wordCount(text);
    assert.ok(polishedWords >= 90 && polishedWords <= 140, `${id}: ${polishedWords} polished words`);
    assert.doesNotMatch(text, /["“”‘’]/u, `${id}: quotation marks in spoken copy`);
    assert.ok(highlights.length >= 2 && highlights.length <= 3, `${id}: wrong highlight count`);
    assert.equal(new Set(highlights).size, highlights.length, `${id}: duplicate highlights`);
    for (const phrase of highlights) {
      assert.ok(phrase.length > 0 && phrase === phrase.trim(), `${id}: invalid highlight`);
      assert.equal(text.split(phrase).length - 1, 1, `${id}: expected one occurrence of ${phrase}`);
    }
  }
});
