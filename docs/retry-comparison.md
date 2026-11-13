# Retry comparison: implementation and review

## Behavior

- Retrying a question passes the actual earlier candidate answer into the existing evaluation call. No second generation call is introduced.
- The server resolves the baseline from the owner-scoped repository and checks the question before generation. The browser submits only the earlier attempt ID, not trusted baseline text.
- Structured comparison contains a summary, up to three evidence-backed changes (improvement, regression, or neutral), and a next focus.
- Before/after quotations must be literal substrings of the correct submitted answers. Empty/whitespace-only evidence is rejected. Whitespace-normalized identical excerpts cannot claim improvement/regression.
- First attempts and unchanged answers have no comparison. Demo feedback explicitly does not assess improvement.
- Original answers remain unchanged. Personal-story rewrite and unverifiable-correctness guards remain in place.
- Comparisons are stored with the evaluation and linked through `previousAttemptId`. Earlier stored evaluations without comparison still render.

## Interface

`/practice` shows “What changed since Attempt …?” with before/after excerpts and a next focus. It can show regressions without assuming that every retry improved.

The comparison cards use the actual linked baseline rather than simply the previous list item. Other attempts remain available, with controls for viewing historical feedback. A recovered older attempt is selected immediately after evaluation returns and remains selected when a history refresh drops that page.

Parent-before-child ordering resolves equal timestamps independently of UUID order. Display numbering refers to the loaded attempt set; a separately fetched baseline outside the loaded page is labeled “Linked earlier answer” rather than inventing its global number.

Owner-scoped `GET /api/practice/attempts/[id]` resolves linked baselines independently of paginated history. UI provides loading, error, and retry states; requests are aborted on cleanup. Backend lease fields are not returned.

## Independent Pi review

Two read-only Pi reviews were performed; neither reviewer edited code, executed tests, read credentials, or made network/model requests.

The initial review found four issues:
1. Timestamp/UUID ordering and recovery could leave the wrong feedback selected.
2. Baselines outside the loaded history page were not resolved independently.
3. Branch histories could duplicate the baseline and omit another submitted attempt.
4. Whitespace could bypass identical-evidence validation.

All four were addressed. The branch test first failed in the intended assertion (attempt 2 missing), then passed after filtering the actual displayed IDs. Recovery testing also caught a selected-object identity/numbering bug, which was fixed by resolving the selected attempt through its ID.

Follow-up review found **no actionable issues** in the revised implementation. It noted additional optional test coverage for page-dropping refresh selection, response-ID mismatch, and delayed cleanup. This is static-review evidence, not proof of arbitrary model correctness.

## Executed verification

Parent executed:
- `npm run test:unit`: 39 passed.
- `npm run lint`: passed.
- `npm run test:integration`: production build/type checking passed; 3 HTTP tests passed.
- `PLAYWRIGHT_CHANNEL=chrome CI=true npm run test:e2e -- --workers=1`: 15 passed.
- `npm audit`: zero reported vulnerabilities.
- `git diff --check`: passed.

Coverage includes evidence validation, identical/whitespace changes, regression retention, server-resolved context and single-call behavior, branches, recovery selection, tied timestamps after reload, missing-page baseline error/retry, old records, and owner isolation.

## Limits

No additional paid generation calls were made for this feature. Real Gemini 3.8 Flash / LOW was smoke-tested previously, but the new retry-comparison prompt/schema has been exercised with simulated provider responses only. Its semantic quality on real answer pairs remains unverified. Comparison is model-generated guidance, not an objective progress score or hiring prediction. The larger prior-answer context can increase tokens, although there is still only one provider request per submission.

Current local configuration remains login-free, real Gemini 3.8 Flash / LOW, and memory storage with the development-only request guard. Automated tests explicitly use mocked providers and do not spend the user's Gemini allowance. Server restart loses memory history.
