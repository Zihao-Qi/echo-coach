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
    hints: ["Check whether your validation data represents future production inputs.", "Consider leakage, time/group splits, preprocessing differences, distribution shift, and metric alignment."],
    rubric: { version: "1", expectedConcepts: ["data leakage and split validity", "train-serving preprocessing consistency", "distribution shift", "metric alignment and error analysis"], commonPitfalls: ["tuning on the test set", "assuming overfitting is the only explanation"] },
  },
  {
    id: "ml-imbalanced-metrics", track: "ai-ml", competency: "Metrics and trade-offs",
    prompt: "For a rare-event classifier, why can accuracy be misleading, and how would you choose metrics?",
    intent: "Connect metrics and thresholds to the costs of false positives and false negatives.",
    hints: ["Compare the model against a classifier that always predicts the majority class.", "Discuss precision, recall, precision-recall curves, the confusion matrix, and threshold selection on validation data."],
    rubric: { version: "1", expectedConcepts: ["majority-class baseline", "precision and recall", "error costs and threshold trade-offs", "validation-based threshold selection"], commonPitfalls: ["choosing accuracy alone", "choosing a threshold using test labels"] },
  },
];

export function findQuestion(id: string) {
  return starterQuestions.find((question) => question.id === id);
}
