# Jeff feedback-response change closeout — 2026-08-20

## Purpose and operating boundary

This is the single talking guide for the remaining question: whether the currently published Scaling Up Full **feedback text selected at each score** still matches current Esperto behavior. It is deliberately separate from the already-captured **Peers** benchmark snapshot. It is an internal evidence source of truth and is **not yet approved stakeholder copy**.

The user approved the controlled current-Esperto audit on 2026-08-20. The audit used dedicated CEO-version test campaigns with automatic invitations, reminders, confirmations, and notifications disabled. It did not use or mutate Platform Production, refresh peer benchmarks, or send email, Slack, or any other external message. No Platform content change is authorized by this guide.

## What Jeff asked for

At 3:09–4:22, Jeff asked to retain the report flow of question, two bars, and the answer below them; that is a presentation preference, not evidence that a peer number and a feedback paragraph have the same source or update cycle. [Aug. 13 transcript, lines 53–69](/Users/diushianstand/.codex/attachments/5fe6f2b3-c321-483e-a321-fda167a8e52e/pasted-text.txt).

At 4:59–8:40, the discussion explicitly split the questions:

1. Where does each `Peers` value live, and is it an external/static value or a current-company value? Jeff said he did not know and proposed testing. [5:11–7:22, lines 78–103](/Users/diushianstand/.codex/attachments/5fe6f2b3-c321-483e-a321-fda167a8e52e/pasted-text.txt)
2. For a question scored 1 through 10, what feedback text/threshold does the source select? Jeff requested an answer-level sweep to identify the thresholds. [8:01–8:40, lines 114–121](/Users/diushianstand/.codex/attachments/5fe6f2b3-c321-483e-a321-fda167a8e52e/pasted-text.txt)

The second item is the **feedback-text concern** addressed here. It must not be summarized as “redo the peer benchmarks.”

## Status at a glance

| Track | Done evidence | Current conclusion | Remaining action |
| --- | --- | --- | --- |
| Feedback text and score bands | Completed 11-report Management suite, four May-like Delegation controls, and four one-variable 100-employee controls: 1,159 rendered feedback observations | Score selects one of four visible groups (`0–4`, `5–6`, `7–8`, `9–10`). Changing only employee count from 50/Management to 100/Delegation reproduces all 46 substantive Delegation-vs-Management differences and no others; isolated text equals May-like Delegation 244/244. | Do not change Platform content yet. Map the live Management/Delegation boundary and distinguish phase-band selection from finer headcount selection before designing feedback plumbing. |
| Peer benchmarks | Controlled Q01 0–10 variation plus company-profile/phase controls; same ordered 61-value vector in the reported controls | Governed external snapshot, not current-team mean, within the tested source conditions | No peer re-test is part of Step 1; revisit only under a separately approved benchmark-refresh decision |
| Platform behavior | Edition 4 receipt, code safeguards, and tests | Existing campaigns retain their pinned Edition 3; future campaigns resolve active Edition 4; stored submissions render from their frozen result and pinned version | Do not change Platform behavior based on audit observations without a new explicit decision gate |

Primary evidence: [feedback methodology](esperto-feedback-text-and-thresholds-2026-08-14.md), [feedback catalogue](esperto-feedback-text-catalogue-2026-08-14.csv), [Edition 4 production receipt](esperto-feedback-band-production-receipt-2026-08-14.md), [peer controlled-source findings](esperto-peer-benchmark-sources.md), [peer snapshot and ledger](esperto-peer-benchmark-snapshot-2026-08-14.md), and [production changelog receipt](../../plans/CHANGELOG.md#su-full-feedback-bands-published).

## What is already done

### Feedback text (not peer data)

- The historical capture contains five stored feedback records for each of the 61 scored questions: uniform source scores `0`, `3`, `5`, `7`, and `10`; 305 records total and no blanks. The catalogue is the machine-readable record. [Methodology](esperto-feedback-text-and-thresholds-2026-08-14.md) and [catalogue](esperto-feedback-text-catalogue-2026-08-14.csv).
- Q01 (`Effective recruitment process`) was then directly observed at every integer 0–10. Its visible ranges were `0–4`, `5–6`, `7–8`, and `9–10`; Q01 levels 0 and 3 use identical text, so that result does not collapse the stored five-level library. [Methodology](esperto-feedback-text-and-thresholds-2026-08-14.md).
- The Edition 4 correction changed only the two upper ranges, from `7–9 / 10` to `7–8 / 9–10`, preserving all 305 text records. The guarded implementation validates 61 scored questions, five complete records each, a total of 305, and rejects mixed/unrecognized shapes ([implementation](../../src/src/lib/assessments/su-full-feedback-bands.ts#L12-L138); [tests](../../src/src/__tests__/lib/assessments/su-full-feedback-bands.test.ts)).

### Peer benchmarks (a completed, separate track)

- Eleven otherwise-identical reports varying Q01 from 0 through 10 produced the same ordered 61-value Peer vector; the three company-profile controls also retained all 61 values even when the large profile reached another phase screen. This supports a governed external snapshot—not a claim about Esperto's undisclosed cohort formula or refresh schedule. [Controlled-source findings](esperto-peer-benchmark-sources.md) and [evidence ledger](esperto-peer-benchmark-snapshot-2026-08-14.md).
- The executable Q01–Q61 snapshot is versioned as `2026-08-14.esperto-controlled-v1` and is tested for exact canonical order, uniqueness, 0–10 range, and seed parity ([source](../../src/src/lib/assessments/su-full-question-benchmarks.ts#L1-L94); [tests](../../src/src/__tests__/lib/assessments/su-full-question-benchmarks.test.ts)).

## Evidence boundary: what the current implementation does and does not claim

| Claim | Status | Evidence limit |
| --- | --- | --- |
| Each question has source feedback captured at 0, 3, 5, 7, and 10 | Directly observed in the May uniform reports | The May suite is mixed-profile: only score 5 is Delegation; scores 0, 3, 7, and 10 are Pioneering. It cannot be treated as one canonical phase profile. |
| Every integer 0–10 has now been observed for every rendered feedback row | Directly observed on 2026-08-20: 671/671 nonblank rows | The live Management-phase suite proves visible text behavior for that controlled profile. It does not prove that the same wording is used in every organizational phase. |
| The five stored Edition 4 records always produce five visibly different paragraphs | Disproved as a visible-output claim | The live suite produced at most four distinct paragraphs per question; six questions produced three, and Q50 produced two. Duplicate stored records may still exist behind identical rendered text. |
| Q01 top feedback begins at 9 | Directly observed | This is why Edition 4 corrected the upper boundary. |
| Peer values are current-company averages | Not supported | Controlled evidence instead supports an external, governed snapshot in the tested reports. |
| The peer snapshot will never change | Not claimed | Esperto's cohort rules and refresh schedule remain unknown. |
| Existing reports retroactively change when a later template changes | Not the intended behavior | A stored report uses its frozen ScoreResult and its campaign's pinned published template version; it does not re-score or load mutable template content ([report model](../../src/src/lib/assessments/respondent-report.ts#L145-L260)). |

## Active Edition 4 and campaign pinning/frozen behavior

Edition 4 (`cmst26ix40002rx04ybh20vvy`) was published on 2026-08-14 with the corrected five-band shape. The receipt records an exact feedback-text match to Edition 3 and says the five existing campaigns remain pinned to immutable Edition 3 while future campaigns resolve Edition 4. It also records that no response, answer, invitation, email, peer benchmark, schema, migration, or environment flag changed in that operation. [Production receipt](esperto-feedback-band-production-receipt-2026-08-14.md) and [changelog closeout](../../plans/CHANGELOG.md#su-full-feedback-bands-published).

For talking purposes: **a source audit is evidence gathering, not permission to rewrite historic reports.** The report model takes frozen submission results and the campaign-pinned version, and deliberately neither re-scores nor loads mutable template content ([respondent report](../../src/src/lib/assessments/respondent-report.ts#L255-L260)).

## Approved Step 1 — controlled current-Esperto feedback audit — completed

**Objective:** replace the remaining question-by-question inference with a controlled current-source observation, while keeping the peer benchmark track out of scope.

**Method:** generate eleven controlled current Esperto reports. For each report, set all 61 scored questions to one uniform integer score: `0`, `1`, `2`, `3`, `4`, `5`, `6`, `7`, `8`, `9`, and `10`. Keep all non-score setup inputs fixed. Capture the rendered feedback text for Q01–Q61 in each output.

**Comparison count:** `11 reports × 61 questions = 671` current-source question/score comparisons.

**Completed:** 2026-08-20. All 11 reports are 26-page Esperto `ScaleUp2` / `enUS` personal reports. Every report yielded the same ordered Q01–Q61 heading sequence, exactly 61 `you` detail rows, and exactly one nonblank feedback paragraph per row. The generated current-live matrix is [esperto-feedback-current-live-matrix-2026-08-20.csv](esperto-feedback-current-live-matrix-2026-08-20.csv).

### Fixed live profile

- CEO-version respondent; no team respondents; no mail automation.
- Company age 10 years; 50 employees; 0 freelancers; Finance, HR, Operations, Marketing, Sales, IT, and R&D leadership positions marked filled.
- Revenue values held at 10 / 12 / 15 / 18 / 22 million; estimated ScaleUp Score 50. The source classified this profile as **phase 3 — Management phase**.
- International/background controls held fixed: 20% foreign revenue; 2 countries with branches; delivery to 5 countries; goals of 3 / 8 countries; no external investors; no partner/network strategy.
- Entrepreneur/background controls held fixed: 10 entrepreneurial years; 0 active co-founders; consultancy/research/business-services sector; B2B; United States / New York / 10001; age 40; challenge text `Controlled feedback audit.`
- The non-report internet-sales slider was set to the same uniform score as each run. It is not one of the 61 feedback rows.

At uniform score 0, Esperto conditionally hides four dependent input sliders—Q11 and Q56–Q58—because their prerequisite core-value/goal answers are zero. The generated report still renders all 61 feedback rows. At scores 1–10, all 61 report sliders are directly exposed.

**Controls:**

- Record source report ID/URL or a secure artifact fingerprint, capture time, assessment/language, and the fixed setup profile.
- Validate exactly 61 scored question labels and exactly one feedback selection per question per report before comparing text.
- Compare canonicalized text using Unicode normalization with case, whitespace, punctuation, and PDF line-wrap differences ignored while preserving every word. Retain the original rendered text/artifact for punctuation and human editorial review.
- Do not infer or capture peer values as an acceptance condition; they are incidental output for this Step 1 and must not be used to overwrite the governed benchmark snapshot.
- Stop and record a data-quality failure if a report is incomplete, its labels do not map one-to-one to Q01–Q61, or the source behavior cannot be reliably extracted.

### Results

| Score | Edition 4 lookup range | Report | Q01–Q61 extracted | Exact normalized matches to historical catalogue | Historical non-matches, not yet classified | Current live visible group | Data-quality note | PDF SHA-256 prefix |
| ---: | --- | --- | ---: | ---: | ---: | --- | --- | --- |
| 0 | 0–2 | 1 | 61/61 | 24 | 37 | 0–4 | Four dependent inputs hidden; all 61 report rows present | `e7c4f8af5fc2` |
| 1 | 0–2 | 1 | 61/61 | 24 | 37 | 0–4 | None | `8a5a41da5709` |
| 2 | 0–2 | 1 | 61/61 | 24 | 37 | 0–4 | None | `8dd9223a439b` |
| 3 | 3–4 | 1 | 61/61 | 25 | 36 | 0–4 | None | `6c5cb5205226` |
| 4 | 3–4 | 1 | 61/61 | 25 | 36 | 0–4 | None | `bf2ef1f07e51` |
| 5 | 5–6 | 1 | 61/61 | 50 | 11 | 5–6 | None | `648019071b98` |
| 6 | 5–6 | 1 | 61/61 | 50 | 11 | 5–6 | None | `9020db2a79dd` |
| 7 | 7–8 | 1 | 61/61 | 39 | 22 | 7–8 | None | `019ae7878d5d` |
| 8 | 7–8 | 1 | 61/61 | 39 | 22 | 7–8 | None | `1a30bc17272d` |
| 9 | 9–10 | 1 | 61/61 | 39 | 22 | 9–10 | None | `174185899ca6` |
| 10 | 9–10 | 1 | 61/61 | 39 | 22 | 9–10 | None | `b763e44f90ef` |
| **Total** | **671 comparisons** | **11** | **671/671** | **378/671** | **293/671** | — | **No extraction failures or blank feedback** | — |

“Historical non-match” is intentionally not called “stale wording.” The May uniform reports used a 15-year company with 100 permanent plus 15 temporary employees and were classified as **Delegation phase**. The current suite used a Management-phase profile. Therefore a mismatch may be phase/profile-dependent wording, a later source revision, or both.

### Observed visible transitions

- Scores `0`, `1`, `2`, `3`, and `4` produced identical normalized feedback for **all 61 questions**. There were zero changes at the `2 → 3` boundary.
- Scores `5–6`, `7–8`, and `9–10` were internally identical for all 61 questions. There were zero within-pair violations.
- `4 → 5` changed 54 questions. These seven did not change: Q10, Q21, Q33, Q39, Q45, Q50, and Q60.
- `6 → 7` changed all 61 questions.
- `8 → 9` changed 60 questions. Q50 did not change.
- Resulting distinct-paragraph counts: 54 questions have four visible texts; Q10, Q21, Q33, Q39, Q45, and Q60 have three; Q50 has two.

### Discrepancy classification

Under that word-preserving canonicalization, the current Management output exactly matched 177/305 historical source-stop cells. A similarity screen flagged 124/305 cells across 38 questions for substantive human review; the rest of the non-exact cells were closer wording/layout variants. This was a triage aid, not a content verdict, because the historical source stops used different profiles.

There is no extraction discrepancy: all 671 Management cells, 244 May-like Delegation cells, and 244 isolated-100 cells are present in their companion matrices. There is also no current-suite within-band inconsistency. The resolved provenance finding is that feedback is **not score-only**; the phase-driving employee input affects selected wording.

## Approved Step 2 — current May-like Delegation control — completed

**Method:** four dedicated, mail-disabled CEO/personal campaigns at uniform scores `0`, `5`, `7`, and `9`. The fixed profile used a 15-year company, 100 permanent plus 15 temporary employees, six filled leadership roles (Finance, HR, Operations, Marketing, Sales, IT), revenue values `22 / 25 / 28 / 30 / 35`, estimated score `47`, age `60`, 20 entrepreneurial years, two active partners, the same business-services sector, and the visible May international values. Esperto classified every run as **phase 4 - Delegation**. Production, Platform feedback data, peer benchmarks, Slack, and email were not changed.

All four reports are 26-page `ScaleUp2` / `enUS` personal reports with the same ordered Q01-Q61 headings and 61/61 nonblank feedback paragraphs. The source text is preserved in [the Delegation live matrix](esperto-feedback-delegation-live-matrix-2026-08-20.csv); the 244-cell boolean ledger is [the Delegation-vs-Management comparison](esperto-feedback-delegation-vs-management-comparison-2026-08-20.csv).

### Step 2 result

| Uniform score | Delegation rows | Exact word-preserving matches to current Management | Profile-dependent differences | PDF SHA-256 prefix |
| ---: | ---: | ---: | ---: | --- |
| 0 | 61/61 | 42/61 | 19 | `2f742648a00e` |
| 5 | 61/61 | 50/61 | 11 | `270449d0cbaf` |
| 7 | 61/61 | 55/61 | 6 | `006bed03fcf1` |
| 9 | 61/61 | 51/61 | 10 | `24db4a21dca0` |
| **Total** | **244/244** | **198/244** | **46 across 21 unique questions** | — |

The strongest matched historical control is score 5. The current Delegation score-5 PDF reproduces the May report-visible profile and its Q01-Q61 feedback paragraphs match the original May Delegation score-5 PDF **61/61 print-exact after whitespace/line-wrap normalization**. Therefore the earlier Management-vs-May mismatch is not evidence of simple three-month wording drift. It is evidence that the feedback selected by Esperto changes with respondent/company profile inputs.

That result does **not yet prove phase is the only selector**. The May-like Delegation profile also differs from the Management control in company age, employee count, leadership roles, revenue history, entrepreneur age/experience, partners, and international inputs. The next experiment must change only the phase-driving input.

## Approved Step 3 — one-variable employee/phase isolation — completed

**Method:** clone the completed Management control and change only the employee input from `50` to `100`. Company age remained 10, the third employee/freelance input remained 0, all seven leadership roles remained filled, revenues remained `10 / 12 / 15 / 18 / 22`, estimated score remained 50, and every international/general control remained identical to Step 1. Four mail-disabled campaigns were completed at uniform scores `0`, `5`, `7`, and `9`. Every source interstitial and page-4 profile resolved to **phase 4 - Delegation**. The invitation, reminder, and participant-confirmation switches were re-read on every campaign after completion and all remained false.

All four reports passed the 26-page personal-report, canonical Q01-Q61 order, 61/61 nonblank feedback, fixed-profile, and unique-fingerprint gates defined in the [phase-isolation control specification](esperto-feedback-phase-isolation-control-spec-2026-08-20.md). Source text is preserved in the [isolated live matrix](esperto-feedback-phase-isolation-live-matrix-2026-08-20.csv), and the complete three-way text/equality ledger is [the 244-cell comparison](esperto-feedback-phase-isolation-three-way-comparison-2026-08-20.csv).

### Step 3 result

| Uniform score | Campaign ID | Isolated rows | Exact lexical matches to Management | Substantive employee/phase-associated differences | Exact matches to May-like Delegation | PDF SHA-256 prefix |
| ---: | --- | ---: | ---: | ---: | ---: | --- |
| 0 | `eFZpROVhb9` | 61/61 | 42/61 | 19 | 61/61 | `f29b1726a948` |
| 5 | `039GqTC7mW` | 61/61 | 50/61 | 11 | 61/61 | `81eed415394a` |
| 7 | `pUTZjZszTk` | 61/61 | 55/61 | 6 | 61/61 | `4bb9aecf3ea9` |
| 9 | `KDo05NjfaE` | 61/61 | 51/61 | 10 | 61/61 | `b0066bb7b107` |
| **Total** | — | **244/244** | **198/244** | **46 across 21 questions** | **244/244** | — |

The three-way result has only two lexical classifications:

- `198` cells: `Management = isolated-100 = May-like Delegation`.
- `46` cells: `isolated-100 = May-like Delegation ≠ Management`.
- `0` cells: partial reproduction, isolated-only text, other-profile interaction, missing row, or structural failure.

At print-exact level there are 47 differences; Q19 score 0 differs only because the Delegation text ends with a period while the Management extraction does not. Word-preserving comparison therefore correctly counts 46 substantive differences.

This is a complete reproduction of the known difference inventory. Under the tested controls, changing only the employee input is sufficient to select the same feedback library as the much broader May-like Delegation profile. The precise safe conclusion is **headcount/phase-associated selection**. It is not yet proven whether Esperto keys directly on the derived phase, on a headcount band, or on a finer headcount rule.

### Newly exposed Platform contradiction

Current Esperto directly classifies the fixed 50-employee control as Management and the otherwise-identical 100-employee control as Delegation. The Platform helper currently maps `50` to Delegation ([phase helper](../../src/src/lib/assessments/su-full-phase.ts#L148-L158); [boundary test](../../src/src/__tests__/lib/assessments/su-full-phase.test.ts#L53-L71)). This is now a documented source-fidelity discrepancy. It is not authorization to change code: the exact current Esperto boundary must be measured first.

## Assessment and recommended next step

1. **Completed evidence-quality gate.** Nineteen attributable reports, 1,159/1,159 nonblank feedback rows, exact Q01-Q61 order, expected 26-page structure, and distinct PDF fingerprints passed.
2. **Completed historical-drift gate at the only valid matched stop.** Current May-like Delegation score 5 equals May Delegation score 5 at 61/61 feedback paragraphs. Do not describe the issue to Jeff as a simple stale-text refresh.
3. **Completed one-variable gate.** Changing only 50 → 100 employees reproduces all 46 substantive differences, introduces no additional text, and matches May-like Delegation 244/244.
4. **Recommended next action: boundary plus same-phase sensitivity.** Locate the current live Management/Delegation boundary by changing only headcount and observing the phase interstitial. Then complete score-5 reports immediately below and above that boundary, plus the already-controlled 100-employee Delegation report. If the two Delegation values match, a `phase + score band` selector is supported; if they differ, the selector is finer than phase.
5. **Reconcile Platform phase logic before content implementation.** The current `50 = Delegation` Platform rule conflicts with live Esperto's `50 = Management`. Do not build phase-aware feedback on an unverified boundary. After the boundary/sensitivity result, present Jeff with the exact 21-question ledger and a forward-only edition proposal that preserves frozen historical reports. Peer benchmarks remain separate and unchanged.

## Visual talking guide

```text
Jeff's request (Aug 13)
        |
        +--> “What feedback does score 1..10 select?”
        |       |
        |       +--> Current live visible text
        |       |     0–4 | 5–6 | 7–8 | 9–10
        |       |     7 questions skip the 5 transition
        |       |     Q50 also skips the 9 transition
        |       |
        |       +--> Completed Step 1: 11 uniform current-source reports
        |             61 questions × 11 scores = 671 comparisons
        |             |
        |             +--> 671/671 rows extracted
        |             +--> Management-phase wording differs from May catalogue
        |             +--> Completed May-like Delegation 0/5/7/9 control
        |                   |
        |                   +--> 46/244 cells differ from Management
        |                   +--> score-5 matches May Delegation 61/61
        |                   +--> Completed employee-only isolation
        |                         |
        |                         +--> all 46 differences reproduced
        |                         +--> isolated = May-like 244/244
        |                         +--> feedback is headcount/phase-associated
        |                         +--> next: map boundary + same-phase sensitivity
        |
        +--> “Where do Peers values come from?”
                |
                +--> Separate completed controlled snapshot: Q01–Q61
                +--> External benchmark within tested conditions, not team mean
                +--> No benchmark refresh in feedback Step 1
```

## Primary-source index

- Aug. 13 meeting transcript: `/Users/diushianstand/.codex/attachments/5fe6f2b3-c321-483e-a321-fda167a8e52e/pasted-text.txt`, especially 3:09–4:22 (lines 53–69), 4:59–7:22 (lines 78–103), and 8:01–8:40 (lines 114–121).
- Supplied May Esperto reports: `/Users/diushianstand/Scaling-up-platform-v2/From Jeff/APP_scaling up assessemnt/APP_scaling up assessemnt/`, including the uniform 0, 3, 5, 7, and 10 reports. Their extracted evidence is catalogued in the repo-relative methodology and CSV above.
- Feedback research/methodology/catalogue: [methodology](esperto-feedback-text-and-thresholds-2026-08-14.md), [catalogue](esperto-feedback-text-catalogue-2026-08-14.csv), and [Edition 4 receipt](esperto-feedback-band-production-receipt-2026-08-14.md).
- Current live 61 × 11 output matrix: [esperto-feedback-current-live-matrix-2026-08-20.csv](esperto-feedback-current-live-matrix-2026-08-20.csv).
- Independent historical-profile reconstruction and experimental cautions: [May-profile and Delegation-control audit](esperto-may-profile-and-delegation-control-audit-2026-08-20.md).
- Current Delegation evidence: [61 × 4 matrix](esperto-feedback-delegation-live-matrix-2026-08-20.csv) and [244-cell comparison ledger](esperto-feedback-delegation-vs-management-comparison-2026-08-20.csv).
- Current Delegation PDFs: `/Users/diushianstand/Downloads/ScalingUp_report_Wavex Verify_2026-08-20T07_34_24-04_00.pdf`, `...T07_35_47-04_00.pdf`, `...T07_36_52-04_00.pdf`, and `...T07_37_58-04_00.pdf`; the Step 2 table records score-specific fingerprints.
- Phase-isolation evidence: [control specification](esperto-feedback-phase-isolation-control-spec-2026-08-20.md), [61 × 4 isolated matrix](esperto-feedback-phase-isolation-live-matrix-2026-08-20.csv), and [244-cell three-way text ledger](esperto-feedback-phase-isolation-three-way-comparison-2026-08-20.csv).
- Phase-isolation PDFs: `/Users/diushianstand/Downloads/ScalingUp_report_Wavex Verify_2026-08-20T08_05_24-04_00.pdf`, `...T08_06_45-04_00.pdf`, `...T08_07_50-04_00.pdf`, and `...T08_08_52-04_00.pdf`; the Step 3 table records score-specific fingerprints.
- Current live PDFs: `/Users/diushianstand/Downloads/ScalingUp_report_Wavex Verify_2026-08-20T03_07_13-04_00.pdf` through `/Users/diushianstand/Downloads/ScalingUp_report_Wavex Verify_2026-08-20T03_32_32-04_00.pdf`; the result table records per-score SHA-256 prefixes.
- Peer research: [controlled-source findings](esperto-peer-benchmark-sources.md) and [snapshot/ledger](esperto-peer-benchmark-snapshot-2026-08-14.md).
- Code/test evidence: [feedback-band guard](../../src/src/lib/assessments/su-full-feedback-bands.ts), [feedback-band tests](../../src/src/__tests__/lib/assessments/su-full-feedback-bands.test.ts), [benchmark snapshot](../../src/src/lib/assessments/su-full-question-benchmarks.ts), [benchmark tests](../../src/src/__tests__/lib/assessments/su-full-question-benchmarks.test.ts), [frozen report construction](../../src/src/lib/assessments/respondent-report.ts), and [change receipt](../../plans/CHANGELOG.md#su-full-feedback-bands-published).
