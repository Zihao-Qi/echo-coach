type SampleTranscript = { readonly sampleTranscript: string };

type TranscriptOnly = SampleTranscript & {
  readonly polishedAnswer?: never;
  readonly highlights?: never;
};

type TwoOrThreeStrings = readonly [string, string] | readonly [string, string, string];

type TechnicalSample = SampleTranscript & {
  readonly polishedAnswer: TwoOrThreeStrings;
  readonly highlights: TwoOrThreeStrings;
};

export type SampleQuestionContent = TranscriptOnly | TechnicalSample;

// Join polishedAnswer paragraphs with two newlines for the canonical text.
export const sampleContent = {
  "behavioral-project": {
    sampleTranscript: "In this fictional class project, our team built a site to lend out lab equipment. I put together the page where students could see what was available. I showed an early version to two classmates and changed the layout after watching them use it. By the end, the team could demo a full checkout, and I was proud of how the page turned out.",
  },
  "behavioral-setback": {
    sampleTranscript: "In a made-up internship, I wrote a script to sort support tickets for a weekly report. It worked on the examples I had, but it failed on Monday because some tickets had no date. I told my mentor what happened and reran the report after handling those rows. I added a ticket with no date to our test examples so I would catch that case next time.",
  },
  "swe-hash-map": {
    sampleTranscript: "Suppose a student club needs to find members by email during check-in. I would use a hash map to look up a member without scanning the whole list. If the club mainly wanted to display members in order, I would use a sorted array. I would pick based on which operation happens most often.",
    polishedAnswer: [
      "I would choose a hash map for frequent exact lookups, like finding a member by an email address. Lookup takes constant time on average when the hash function spreads keys well. If many keys collide and the map has to scan them, a lookup can take linear time in the worst case.",
      "Binary search finds an exact match in logarithmic time on a sorted array. I can also find the start of a range and scan forward in order. Inserting in the middle can take linear time because existing elements have to shift. An array is usually more compact than a hash table. The choice depends on how often I need exact lookups, updates, or ordered scans.",
    ],
    highlights: ["constant time on average", "linear time in the worst case", "ordered scans"],
  },
  "swe-debugging": {
    sampleTranscript: "Imagine a campus events app shows the same event twice. I would save an example response and check whether the entries have the same identifier. Then I would look at the stored events and rerun the request. If storage has only one copy, I would check the query to see whether it is repeating a row.",
    polishedAnswer: [
      "First I would clarify whether duplicate means the same record identifier or two records that look alike. I would save the request parameters and response, then use the request identifier to find the matching logs. I would try to reproduce the issue and trace a repeat from the response back to the stored records.",
      "If one stored row appears twice, I would check whether a join returns one result for each related row. If the duplicates are stored, I would replay a create request and test whether two requests can race. I would fix the confirmed cause, such as making repeated creates safe with an idempotency key. Then I would add a regression test that reproduces the duplicate and checks that distinct records still appear.",
    ],
    highlights: ["trace a repeat", "fix the confirmed cause", "regression test"],
  },
  "ml-data-leakage": {
    sampleTranscript: "In a hypothetical campus meal app, a model predicts which meals will sell out, but the live predictions are worse than the ones from testing. I would check how we split the old orders and whether the training data included anything we could only know after lunch. I would also look at which meals the model gets wrong most often.",
    polishedAnswer: [
      "First I would check that the offline and live scores use the same metric and outcome definition. I would check which cases each score includes. Then I would rebuild validation to match deployment. I would split by time if the model predicts future events and check that each feature was available when the prediction would have been made.",
      "Next I would run the same event through both the offline and serving pipelines and compare the resulting feature values. If they differ, I would trace the discrepancy to its source, such as a missing value getting a different default. If the features match for the same inputs, I would compare input distributions and error rates across time and user groups. That would guide my next check before I change the model.",
    ],
    highlights: ["rebuild validation to match deployment", "compare the resulting feature values", "input distributions and error rates"],
  },
  "ml-imbalanced-metrics": {
    sampleTranscript: "Suppose a library wants to flag the few reservations that get canceled at the last minute. If most reservations go ahead, a model could look accurate by never flagging anything. I would check how many cancellations it actually catches and how many alerts were useful. I would also ask the staff whether missing a cancellation or getting a false alert causes more work.",
    polishedAnswer: [
      "Suppose ten out of a thousand cases are positive. Predicting negative every time gives ninety-nine percent accuracy but catches none of the events. I would use that as a baseline. Precision tells me what fraction of alerts are real. Recall tells me what fraction of real events the model catches.",
      "I would use a precision and recall curve to compare thresholds and look at the confusion matrix for a few candidates. If missed events are costly, I would favor higher recall as long as the team can handle the extra false alarms. I would choose a threshold on validation data with a realistic event rate, then report performance at that fixed threshold on an untouched test set.",
    ],
    highlights: ["fraction of alerts are real", "choose a threshold on validation data", "untouched test set"],
  },
  "behavioral-clarify": {
    sampleTranscript: "In a fictional class project, a campus club asked us for a calendar that members could share. I thought they wanted members to post events, but my teammate thought they only wanted a link people could open. I made one sketch for each idea and showed the club both. They chose the link, so we built a page members could view without an account.",
  },
  "swe-pagination": {
    sampleTranscript: "Suppose a class project has a page of assignment submissions. Several students submit at the same time, so I would sort by timestamp and then by a unique identifier. I would send back a cursor for the last row so the next request can pick up after it. I would test it with more submissions at one timestamp than fit on a page.",
    polishedAnswer: [
      "I would sort by timestamp from newest to oldest. Within each timestamp I would sort by unique numeric identifier from smallest to largest. That gives every row a fixed position in the unchanged data. The cursor stores both values from the last row on the page.",
      "For the next page, I would keep the same sort order and include only rows with an older timestamp, or rows with the same timestamp and a larger identifier. The strict comparison leaves out the last row. If the three newest submissions share a timestamp and have identifiers ten, twenty, and thirty, a page of two ends at twenty. The next page starts at thirty, before any older rows.",
    ],
    highlights: ["cursor stores both values", "same timestamp and a larger identifier", "strict comparison"],
  },
  "ml-label-audit": {
    sampleTranscript: "In a fictional help desk, a ticket about being locked out after a failed payment might be labeled account even though the model says billing. I would pull a batch of disagreements and read the ticket text with the labeling guide open. I would ask a second reviewer to label them without seeing the old label, then compare where we disagree.",
    polishedAnswer: [
      "I would sample tickets the model calls billing but the old labels call account. I would include cases where both agree and some where the disagreement goes the other way. Two reviewers would label the tickets independently using the same guide without seeing the prediction or old label. Then we would compare their reasons, especially on tickets that genuinely involve both topics.",
      "If reviewers agree on clear cases and the prediction differs, I would investigate model errors. If reviewers agree but find clear mistakes in the old labels, I would correct the affected labels and recheck the evaluation. If they keep pointing to two valid interpretations, I would clarify the category definitions, perhaps with a rule for choosing the primary issue, and test that rule on new examples before retraining.",
    ],
    highlights: ["without seeing the prediction or old label", "clear mistakes in the old labels", "two valid interpretations"],
  },
} as const satisfies Readonly<Record<string, SampleQuestionContent>>;

export type SampleQuestionId = keyof typeof sampleContent;
