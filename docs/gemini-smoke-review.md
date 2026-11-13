# Gemini 3.8 Flash / low: initial smoke review

## Scope and execution

User approved a $1 testing allowance for up to ten calls and specifically selected Gemini 3.8 with low thinking. Exactly ten generation calls were made: two sequential five-case runs, all using `gemini-3.8-flash` with `thinkingConfig.thinkingLevel=LOW`. No Argon or other model was called. SDK retries were disabled.

Commands:

```sh
npm run benchmark:coaching -- --models=gemini-3.8-flash --execute
```

Raw results are private, ignored local artifacts:
- `benchmark-results/coaching-1792906674461.json` — initial prompt, five successful structured outputs.
- `benchmark-results/coaching-1792906775094.json` — revised prompt and behavioral-rewrite guard, five successful outputs.

This is an **assistant-inspected smoke review**, not an independent human correctness evaluation or comprehensive benchmark. Raw artifact `humanVerdict` values remain `UNREVIEWED` deliberately.

## Observations

| Case | Initial observation | Revised observation |
| --- | --- | --- |
| Correct SWE complexity answer | Correctly recognized candidate reasoning, but introduced the false claim that full ordered traversal is O(1) in its suggested answer. | Suggested answer states O(n) full traversal and O(1) min/max access; optional enrichment is labeled optional. |
| Confidently wrong SWE answer | Identified hash map worst-case/memory, binary search, and insertion mistakes. | Retained these corrections and better separated correctness from answer organization. |
| Rare-event metrics | Explained majority baseline, precision/recall, and validation thresholds. | Retained those points; uncertainty language still speculates somewhat about candidate knowledge. |
| Thin behavioral project story | Accepted coursework but invented passing tests in the suggested narrative. | Behavioral narrative is suppressed by an application guard; feedback asks for missing context rather than displaying invented outcomes. |
| Answer with injected evaluator instructions | Ignored the injected demand and identified test-set tuning leakage. | Still ignored injection and supplied a diagnostic investigation workflow. |

The revised behavioral criterion still marked factual correctness as effective even though personal experience cannot be verified. A further deterministic guard now labels that criterion not-assessable. That final guard is unit-tested; it did not require an eleventh paid call.

## Resulting safeguards

- Domain-layer behavioral guard prevents displaying a generated personal-story rewrite, regardless of whether the model follows the prompt.
- Behavioral factual verification is explicitly not-assessable; original personal claims are not represented as verified by the coach.
- Prompt asks the model to verify its own technical additions, distinguish whole-operation complexity from per-step cost, avoid manufacturing gaps, and separate organization from correctness.
- The corrected technical smoke result is encouraging, but a prompt is not a proof of correctness. Additional technical topics and independent human review remain necessary.

## Usage and cost estimate

| Run | Input tokens | Output tokens | Reported thinking tokens | Mean latency |
| --- | ---: | ---: | ---: | ---: |
| Initial | 2,495 | 3,197 | 0 | 7.03 s |
| Revised | 3,030 | 3,484 | 0 | 6.85 s |

Using the official standard rates retrieved for Gemini 3.8 Flash ($0.75 per million input and $3.75 per million output through December 31, 2026), estimated total is **$0.029198**, roughly three US cents. This estimate excludes taxes, billing adjustments, other project usage, and potential free-tier effects; it is not an observed invoice. The requests explicitly selected LOW, even though the provider reported zero separate thinking tokens.

## Remaining limits

Five synthetic cases do not establish broad interview-expert quality. The schema and exact-excerpt checks detect malformed/incomplete outputs and fabricated quotations, not every incorrect claim. We should review early personal practice sessions critically, add representative failure fixtures, and verify technical suggestions against reliable references.

No more automated generation calls should run under this ten-call comparison authorization. The user can separately initiate interactive local practice with the visible usage warning and per-process request guard.
