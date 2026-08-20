# Esperto feedback boundary and full-closeout specification — 2026-08-20

## Purpose and authority boundary

This note defines the next evidence gates for Jeff's feedback-response question. It is an experimental specification, not a report-content approval or an implementation plan. It authorizes no browser work by itself and no change to Esperto, Platform Production, a published assessment edition, peer benchmarks, Slack, or email.

The repository evidence already establishes three facts:

1. The controlled 50-employee profile is classified by current Esperto as phase 3 — Management, while the otherwise-identical 100-employee profile is classified as phase 4 — Delegation ([main closeout](jeff-feedback-response-change-closeout-2026-08-20.md)).
2. At scores `0`, `5`, `7`, and `9`, changing only `50 → 100` employees reproduces all 46 substantive Management-versus-Delegation feedback differences, introduces no new text, and matches the broader May-like Delegation control in 244/244 cells ([three-way ledger](esperto-feedback-phase-isolation-three-way-comparison-2026-08-20.csv)).
3. This proves headcount/phase-associated selection, but not a phase-only selector. Headcount is the changed input and phase is the derived observation.

The current Platform model cannot yet express that result. It stores five score ranges per question and selects the first matching range using only the respondent's answer value ([seed](../../src/prisma/seed-scaling-up-full-assessment.ts), [scoring resolver](../../src/src/lib/assessments/scoring.ts)). The Platform phase helper also currently maps `50` to Delegation, contrary to the live 50/Management evidence ([phase helper](../../src/src/lib/assessments/su-full-phase.ts), [boundary tests](../../src/src/__tests__/lib/assessments/su-full-phase.test.ts)). Those are decision gates, not permissions to edit code.

## Assumptions that must be challenged

- **Do not assume the repository's `50 = Delegation` boundary is current source truth.** The live report disproves that exact classification under the controlled profile.
- **Do not assume changing phase and changing headcount are distinguishable without a within-phase control.** The source does not expose a phase toggle independent of headcount.
- **Do not infer feedback equality from the P3/P4 interstitial narratives.** The source extract says the two tiles share body copy, but the report evidence already shows 46 feedback cells that differ ([source extract](../specs/v7.6/18j-su-full-source-extract.md), [main closeout](jeff-feedback-response-change-closeout-2026-08-20.md)).
- **Do not assume the four P3-visible score groups are universal across all five phases.** Only the controlled Management profile has been observed at every integer score `0–10`.
- **Do not equate five stored records with five distinct visible paragraphs.** The current Management suite renders `0–4`, `5–6`, `7–8`, and `9–10`; several questions intentionally have even fewer distinct paragraphs ([current live matrix](esperto-feedback-current-live-matrix-2026-08-20.csv)).
- **Do not use a successful P3/P4 test as evidence for P1, P2, or P5.** The canonical respondent flow can resolve any of the five phases.
- **Do not mix feedback text with Peers.** A feedback paragraph is selected report content associated with the respondent's answer and profile. A `Peers` number is the separately governed benchmark snapshot. No boundary or feedback report in this specification may overwrite or refresh peer values.

## Experiment A — exact live Management-to-Delegation boundary

### Controlled variable

Use the completed Management profile as the control and change only the integer employee input that printed as 50 permanent employees. Preserve company age, the third employee/freelance value, seven leadership selections, five revenue values, estimated score, international inputs, investor/network answers, entrepreneur profile, sector/market, location, challenge text, assessment variant, language, template version, and respondent type exactly as recorded in the [phase-isolation control specification](esperto-feedback-phase-isolation-control-spec-2026-08-20.md#controlled-current-management-profile-to-reproduce).

The phase observation is the source interstitial heading. A completed PDF is not required for a pure boundary probe, but every probe must retain a campaign/run identifier, capture time, integer headcount, observed heading, assessment/language, and fixed-control receipt. Credentials and participant tokens must never enter repository evidence.

### Search and acceptance rules

The direct current-source bracket is `50 = Management` and `100 = Delegation`.

1. Probe `51` first. If it resolves to Delegation, the exact integer transition is proven by the adjacent direct observations `50 = Management` and `51 = Delegation`; no integer exists between them.
2. If `51` remains Management, search the closed integer interval `52–100` for the first Delegation result. Bisection is acceptable only under the source model's ordered, contiguous, monotone phase premise. Preserve every probe result rather than only the winning value.
3. After a candidate boundary `N` is found, independently observe both adjacent values: `N−1 = Management` and `N = Delegation`, with all other controls fixed.
4. Reject the exact-boundary claim if either adjacent observation is unstable on repeat, if any probe skips or reverses phase order, if a non-headcount control drifts, or if an observed heading is ambiguous. A non-monotone result invalidates bisection; the safe next action is exhaustive enumeration of the unresolved interval or an authoritative Esperto rule/export.
5. The accepted statement must be narrowly worded: “Under the fixed CEO/personal `ScaleUp2` / `enUS` profile observed on the capture date, the first integer employee value producing Delegation was `N`.” It must not claim that every Esperto assessment variant or historical version shares the boundary.

### Boundary evidence gate

The boundary is accepted only when all of these are present:

- adjacent, fixed-control `N−1` and `N` observations;
- exact interstitial headings and capture timestamps;
- campaign/run IDs with secret tokens excluded;
- confirmation that mail automation remained disabled;
- an explicit comparison with the current Platform phase bands;
- a failed-premise record instead of an inferred value if any control cannot be verified.

## Experiment B — score-5 below / at / 100 sensitivity

After Experiment A yields `N`, complete accepted score-5 reports for the boundary-adjacent profiles and compare them with the existing controls:

| Symbol | Headcount | Required phase | Role in the comparison |
| --- | ---: | --- | --- |
| `M50` | 50 | Management | Existing fixed-profile baseline |
| `B` | `N−1` | Management | Immediately below the live boundary |
| `A` | `N` | Delegation | At the first live Delegation value |
| `D100` | 100 | Delegation | Existing same-profile, same-score control |

If `N = 51`, `B` and `M50` are the same headcount and the accepted existing score-5 artifact may be reused. `A` still requires a report. At every other boundary, both adjacent reports are required. Each artifact must pass the established 26-page personal-report, fixed-profile, canonical Q01–Q61 order, uniform score, 61/61 nonblank paragraph, unique SHA-256, and no-mail gates.

Retain rendered text and compare with two keys:

- `PRINT_EXACT`: Unicode plus whitespace/PDF line-wrap normalization only;
- `LEXICAL`: additionally ignore case and punctuation while preserving every word.

For each of 61 rows, classify the lexical relationship with this ordered rule set so overlapping failures cannot receive a favorable label:

| Required equality pattern | Classification | Interpretation |
| --- | --- | --- |
| missing text, profile mismatch, wrong score/phase, duplicate artifact | `MISSING_OR_STRUCTURAL` | The row/run is unusable and must not drive a model decision |
| structurally valid and `M50 ≠ B` while `A = D100` | `MANAGEMENT_HEADCOUNT_SENSITIVE` | Feedback varies within Management; phase-only selection fails |
| structurally valid and `M50 = B` while `A ≠ D100` | `DELEGATION_HEADCOUNT_SENSITIVE` | Feedback varies within Delegation; phase-only selection fails |
| structurally valid and both within-phase equalities fail | `MULTI_HEADCOUNT_SENSITIVE` | Both tested phases vary internally; phase-only selection fails |
| `M50 = B = A = D100` | `ALL_EQUAL` | This score-5 cell is not phase-sensitive |
| `M50 = B ≠ A = D100` | `PHASE_BAND_SUPPORTED` | Stable within both tested phases and changes at the phase boundary |
| any remaining equality pattern | `FINER_SELECTOR_OR_INTERACTION` | Phase alone is insufficient, the boundary is unstable, or a control/source version drifted |

Record print-only differences separately as `FORMAT_ONLY`; they do not count as content-selector changes.

### Evidence required to support `phase + score band`

For the tested P3/P4 score-5 slice, the model is supported only if:

1. `M50 = B` lexically for 61/61 rows;
2. `A = D100` lexically for 61/61 rows;
3. the `B → A` substantive difference set exactly reproduces the known score-5 inventory (currently 11/61 differences), with no extra or missing rows;
4. every structural and profile gate passes; and
5. the exact live boundary is reconciled before the Platform helper is used as a selector.

That result supports a **P3/P4 working model at score 5**, strengthened by the existing P3-versus-P4 observations at representative scores `0`, `5`, `7`, and `9`. It does not alone justify a universal five-phase model, nor does it prove that all phases share the P3 score thresholds.

If either within-phase equality fails, do not implement a phase-only selector. Request an authoritative Esperto rule/export or map the smaller headcount transition intervals exposed by the failing questions.

## Does full closeout require phases 1, 2, and 5?

**Yes, if “closeout” means canonical feedback plumbing for every respondent rather than only resolving the P3/P4 discrepancy.** Current-source feedback exists for Management and Delegation only. Pioneering, Organization, and Standardization are reachable phases in the source taxonomy and Platform helper, so omitting them would turn an observed two-phase rule into an unmarked product assumption.

There are two honest closure levels.

### Level 1 — minimum current phase-content matrix

Capture the four observed visible-group anchors `0`, `5`, `7`, and `9` for each missing phase, holding every non-headcount control fixed:

| Phase | Source-validated representative headcount | New scores | New reports | Feedback cells |
| --- | ---: | --- | ---: | ---: |
| P1 — Pioneering | Validate live before use; source example is 3 | `0, 5, 7, 9` | 4 | 244 |
| P2 — Organization | Validate live before use; source example is 15 | `0, 5, 7, 9` | 4 | 244 |
| P5 — Standardization | Validate live before use; source example is 200 | `0, 5, 7, 9` | 4 | 244 |
| **Additional total** | — | — | **12** | **732** |

Together with the accepted P3 and P4 anchors, this yields `5 phases × 4 anchors × 61 questions = 1,220` current-source phase/anchor cells. The workbook-derived examples `3`, `15`, and `200` are starting candidates, not substitutes for a current live interstitial confirmation ([source extract](../specs/v7.6/18j-su-full-source-extract.md)).

This 12-report addition is the smallest matrix that can populate a four-anchor phase-aware content library. It is **not** proof that scores `1–4`, `6`, `8`, and `10` behave identically in every phase. Using it for implementation would require an explicit approved assumption that the P3-visible score ranges are global.

### Level 2 — evidence-complete answer to Jeff's every-integer question

To close the universal `0–10` behavior without borrowing P3 thresholds for other phases, require an 11-score suite in every phase:

- P3 already has 11/11 score reports.
- P4 has four anchors and needs seven scores: `1`, `2`, `3`, `4`, `6`, `8`, `10`.
- P1, P2, and P5 each need all eleven scores: 33 reports.
- Therefore the strict additional matrix is **40 reports**, producing a complete `5 phases × 11 scores × 61 questions = 3,355` current-source cell ledger when combined with the 15 existing phase/score reports.

Run this efficiently in two gates: first the 12 Level-1 reports; if they pass, add the remaining 28 reports. This preserves a stop point if any missing phase reveals a finer selector or different score transition pattern.

## Outcome-based next steps

| Outcome | Next best foot forward |
| --- | --- |
| No exact stable boundary | Do not change phase or feedback plumbing. Enumerate the unresolved interval or obtain the current Esperto phase rule/export. |
| Exact boundary; `M50 = B` and `A = D100` for 61/61 at score 5 | Treat `phase + score band` as the supported P3/P4 hypothesis. Reconcile the phase helper boundary, then continue the missing-phase matrix. |
| Any same-phase score-5 mismatch | Reject phase-only plumbing. Determine whether headcount ranges, another hidden profile input, or source-version state selects feedback. |
| P1/P2/P5 four-anchor runs are stable and phase-specific | Continue the strict integer suite for evidence-complete closeout, or explicitly record stakeholder acceptance of global score thresholds before a narrower implementation. |
| A missing phase shares another phase's text at every observed cell | Preserve an explicit phase mapping and provenance even if storage is deduplicated; equality is not evidence that the phase can be omitted. |
| Score transitions differ by phase | Model score ranges inside each phase rather than one global band table. Complete every-integer capture for the affected phases. |
| All five 11-score suites are structurally valid and internally deterministic | Freeze a versioned `phase × score × question` evidence ledger, reconcile phase computation, specify a forward-only phase-aware feedback edition, and verify frozen historical reports remain unchanged before any release decision. |

## Execution receipt — 2026-08-20

### Experiment A completed — exact P3/P4 boundary

The controlled `51`-employee probe resolved to **“You’ve reached phase 4 - Delegation phase.”** The accepted adjacent source observations are therefore:

- `50` permanent employees = phase 3 — Management (existing fixed-profile control);
- `51` permanent employees = phase 4 — Delegation (campaign `QHj5zMW6MA`);
- all other setup, revenue, estimated-score, international, investor/network, entrepreneur, sector, location, assessment, language, and respondent controls remained fixed;
- all invitation, reminder, and participant-confirmation switches were false before and after the completed run.

Because `50` and `51` are adjacent integers, the first integer Delegation value under this fixed current-source profile is **51**. This directly contradicts the Platform helper's current `50 = Delegation` boundary and upgrades that mismatch from a suspected discrepancy to a measured source-fidelity defect. It does not claim that historical Esperto versions or other assessment variants use the same boundary.

### Experiment B completed — score-5 same-phase sensitivity

The `51`-employee report is a 26-page `ScaleUp2` / `enUS` personal report with 61/61 score-5 detail rows and page 4 printing 51 permanent employees and Delegation phase. Its PDF SHA-256 is `7972a1ea25b292277c882d04e7d6ccb3a98b62785e2190d5890d987e84e51d76`.

The complete detail-section extraction (PDF pages 8–26) for `51` employees is byte-identical to the existing `100`-employee Delegation score-5 extraction. At question level:

- `A51 = D100` for 61/61 feedback paragraphs;
- `M50 = B50` by construction because the live boundary is adjacent and the accepted existing 50-employee Management report is the below-boundary report;
- `B50 → A51` changes exactly the same 11 score-5 questions already present in the P3/P4 comparison, with no additional or missing difference;
- the remaining 50/61 paragraphs are shared across Management and Delegation.

This satisfies every Experiment B gate. For P3/P4 at score 5, current Esperto is consistent with a **phase + score-band** selector and shows no finer headcount dependence inside Delegation between 51 and 100.

### Level 1 completed — all five current phases at four score anchors

Twelve additional no-email CEO/personal campaigns were completed using only the representative employee count to select the missing phase:

| Phase | Headcount | Live heading | Scores | Reports | Feedback rows |
| --- | ---: | --- | --- | ---: | ---: |
| P1 | 3 | Pioneering | `0, 5, 7, 9` | 4 | 244/244 |
| P2 | 15 | Organization | `0, 5, 7, 9` | 4 | 244/244 |
| P5 | 200 | Standardization | `0, 5, 7, 9` | 4 | 244/244 |
| **New total** | — | — | — | **12** | **732/732** |

Every PDF has 26 pages, the canonical Q01–Q61 order, the requested uniform score, a nonblank paragraph for every question, a unique SHA-256 fingerprint, and the expected phase printed on page 4. Together with the accepted P3/P4 anchors, the five-phase anchor matrix contains `5 × 4 × 61 = 1,220` valid cells. The durable source-text ledger is [the five-phase anchor comparison](esperto-feedback-five-phase-anchor-comparison-2026-08-20.csv); campaign IDs, local PDFs, hashes, headings, and mail receipts are in [the run manifest](esperto-feedback-boundary-and-five-phase-anchor-manifest-2026-08-20.csv).

Lexical results across the five phases:

| Score | P1→P2 differences | P2→P3 | P3→P4 | P4→P5 |
| ---: | ---: | ---: | ---: | ---: |
| 0 | 26 | 28 | 19 | 0 |
| 5 | 20 | 22 | 11 | 1 |
| 7 | 17 | 12 | 6 | 2 |
| 9 | 13 | 14 | 10 | 2 |

- 122/244 question/score positions are phase-sensitive; 122/244 are shared across all five phases.
- 42/61 questions are phase-sensitive at one or more tested score anchors.
- P4 and P5 are similar but not interchangeable: they differ in 0, 1, 2, and 2 questions at scores 0, 5, 7, and 9 respectively.
- This rejects both a global score-only catalogue and any shortcut that collapses P4/P5 merely because their score-0 text happens to match.

### Level 2 completed — five phases × every integer score

The 28 remaining mail-disabled campaigns were resumed and completed for scores `1, 2, 3, 4, 6, 8, 10` in P1, P2, P4, and P5. All PDFs were downloaded and rechecked after completion. Combined with the accepted controls, the final matrix contains **55 reports and 3,355/3,355 valid feedback cells**.

Every report passed the 26-page, fixed-headcount/phase, canonical Q01–Q61, uniform-score, nonblank-feedback, unique-SHA-256, and post-completion no-mail gates. The durable evidence is the [55-report manifest](esperto-feedback-five-phase-full-manifest-2026-08-20.csv), [3,355-cell matrix](esperto-feedback-five-phase-full-matrix-2026-08-20.csv), and [305-row within-band summary](esperto-feedback-five-phase-band-summary-2026-08-20.csv).

All five phases independently produced exact lexical equality inside `0–4`, `5–6`, `7–8`, and `9–10`; there were zero violations in any phase or question. Transition counts vary by phase because some questions reuse text across adjacent bands, but the band boundaries themselves do not vary. The evidence-complete selector is therefore **`phase × score band × question`**.

The current-source payload is frozen in [the 1,220-row phase-band catalogue](esperto-feedback-five-phase-band-catalogue-2026-08-20.csv). Compared with current Edition 4 selection, 384/1,220 deduplicated phase-band/question records and 1,183/3,355 score-expanded cells change lexically; see [the Edition 4 impact summary](esperto-feedback-edition4-vs-five-phase-summary-2026-08-20.csv).

### All live phase boundaries completed

Additional adjacent fixed-profile probes proved that the workbook/source-extract bands are stale by one employee at every transition:

- `8 = P1`, `9 = P2`;
- `25 = P2`, `26 = P3`;
- `50 = P3`, `51 = P4`;
- `150 = P4`, `151 = P5`.

Thus current live Esperto uses `P1 1–8`, `P2 9–25`, `P3 26–50`, `P4 51–150`, and `P5 151+` under the fixed current CEO/personal `ScaleUp2` / `enUS` profile. Every probe campaign retained disabled invitation, reminder, and confirmation switches. Campaign IDs, aliases, local creation times, headings, and roles are in [the live boundary manifest](esperto-feedback-live-phase-boundary-manifest-2026-08-20.csv).

## Recommended dependency order

1. **Completed:** exact P3/P4 boundary and score-5 `M50 / B / A / D100` comparison.
2. **Completed:** 12-report P1/P2/P5 anchor matrix.
3. **Completed:** 55-report, 3,355-cell every-integer ledger and four-band proof for every phase.
4. **Completed:** adjacent live observations at all four phase transitions; all current Platform boundaries are one employee early.
5. **Next approval gate:** design the phase-aware content schema and correct phase computation together; publish only through a forward-only edition with frozen-report regression coverage and explicit default-OFF activation.
6. Keep the completed Peers benchmark snapshot unchanged throughout. Any benchmark refresh is a separate research and approval track.

## Primary-source index

- [Jeff feedback-response closeout](jeff-feedback-response-change-closeout-2026-08-20.md)
- [Phase-isolation control specification](esperto-feedback-phase-isolation-control-spec-2026-08-20.md)
- [Phase-isolation live matrix](esperto-feedback-phase-isolation-live-matrix-2026-08-20.csv)
- [Phase-isolation three-way comparison](esperto-feedback-phase-isolation-three-way-comparison-2026-08-20.csv)
- [Current Management matrix](esperto-feedback-current-live-matrix-2026-08-20.csv)
- [Current May-like Delegation matrix](esperto-feedback-delegation-live-matrix-2026-08-20.csv)
- [Five-phase anchor comparison](esperto-feedback-five-phase-anchor-comparison-2026-08-20.csv)
- [Boundary and anchor run manifest](esperto-feedback-boundary-and-five-phase-anchor-manifest-2026-08-20.csv)
- [Full five-phase run manifest](esperto-feedback-five-phase-full-manifest-2026-08-20.csv)
- [Full 3,355-cell matrix](esperto-feedback-five-phase-full-matrix-2026-08-20.csv)
- [Five-phase band summary](esperto-feedback-five-phase-band-summary-2026-08-20.csv)
- [Implementation-ready phase-band catalogue](esperto-feedback-five-phase-band-catalogue-2026-08-20.csv)
- [Edition 4 impact summary](esperto-feedback-edition4-vs-five-phase-summary-2026-08-20.csv)
- [Live phase-boundary manifest](esperto-feedback-live-phase-boundary-manifest-2026-08-20.csv)
- [Scaling Up Full source extract](../specs/v7.6/18j-su-full-source-extract.md)
- [Platform phase helper](../../src/src/lib/assessments/su-full-phase.ts) and [boundary tests](../../src/src/__tests__/lib/assessments/su-full-phase.test.ts)
- [Platform feedback seed](../../src/prisma/seed-scaling-up-full-assessment.ts), [feedback-band guard](../../src/src/lib/assessments/su-full-feedback-bands.ts), and [score-only resolver](../../src/src/lib/assessments/scoring.ts)
- [Frozen-report construction](../../src/src/lib/assessments/respondent-report.ts) and [Edition 4 production receipt](esperto-feedback-band-production-receipt-2026-08-14.md)
