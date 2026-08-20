# Jeff feedback-response change closeout — 2026-08-20

## Purpose and operating boundary

This is the single talking guide for the remaining question: whether the currently published Scaling Up Full **feedback text selected at each score** still matches current Esperto behavior. It is deliberately separate from the already-captured **Peers** benchmark snapshot.

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
| Feedback text and score bands | Completed current live audit: 11 reports × 61 rendered feedback rows = 671 nonblank observations | Every question is text-identical at scores `0–4`; all are text-identical within `5–6`, `7–8`, and `9–10`. Seven questions do not change at score 5; Q50 also does not change at score 9. | Do not change Platform content yet. First isolate current-source phase/profile variance from time/version drift. |
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
| Each question has source feedback captured at 0, 3, 5, 7, and 10 | Directly observed in the May uniform reports | Those are historical source reports; current wording may have drifted. Q01 already showed wording drift in its current live sweep. |
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

Under that word-preserving canonicalization, the current output exactly matched 177/305 historical source-stop cells. A similarity screen flagged 124/305 cells across 38 questions for substantive human review; the rest of the non-exact cells were closer wording/layout variants. This is a triage aid, not a content verdict. Classification is blocked until the phase/profile control below is run.

There is no extraction discrepancy: all 671 current cells are present in the companion matrix. There is also no current-suite within-band inconsistency. The unresolved discrepancy is **content provenance**: score-only versus score-plus-phase/profile behavior.

## Assessment and recommended next step

1. **Completed evidence-quality gate.** Eleven attributable reports, 61/61 ordered rows per report, 671/671 nonblank feedback cells, 26 pages each, and distinct PDF fingerprints all passed.
2. **Recommended next action: current Delegation-phase control.** Recreate the May profile in current Esperto and run only the four now-proven visible stops `0`, `5`, `7`, and `9`. This is 244 comparisons, not another 671, because the integer thresholds are already directly proven.
3. **Classify the differences.** Compare current Delegation versus May Delegation to isolate time/version drift; compare current Delegation versus current Management to isolate phase/profile variance.
4. **Choose the content model before implementation.** If differences are time-only, propose a forward-only content refresh. If they are phase-dependent, either key feedback by question + score band + phase/profile, or explicitly choose and disclose one canonical profile. Do not silently overwrite Edition 4 or historical campaign snapshots.
5. **Then obtain explicit content approval.** Only after Jeff confirms the intended wording/model should an Edition 5 or report-plumbing implementation be planned. Peer benchmarks remain a separate completed track and must not be changed by this work.

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
        |             +--> next: current Delegation 0/5/7/9 control
        |                   before any Platform content proposal
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
- Current live PDFs: `/Users/diushianstand/Downloads/ScalingUp_report_Wavex Verify_2026-08-20T03_07_13-04_00.pdf` through `/Users/diushianstand/Downloads/ScalingUp_report_Wavex Verify_2026-08-20T03_32_32-04_00.pdf`; the result table records per-score SHA-256 prefixes.
- Peer research: [controlled-source findings](esperto-peer-benchmark-sources.md) and [snapshot/ledger](esperto-peer-benchmark-snapshot-2026-08-14.md).
- Code/test evidence: [feedback-band guard](../../src/src/lib/assessments/su-full-feedback-bands.ts), [feedback-band tests](../../src/src/__tests__/lib/assessments/su-full-feedback-bands.test.ts), [benchmark snapshot](../../src/src/lib/assessments/su-full-question-benchmarks.ts), [benchmark tests](../../src/src/__tests__/lib/assessments/su-full-question-benchmarks.test.ts), [frozen report construction](../../src/src/lib/assessments/respondent-report.ts), and [change receipt](../../plans/CHANGELOG.md#su-full-feedback-bands-published).
