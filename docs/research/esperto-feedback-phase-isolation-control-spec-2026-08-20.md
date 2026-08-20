# Esperto feedback phase-isolation control specification — 2026-08-20

## Purpose and boundary

This note defines the acceptance criteria and decision rules for the approved four-report current-Esperto control at uniform scores `0`, `5`, `7`, and `9`. Its purpose is to determine how much of the previously observed Management-versus-May-like-Delegation feedback difference is caused by changing the employee input while all other profile answers remain fixed.

This is a read-only audit of repository and local report evidence. It did not use a browser, create or modify an Esperto campaign, change Platform Production, change the active Scaling Up Full edition, refresh Peers, or send email/Slack. The live operator should append the completed-run evidence to the main closeout only after all gates below pass.

## Conclusions that must govern the live run

1. **Use `100`, not an assumed boundary value.** A current Esperto report with 50 permanent employees says `Management team phase`; the already-captured May-like current reports with 100 permanent and 15 temporary employees say `Delegation phase`. These are direct current-source observations. The supplied workbooks confirm 40 as Management and 100 as Delegation, but do not establish the exact live boundary. Therefore 100 is the lowest locally proven Delegation value, not the proven minimum Delegation value.
2. **Change only the employee input that rendered as 50 permanent employees in the Management report.** Preserve the third employee/temporary/freelance input at `0`. The new controlled input vector is `[company years 10, employee input 100, third employee input 0]`, replacing `[10, 50, 0]`. Do not use the May-like `[15, 100, 15]` vector for this isolation suite.
3. **Call the result headcount/phase-associated, not phase-only.** Organizational phase is a derived output of the employee input; it cannot be toggled independently in the source. A difference between otherwise-identical 50/Management and 100/Delegation reports proves that the changed employee input affects feedback selection under this profile. It does not by itself distinguish an exact-headcount rule, an employee-size band, or a phase key.
4. **The repository currently contains a phase-boundary contradiction.** [`computeGrowthPhase()`](../../src/src/lib/assessments/su-full-phase.ts#L98-L158) maps 50 to Delegation, but the current Esperto Management control PDF prints 50 permanent employees and `Management team phase`. Do not use the Platform helper to certify the Esperto control. The live Esperto interstitial and generated PDF are the authorities for this experiment. Do not change the helper until the live boundary is separately measured.
5. **The Platform feedback model is presently score-only.** The seed stores five `{minScore,maxScore,text}` records per question ([seed](../../src/prisma/seed-scaling-up-full-assessment.ts#L943-L970)), and scoring resolves the first matching band using only the answer value ([scoring](../../src/src/lib/assessments/scoring.ts#L1604-L1618)). No phase/profile selector is present. The four live reports are evidence for a future model decision, not authorization to alter Edition 4.

## Primary-source baseline

### Controlled current Management profile to reproduce

Every value below must remain identical to the completed 11-report Management suite except the one employee input shown in bold.

| Control | Existing Management value | New isolation value | Acceptance rule |
| --- | --- | --- | --- |
| Company years | 10 | 10 | Exact match |
| Employee input rendered as permanent employees | 50 | **100** | The only changed profile answer |
| Third employee/temporary/freelance input | 0 | 0 | Exact match; do not copy the May-like value 15 |
| Leadership positions | Finance, HR, Operations, Marketing, Sales, IT, R&D all filled | Same | Exact same seven selections |
| Five revenue inputs | `10 / 12 / 15 / 18 / 22` | Same | Exact ordered values |
| Estimated ScaleUp score | 50 | 50 | Exact match |
| International controls | `20 / 2 / 5 / 3 / 8` | Same | Exact ordered values |
| External investor | No | No | Exact match |
| Partner/network strategy | No | No | Exact match |
| Entrepreneur years / active co-founders / age | `10 / 0 / 40` | Same | Exact match |
| Sector / market | Consultancy, research and other business services / B2B | Same | Exact match |
| Location / gender | United States, New York, 10001 / Other | Same | Exact match |
| Challenge text | `Controlled feedback audit.` | Same | Byte-for-byte match if the source permits |
| Scored answers | Uniform `0`, `5`, `7`, or `9` | Same score in matched run | All 61 report values must equal the run score |
| Non-report internet-sales slider | Same uniform score as that run | Same | Matched nuisance control; not one of Q01-Q61 |

The current Management PDF evidence prints: age 40, entrepreneur for 10 years, a 10-year-old company, no partner, 50 permanent employees, a 15-million current-year sales goal, and `Management team phase`. Representative source: `/Users/diushianstand/Downloads/ScalingUp_report_Wavex Verify_2026-08-20T03_07_13-04_00.pdf`, page 4. The complete Management text matrix is [esperto-feedback-current-live-matrix-2026-08-20.csv](esperto-feedback-current-live-matrix-2026-08-20.csv).

The current May-like Delegation PDFs print 100 permanent plus 15 temporary employees and `Delegation phase`; they deliberately changed several other inputs and are therefore a third comparison arm, not the isolation arm. Sources: `/Users/diushianstand/Downloads/ScalingUp_report_Wavex Verify_2026-08-20T07_34_24-04_00.pdf` through `...T07_37_58-04_00.pdf`; matrix: [esperto-feedback-delegation-live-matrix-2026-08-20.csv](esperto-feedback-delegation-live-matrix-2026-08-20.csv).

## Live-run protocol and stop rules

### Campaign controls

- Use four dedicated CEO/personal `ScaleUp2` / `enUS` test campaigns cloned from the same completed mail-disabled control.
- Automatic invitation, reminder, completion/confirmation, and notification mail must remain disabled before the participant opens the survey.
- Use direct participant tokens. Do not store tokens or login credentials in repository artifacts.
- Record campaign ID, capture time, report filename, and PDF SHA-256 in the closeout ledger. Campaign IDs are evidence identifiers; participant tokens are secrets and must be omitted.

### Pre-submission gate

For each score, record the visible input state before leaving each setup page. The phase interstitial must resolve to `phase 4 - Delegation` (or equivalent source wording). If employee value 100 does not resolve to Delegation under the otherwise-fixed Management profile, stop the report before submission and record a failed premise; do not silently change another profile field.

### Report acceptance gate

Each report must satisfy all of the following before comparison:

1. It is the expected 26-page personal `ScaleUp2` / `enUS` report.
2. Page 4 prints the same profile as the Management control except for 100 instead of 50 employees and the resulting Delegation phase wording.
3. It contains the canonical Q01-Q61 heading sequence exactly once and in order.
4. It contains exactly 61 `you` detail values, all equal to the requested uniform score, including conditionally hidden report questions at score 0.
5. It contains one nonblank feedback paragraph for every Q01-Q61 row.
6. It has a unique report/campaign identifier and a recorded full SHA-256.
7. No mail or Platform/Production mutation occurred.

Any missing row, heading mismatch, profile drift, wrong score, wrong phase, duplicate artifact, or incomplete report is `MISSING/STRUCTURAL` and fails the suite. Do not repair a failed run by substituting a May-like report.

## Required durable artifacts

After four reports pass, preserve:

1. `esperto-feedback-phase-isolation-live-matrix-2026-08-20.csv`: Q01-Q61 with source text at scores 0/5/7/9 plus distinct-text counts.
2. `esperto-feedback-phase-isolation-three-way-comparison-2026-08-20.csv`: one row per question/score (244 rows) with Management text, isolated-100 text, May-like Delegation text, the three equality flags, and the classification below.
3. A completed section in the main closeout containing exact report fingerprints, the fixed-control receipt, aggregate counts, and the next decision. Do not convert the talking guide into stakeholder copy yet.

Use two comparison keys while retaining original rendered text:

- `PRINT_EXACT`: Unicode normalization and whitespace/PDF line-wrap normalization only.
- `LEXICAL`: additionally ignore case and punctuation while preserving all words.

Classify every mismatch as `FORMAT_ONLY`, `SUBSTANTIVE`, or `MISSING/STRUCTURAL`. Only substantive differences count toward selector conclusions.

## Three-way classification

Let `M` be current Management (50), `I` the isolated current run (100; everything else Management), and `D` the current May-like Delegation profile. For each of 244 cells:

| Equality pattern | Classification | Meaning |
| --- | --- | --- |
| `M = I = D` | `ALL_EQUAL` | No profile sensitivity at this cell |
| `I = D ≠ M` | `HEADCOUNT_ASSOCIATED_REPRODUCED` | Changing the employee input reproduces the May-like Delegation text |
| `I = M ≠ D` | `OTHER_PROFILE_OR_INTERACTION` | Employee input alone does not reproduce the May-like difference |
| `M = D ≠ I` | `MASKED_HEADCOUNT_INTERACTION` | Employee input changes text, but another May-like input masks/reverses it |
| all three differ, or another equality shape | `THIRD_TEXT_OR_INTERACTION` | More than a two-library Management/Delegation model is possible |

The existing May-like comparison contains 46 differing cells across 21 questions. A complete headcount-associated reproduction requires all 46 to be `I = D ≠ M` and the other 198 to be `M = I = D`. Anything less is partial or interaction evidence and must be reported with exact question IDs, not summarized as a universal phase rule.

## Decision tree and next evidence step

```text
Four isolated 100-employee reports pass all gates
                 |
                 +--> Compare I vs M across 244 cells
                         |
                         +--> 0 substantive differences
                         |      Conclusion: 50 -> 100 alone does not select feedback
                         |      Next: isolate other May-like variables; leadership
                         |            configuration first, then company age, then
                         |            revenue/growth profile, using score 5 as the pilot
                         |
                         +--> substantive differences
                                |
                                +--> all 46 known D-vs-M differences reproduced,
                                |    no extra/third texts
                                |      Conclusion: feedback is headcount/phase-associated
                                |      Next: map the live P3/P4 boundary and run one
                                |            score-5 pair immediately below/above it,
                                |            plus a same-Delegation value at 100
                                |
                                +--> partial reproduction or extra/third texts
                                       Conclusion: multiple inputs or interactions select text
                                       Next: use the three-way ledger to isolate the smallest
                                             remaining variable set at score 5 before designing
                                             Platform content plumbing
```

### Why boundary mapping follows, rather than precedes, this suite

The local primary sources prove 50/Management and 100/Delegation but conflict with the repository's 50/Delegation rule. The approved four runs can therefore safely use 100 to cross a known source boundary without inventing the exact breakpoint. If the four reports show headcount sensitivity, the next smallest high-value experiment is:

1. Use the source phase interstitial to locate the current P3/P4 boundary while changing only headcount.
2. At score 5, complete one report immediately below and one immediately above that boundary.
3. Compare the above-boundary report with the same-profile 100-employee report.

If only the boundary pair changes and two Delegation values match, a phase/band key is supported. If two values inside Delegation differ, the selector is finer than phase and the Platform must not implement a simple `phase + score band` table.

## Implementation consequence gate

- **No difference:** do not add phase plumbing to feedback. Continue controlled variable isolation.
- **Clean phase/headcount-associated reproduction:** propose a forward-only profile-aware edition; do not overwrite Edition 4 or historical frozen results. The schema must preserve canonical question order, complete coverage at all supported selector states, and fail closed when the selector is absent/unrecognized.
- **Partial/interaction evidence:** do not choose either a score-only refresh or a phase-only library. Finish the minimal selector map first.

Existing submissions must remain frozen. The report builder consumes the stored `ScoreResult` and pinned campaign version and does not re-score or load mutable template content ([respondent-report model](../../src/src/lib/assessments/respondent-report.ts#L255-L304)).

Peers are outside this decision tree and must remain unchanged.

## Completed-run outcome — 2026-08-20

The approved four live controls passed every acceptance gate:

- Four dedicated mail-disabled campaigns completed at scores `0`, `5`, `7`, and `9`: `eFZpROVhb9`, `039GqTC7mW`, `pUTZjZszTk`, and `KDo05NjfaE` respectively. Participant tokens remain excluded from repository evidence.
- Each run changed only the employee input from `50` to `100`; the third employee/freelance input remained `0` and every other Step-1 Management control remained fixed.
- All four source interstitials and page-4 profiles resolved to phase 4 - Delegation.
- All four PDFs are 26-page personal `ScaleUp2` / `enUS` reports with the canonical Q01-Q61 sequence, 61/61 nonblank feedback paragraphs, and unique SHA-256 fingerprints.
- Invitation, reminder, and participant-confirmation switches were re-read for all four completed campaigns; every switch remained false.

The 244-cell lexical comparison produced the full-reproduction outcome predicted above: `198 ALL_EQUAL` and `46 HEADCOUNT_ASSOCIATED_REPRODUCED`, with zero other classifications. Isolated-100 equals May-like Delegation in 244/244 cells. At print-exact level, Q19 score 0 contributes one punctuation-only difference; it is `ALL_EQUAL` under the word-preserving lexical key.

Durable artifacts: [isolated live matrix](esperto-feedback-phase-isolation-live-matrix-2026-08-20.csv), [three-way text/equality ledger](esperto-feedback-phase-isolation-three-way-comparison-2026-08-20.csv), and [main closeout](jeff-feedback-response-change-closeout-2026-08-20.md#approved-step-3--one-variable-employeephase-isolation--completed).

The next evidence action is now the boundary-plus-sensitivity experiment: locate the live P3/P4 boundary, then compare score-5 reports immediately below/above it and at 100 employees. No Platform feedback, phase helper, production data, peer benchmark, Slack, or email change is authorized by this result.

## Source index

- Main feedback closeout and fixed-profile receipt: [jeff-feedback-response-change-closeout-2026-08-20.md](jeff-feedback-response-change-closeout-2026-08-20.md).
- Historical profile reconstruction and attribution limits: [esperto-may-profile-and-delegation-control-audit-2026-08-20.md](esperto-may-profile-and-delegation-control-audit-2026-08-20.md).
- Current Management matrix: [esperto-feedback-current-live-matrix-2026-08-20.csv](esperto-feedback-current-live-matrix-2026-08-20.csv).
- Current May-like Delegation matrix: [esperto-feedback-delegation-live-matrix-2026-08-20.csv](esperto-feedback-delegation-live-matrix-2026-08-20.csv).
- Existing 244-cell comparison: [esperto-feedback-delegation-vs-management-comparison-2026-08-20.csv](esperto-feedback-delegation-vs-management-comparison-2026-08-20.csv).
- Platform phase helper and its current asserted bands: [su-full-phase.ts](../../src/src/lib/assessments/su-full-phase.ts#L1-L158) and [tests](../../src/src/__tests__/lib/assessments/su-full-phase.test.ts).
- Platform feedback storage/resolution: [seed](../../src/prisma/seed-scaling-up-full-assessment.ts#L885-L979), [band guard](../../src/src/lib/assessments/su-full-feedback-bands.ts#L12-L148), and [scoring resolver](../../src/src/lib/assessments/scoring.ts#L1604-L1618).
- Frozen-report compatibility: [respondent-report.ts](../../src/src/lib/assessments/respondent-report.ts#L255-L304) and [Edition 4 production receipt](esperto-feedback-band-production-receipt-2026-08-14.md).
- Current Management report proving 50/Management: `/Users/diushianstand/Downloads/ScalingUp_report_Wavex Verify_2026-08-20T03_07_13-04_00.pdf`, page 4.
- Current report proving 100/Delegation: `/Users/diushianstand/Downloads/ScalingUp_report_Wavex Verify_2026-08-20T07_35_47-04_00.pdf`, page 4.
- Isolated report proving the Management profile with only `50 → 100` employees resolves to Delegation: `/Users/diushianstand/Downloads/ScalingUp_report_Wavex Verify_2026-08-20T08_06_45-04_00.pdf`, page 4.
