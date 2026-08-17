# Esperto feedback text and score-threshold research

Date completed: 2026-08-14

Scope: Scaling Up Full Assessment, 61 scored questions

Decision supported: reproduce Esperto's per-question feedback selection in the Scaling Up Platform

## Result

The feedback-text capture is complete for the source assessment: all 61 questions have text at each of the five sampled Esperto answer levels, for a total of 305 non-empty question/level records. The five source reports used uniform answers of 0, 3, 5, 7, and 10, so each report exposes one feedback record for every question.

The best-supported global score mapping is:

| Stored level | Score range | Evidence status |
| ---: | ---: | --- |
| 0 | 0–2 | End point observed; interior boundary inferred from the five-level design |
| 3 | 3–4 | End point observed; interior boundary inferred from the five-level design |
| 5 | 5–6 | Confirmed by the live question-1 sweep |
| 7 | 7–8 | Confirmed by the live question-1 sweep |
| 10 | 9–10 | Confirmed by the live question-1 sweep; the top feedback begins at 9 |

This corrects the provisional implementation mapping of `0–2 / 3–4 / 5–6 / 7–9 / 10`. The live Esperto result for score 9 selected the same top feedback as score 10, so `7–9 / 10` is not compatible with current Esperto behavior for question 1.

## What was captured

- 61 unique scored questions.
- Five feedback records per question at source stops 0, 3, 5, 7, and 10.
- 305 total feedback records.
- Zero blank feedback records.
- Exact question labels were stable across the five uniform-fill source reports.
- The complete machine-readable catalogue is in `esperto-feedback-text-catalogue-2026-08-14.csv`.
- The application source library is in `src/prisma/seed-scaling-up-full-assessment.ts`.

The source library contains some intentionally identical adjacent texts:

| Adjacent source levels | Questions with identical text | Interpretation |
| --- | ---: | --- |
| 0 and 3 | 59 of 61 | Those two stored levels often look like one visible 0–4 feedback range even though the source library retains both levels. |
| 3 and 5 | 4 of 61 | Crossing the boundary does not visibly change feedback for these questions. |
| 5 and 7 | 0 of 61 | Every question changes feedback between these levels. |
| 7 and 10 | 2 of 61 | These questions show the same feedback at the two highest sampled levels. |

Only two questions have different texts at source levels 0 and 3: `Financial alert function` and `Employees know yearly goal`. They are the most useful questions for a future boundary test at scores 1, 2, and 4.

## Live controlled sweep

For `Effective recruitment process`, eleven otherwise identical reports were generated with that answer set once to every integer from 0 through 10. The visible feedback selected by Esperto was:

| Score | Selected visible feedback |
| ---: | --- |
| 0–4 | Very difficult |
| 5–6 | Difficult |
| 7–8 | Reasonably well under control |
| 9–10 | Very successful |

This question appears to have four visible ranges because its level-0 and level-3 texts are identical. It does **not** prove that Esperto stores only four levels. The five uniform source reports and the two questions that differ at 0 versus 3 support retaining five stored levels.

The live sweep also exposed wording drift from the May source report. For question 1, the current score-7 and score-10 feedback says the outcome is most likely due to the recruitment process and the time and attention dedicated to it; the older captured source refers to time, attention, and the respondent's network. The catalogue uses the current live wording for question 1 and the May source wording for the remaining questions.

## Method

1. Extracted all question narratives from official uniform-fill Esperto reports in which every scored answer was 0, 3, 5, 7, or 10.
2. Joined the five extracts by exact question label.
3. Verified 61 unique labels, five records per label, and no blank texts.
4. Generated eleven otherwise identical live reports for question 1, covering every integer score from 0 through 10.
5. Compared the selected feedback text across the eleven reports to locate visible transition points.
6. Compared the live results with the platform's provisional five-band mapping.

## Evidence boundaries

The research task is complete as a capture and implementation-ready mapping, but the following distinction must remain explicit:

- **Directly observed:** every question's feedback at scores 0, 3, 5, 7, and 10; all integer outcomes for question 1; question 1's transitions at 5, 7, and 9.
- **High-confidence inference:** the common five-band mapping `0–2 / 3–4 / 5–6 / 7–8 / 9–10` applies across all 61 questions.
- **Not directly observed:** scores 1, 2, 4, 6, 8, and 9 for each of the other 60 questions. Esperto exposes no scoring configuration in the available admin UI or report API, so a direct vendor specification or further controlled sweeps would be required to convert that inference into question-by-question proof.

## Implementation recommendation

Use five stored feedback levels with ranges `0–2`, `3–4`, `5–6`, `7–8`, and `9–10`. Preserve duplicate adjacent texts rather than merging records, because some questions distinguish levels 0 and 3 even though question 1 does not. Treat the catalogue's provenance column as part of the data: question 1 is current-live evidence; the remaining feedback text is from the May 2026 uniform-fill reports and may contain wording that Esperto has since revised.

Do not claim that every interior boundary is vendor-confirmed. If exact parity is mandatory, the smallest follow-up experiment is to sweep scores 0–4 on `Financial alert function` or `Employees know yearly goal`; that would directly locate the only unverified low-end transition that is hidden by question 1's duplicate text.

## Implementation status

Implemented and published on 2026-08-14 as Scaling Up Full Edition 4 (`cmst26ix40002rx04ybh20vvy`). The update changed only the two upper boundary pairs (`7–9` to `7–8`, and `10–10` to `9–10`). A production read-back verified 61 scored questions, five records per question, 305 records total, and exact preservation of every feedback text. Existing campaigns remain pinned to their immutable Edition 3 snapshots; future campaigns use Edition 4.
