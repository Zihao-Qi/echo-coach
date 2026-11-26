import type { InterviewQuestion } from "../../domain/interview/practice";

export const starterQuestions: readonly InterviewQuestion[] = [
  {
    id: "behavioral-project", track: "behavioral", competency: "Ownership and impact",
    prompt: "Tell me about a project you are proud of. What did you personally contribute?",
    intent: "Show how you solve problems and distinguish your contribution from the team's work. Coursework and personal projects count.",
    hints: ["Choose one project and explain the problem before describing the solution.", "Describe your own decision, why you made it, and an outcome or lesson. Do not invent metrics."],
    rubric: { version: "1", expectedConcepts: ["problem and context", "personal contribution", "decision and reasoning", "outcome or learning"], commonPitfalls: ["only describing what the team did", "unsupported impact claims"] },
  },
  {
    id: "behavioral-setback", track: "behavioral", competency: "Learning and accountability",
    prompt: "Describe a time something did not go as planned. How did you respond?",
    intent: "Demonstrate accountability and learning, not a perfectly disguised success story.",
    hints: ["Use a concrete example from a class, internship, research, or personal project.", "Explain your responsibility, your response, and what you changed afterward."],
    rubric: { version: "1", expectedConcepts: ["specific setback", "personal responsibility", "response", "learning and changed behavior"], commonPitfalls: ["blaming others", "claiming a lesson without an example"] },
  },
  {
    id: "swe-hash-map", track: "swe", competency: "Data structures and complexity",
    prompt: "When would you choose a hash map over a sorted array? Explain the trade-offs.",
    intent: "Reason about operations and constraints rather than repeat one complexity number.",
    hints: ["Compare lookup, insertion, ordered traversal, and memory use.", "Distinguish average and worst-case hash lookup; sorted arrays support binary search but insertion may shift elements."],
    rubric: { version: "1", expectedConcepts: ["average O(1) hash lookup and possible O(n) worst case", "O(log n) binary search on a sorted array", "O(n) array insertion due to shifts", "ordering, memory, and workload trade-offs"], commonPitfalls: ["hash lookup is always O(1)", "binary search works on an unsorted array"] },
  },
  {
    id: "swe-debugging", track: "swe", competency: "Debugging and testing",
    prompt: "An API sometimes returns duplicate records. How would you investigate and prevent the issue?",
    intent: "Look for a systematic investigation with testable hypotheses, not a guessed fix.",
    hints: ["First clarify what duplicate means and collect a reproducible example.", "Consider joins, retries, concurrent writes, pagination, and missing uniqueness constraints. Explain how you would test a fix."],
    rubric: { version: "1", expectedConcepts: ["clarify and reproduce", "inspect requests, logs, and data", "test plausible causes", "fix root cause and add regression coverage"], commonPitfalls: ["deduplicating output without investigating the cause", "assuming one cause without evidence"] },
  },
  {
    id: "ml-data-leakage", track: "ai-ml", competency: "Evaluation and data leakage",
    prompt: "Your model performs very well offline but poorly after deployment. How would you investigate?",
    intent: "Explain evaluation validity and deployment differences before reaching for a bigger model.",
    hints: ["Check whether your validation data represents future production inputs.", "Consider data leakage, how you split the data, preprocessing differences, data shift, and metric mismatch. Which would you check first, and what result would change your next step?"],
    rubric: { version: "1", expectedConcepts: ["data leakage and split validity", "train-serving preprocessing consistency", "distribution shift", "metric alignment and error analysis"], commonPitfalls: ["tuning on the test set", "assuming overfitting is the only explanation"] },
  },
  {
    id: "ml-imbalanced-metrics", track: "ai-ml", competency: "Metrics and trade-offs",
    prompt: "For a rare-event classifier, why can accuracy be misleading, and how would you choose metrics?",
    intent: "Connect metrics and thresholds to the costs of false positives and false negatives.",
    hints: ["Compare the model against a classifier that always predicts the majority class.", "Discuss precision, recall, precision-recall curves, the confusion matrix, and threshold selection on validation data."],
    rubric: { version: "1", expectedConcepts: ["majority-class baseline", "precision and recall", "error costs and threshold trade-offs", "validation-based threshold selection"], commonPitfalls: ["choosing accuracy alone", "choosing a threshold using test labels"] },
  },
  {
    id: "behavioral-clarify", track: "behavioral", competency: "Clarifying requirements",
    prompt: "Tell me about a time a project request could have meant two different things. How did you find out what was actually needed?",
    intent: "Use a class, volunteer, or work example to show how you checked an assumption before committing to a solution.",
    hints: ["What were two plausible readings of the request? What would you have built differently under each one?", "Recall a question, sketch, or example you shared. How did the response change or confirm what you did next?"],
    rubric: { version: "1", expectedConcepts: ["specific ambiguity and why it mattered", "a clarifying action the candidate took", "how the response informed a decision"], commonPitfalls: ["describing a misunderstanding without saying how it was checked", "assuming silence meant agreement"] },
  },
  {
    id: "swe-pagination", track: "swe", competency: "Stable pagination",
    prompt: "You’re listing submissions newest first. Several have the same timestamp. With the data unchanged between requests, how would you let a reader fetch the next page without missing or repeating a submission?",
    intent: "Reason about a stable order and the boundary between two pages. State what information the next request needs.",
    hints: ["Try a page size of two with three submissions at the same time. Which one belongs at the start of page two?", "Choose a unique tie-breaker. Using the last row on page one, explain either how a cursor resumes or why an offset is valid under the stated assumption."],
    rubric: { version: "1", expectedConcepts: ["a deterministic total order with a unique tie-breaker", "a continuation rule consistent with that order on unchanged data", "a boundary example or test with tied timestamps"], commonPitfalls: ["resuming from the timestamp alone", "including the last row a second time"] },
  },
  {
    id: "ml-label-audit", track: "ai-ml", competency: "Investigating label quality",
    prompt: "A support-ticket classifier often predicts ‘billing’ for tickets labeled ‘account’. Before retraining, how would you tell whether the model is wrong, the labels are unreliable, or the categories overlap?",
    intent: "Use examples and labeling instructions to distinguish model mistakes from disagreement about what the target means.",
    hints: ["Which tickets would you inspect besides the disagreements? Think about a ticket that really is about both billing and an account.", "Have reviewers label a sample using the same instructions without seeing the prediction or old label. What pattern would lead you to revise the instructions rather than the model?"],
    rubric: { version: "1", expectedConcepts: ["sample disagreements and comparison cases", "check labels independently against a shared definition", "choose a next step based on the pattern of errors or ambiguity"], commonPitfalls: ["treating either the model or existing labels as ground truth", "relabeling every disagreement to match the prediction"] },
  },
];

export function nextStarterQuestion(id: string, bank = starterQuestions): InterviewQuestion | undefined {
  const current = bank.find((question) => question.id === id);
  if (!current) return undefined;
  const track = bank.filter((question) => question.track === current.track);
  if (track.length < 2) return undefined;
  return track[(track.indexOf(current) + 1) % track.length];
}

export function findQuestion(id: string) {
  return starterQuestions.find((question) => question.id === id);
}
