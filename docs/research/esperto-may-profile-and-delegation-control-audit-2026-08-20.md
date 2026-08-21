# Esperto May-profile and Delegation-control audit — 2026-08-20

## Purpose and boundary

This note reconstructs the historical profile evidence needed for the approved current-Esperto Delegation control and defines what can and cannot be learned from four current uniform reports at scores `0`, `5`, `7`, and `9`.

This was a read-only source audit. It did not use a browser, create or change an Esperto campaign, change Platform Production, alter the existing research catalogue/matrix, or prepare/send Slack or email.

## Executive correction

The five May uniform-score reports were **not** produced from one Delegation-phase profile. Score and profile/phase changed together:

- May scores `0`, `3`, `7`, and `10` are **Pioneering-phase** reports.
- Only May score `5` is a **Delegation-phase** report.
- The May score-5 report is therefore the only valid May Delegation baseline, and only for the score-5 feedback stop.
- A current Delegation run at `0`, `7`, or `9` cannot be called a direct current-versus-May Delegation comparison because no corresponding May Delegation report exists in the supplied archive.

This corrects the statement in the existing closeout guide that “the May uniform reports” collectively used the 15-year / 100-permanent / 15-temporary Delegation profile. That profile describes the May score-5 report only. [Existing closeout statement](jeff-feedback-response-change-closeout-2026-08-20.md#results).

## Primary-source reconstruction of the May uniform suite

The following values are printed on page 4 (`INTRODUCTION`) of the supplied 26-page personal reports. “Enter 5” means the report says the respondent has the ambition to enter five new countries.

| Uniform score | Source profile/phase | Age | Entrepreneur years | Company years | Permanent / temporary employees | This-year sales target | Growth this year / next year | Foreign revenue | International goal | Estimated score | PDF SHA-256 |
| ---: | --- | ---: | ---: | ---: | --- | ---: | --- | ---: | --- | ---: | --- |
| 0 | Pioneering | 65 | 20 | 9 | 7 / 2 | 11m | 22% / 9% | 0% | Not stated | 50 | `3a24e08f2c2f…` |
| 3 | Pioneering | 65 | 20 | 9 | 7 / 2 | 11m | 22% / 9% | 10% | Enter 5 | 50 | `3f44d0e9fae5…` |
| 5 | **Delegation** | 60 | 20 | 15 | **100 / 15** | **28m** | **12% / 7%** | 10% | Enter 5 | 50 | `e875798df58d…` |
| 7 | Pioneering | 65 | 20 | 9 | 7 / 2 | 11m | 22% / 9% | 10% | Enter 5 | 50 | `3c5899c04992…` |
| 10 | Pioneering | 55 | 25 | 9 | 7 / 2 | 11m | 22% / 9% | 10% | Enter 5 | 50 | `683b281009a3…` |

All five reports name the sector as `Consultancy, research and other business services` and state two active partners. Primary PDFs, page 4:

- [May uniform 0](</Users/diushianstand/Scaling-up-platform-v2/From Jeff/APP_scaling up assessemnt/APP_scaling up assessemnt/other samples/all 0s _ScalingUp_report_John CEOExec_2026-05-01T16_15_03-04_00.pdf>)
- [May uniform 3](</Users/diushianstand/Scaling-up-platform-v2/From Jeff/APP_scaling up assessemnt/APP_scaling up assessemnt/other samples/all 3s _ .pdf>)
- [May uniform 5](</Users/diushianstand/Scaling-up-platform-v2/From Jeff/APP_scaling up assessemnt/APP_scaling up assessemnt/other samples/all 5s   ScalingUp_report_John CEOExec_2026-05-01T17_19_59-04_00.pdf>)
- [May uniform 7](</Users/diushianstand/Scaling-up-platform-v2/From Jeff/APP_scaling up assessemnt/APP_scaling up assessemnt/other samples/All 7s _ ScalingUp_report_John CEOExec_2026-05-01T16_25_26-04_00.pdf>)
- [May uniform 10](</Users/diushianstand/Scaling-up-platform-v2/From Jeff/APP_scaling up assessemnt/APP_scaling up assessemnt/other samples/all 10s _ ScalingUp_report_John CEOExec_2026-05-01T16_30_04-04_00.pdf>)

### What is reproducible from the May Delegation report

Use the following as the **closest report-visible reconstruction**, not as an “exact historical input export”:

| Input | Value | Evidence status |
| --- | --- | --- |
| Respondent version | CEO/personal report | Directly visible from report form and content |
| Company age | 15 years | Directly printed |
| Employee input | 100 permanent FTE; 15 temporary | Directly printed. A current form with one combined permanent/temporary field cannot reproduce both source fields exactly: `100` preserves the source's phase-driving permanent figure, while `115` preserves the literal combined workforce. Record the chosen mapping; do not present either as exact. |
| Organizational phase | Delegation | Directly printed |
| Sector | Consultancy, research and other business services | Directly printed |
| Entrepreneur age / experience | Age 60; entrepreneur 20 years | Directly printed |
| Active partners | 2 | Directly printed |
| Revenue target this year | USD 28m | Directly printed |
| Growth objectives | 12% this year; 7% next year | Directly printed, but the underlying revenue values needed to produce the displayed percentages are not all printed |
| Foreign revenue | 10% | Directly printed |
| Country-growth ambition | Enter 5 new countries | Directly printed |
| Estimated ScaleUp Score | 50 | Directly printed |
| Uniform scored answers | 5 | Directly visible across the report's 61 question rows |

The source workbook confirms that the source background form separately asks for company age, employee FTE, freelancers, leadership positions, five revenue values, and other respondent/company inputs. Its embedded 100-FTE Delegation example is **not** the May score-5 respondent: that screenshot shows 25 company years and 10 freelancers, whereas the report prints a 15-year company and does not disclose freelancers. Therefore the workbook example must not be used to silently fill the missing May fields. [Source workbook, `v2` embedded background screenshots](</Users/diushianstand/Scaling-up-platform-v2/From Jeff/APP_scaling up assessemnt/APP_scaling up assessemnt/scalingupassessment.xlsx>); [durable source-field inventory](../specs/v7.6/18j-su-full-source-extract.md#background--growth-input-set-j-1--verbatim-labels).

### What cannot be reconstructed exactly from the supplied May report

The May PDF does not disclose all input-form values. In particular, it does not provide a complete record of:

- freelancer FTE;
- which leadership-position checkboxes were selected;
- all five underlying revenue values;
- countries with own branches, countries served, and all international goal fields;
- external-investor and partner/network-strategy selections;
- B2B/B2C market, country/state/postal code, gender, or challenge text.

Those fields may or may not affect feedback wording. Without the original Esperto response export or a vendor specification, calling any recreation “exact” would overstate the evidence.

## Catalogue provenance caveat

The existing historical catalogue is not a pure May-PDF matrix:

- 60 of 61 rows at each stored stop come from the May uniform PDFs.
- Q01 at all five stored stops was deliberately replaced by the August 14 live sweep (`text_source = live sweep, 2026-08-14`).

Consequently, a strict May comparison must extract all 61 rows from the original May PDFs or at minimum restore Q01 from each May PDF before comparison. The catalogue remains valid for its documented implementation provenance, but it is not a pristine one-profile May control. [Catalogue](esperto-feedback-text-catalogue-2026-08-14.csv); [catalogue methodology](esperto-feedback-text-and-thresholds-2026-08-14.md#live-controlled-sweep).

## Rigorous current-control plan

### Phase-isolation suite: four current Delegation runs

Create current Esperto CEO/personal reports at uniform scores `0`, `5`, `7`, and `9`. Clone the already-captured current Management profile and change **only** its phase-driving employee input to a value that Esperto confirms as Delegation (recommended starting value: `100`). This four-report suite is the controlled current P3-vs-P4 experiment.

Do not substitute the May-like profile into this four-report suite and then call its comparison with the existing Management matrix “phase-only”: the May-like profile also changes company age, entrepreneur age/experience, partners, revenues/growth, and international inputs.

### Historical suite: one additional score-5 report

Create one current Delegation report at uniform score `5` using the closest May score-5 profile reconstruction. This is the only current-vs-May Delegation pair the supplied archive supports. Explicitly record every unavoidable substitute or unknown.

For the employee-field mismatch in this historical run, `100` is the recommended primary value because the source evidence identifies permanent FTE as the historical phase driver. If this pair is sensitive enough to drive a content decision, add one score-5-only `115` sensitivity run before attributing a difference to time/version.

The minimum rigorous current-source set is therefore **five reports**: four phase-isolation reports plus one May-like score-5 report. Reusing a single score-5 report for both purposes would change multiple profile variables in one of the comparisons.

Before interpreting wording, require for each report:

1. `Delegation phase` appears in the report introduction.
2. The PDF has the expected personal-report structure and 61 ordered Q01-Q61 detail rows.
3. Every row has one nonblank feedback paragraph.
4. The report artifact, capture time, and SHA-256 are recorded.
5. Mail/notification automation remains disabled.

### Comparisons that are valid

| Comparison | Cells | What it tests | Evidence label |
| --- | ---: | --- | --- |
| Phase-isolation Delegation `0/5/7/9` vs current Management `0/5/7/9` | 244 | Current sensitivity to the phase-driving employee input, with every other control fixed | Controlled current comparison |
| May-like current Delegation `5` vs original May Delegation `5` | 61 | Time/version plus any remaining unreconstructed hidden-input variance | Closest historical comparison; **not perfectly pure** |
| May-like current Delegation `0/7/9` vs May Pioneering `0/7/10` | 183 | Exploratory difference inventory only, if May-like runs beyond score 5 are made | Confounded by phase/profile; score `9` vs `10` adds another historical assumption |

The already-captured current Management matrix is [esperto-feedback-current-live-matrix-2026-08-20.csv](esperto-feedback-current-live-matrix-2026-08-20.csv). It contains all 61 rows for scores 0-10, so no Management rerun is needed if the fixed controls and artifact fingerprints in the closeout guide remain accepted.

### Normalization and classification

For each cell, retain the rendered paragraph and compute two comparison keys:

1. **Print-exact key:** Unicode normalization plus whitespace/line-wrap normalization only.
2. **Lexical key:** additionally ignore case and punctuation while preserving every word.

Classify differences as:

- `EXACT`: print-exact keys match;
- `FORMAT_ONLY`: lexical keys match but print-exact keys do not;
- `SUBSTANTIVE`: lexical keys differ;
- `MISSING/STRUCTURAL`: absent text, label/order mismatch, or incomplete report.

Do not automatically label `SUBSTANTIVE` as “time drift.” Attribute it only through the controlled pair that produced it.

## Decision tree after the four reports

```text
Phase-isolation Delegation 0/5/7/9
          |
          +--> compare with current Management at same scores
          |        |
          |        +--> any substantive difference?
          |                |
          |                +-- yes --> feedback is profile/phase-sensitive
          |                |           historical mixed-profile catalogue cannot be canonical
          |                |
          |                +-- no  --> no P3-vs-P4 wording effect observed under this control
          |
May-like current Delegation score 5
          |
          +--> compare with original May Delegation score 5
                   |
                   +--> substantive difference --> current-source revision or hidden-input effect
                   +--> exact/format-only       --> score-5 wording stable for the closest matched profile
```

## Recommended next foot after the current controls

1. **Do not promise a four-band content refresh from the May catalogue.** The archive is a mixed-profile dataset, and only score 5 has a May Delegation control.
2. **Use the current Delegation-vs-Management result as the first model gate.** If any question differs, the Platform needs either phase/profile-keyed feedback or an explicitly chosen canonical profile; a score-only overwrite would be misleading.
3. **Treat the May score-5 pair as the only historical drift signal currently available.** If it differs, request the original Esperto response export or vendor rule before claiming the cause. If that export is unavailable, describe the result as “current-source wording differs from the closest May Delegation report.”
4. **If current P3 and P4 are identical across all four stops, capture a current-source canonical 61-by-4 library and present its exact diff against Edition 4 to Jeff for wording approval.** This is the shortest path to address Jeff's concern without inventing phase logic.
5. **If current P3 and P4 differ, run the smallest follow-up that matches the May Pioneering baselines:** current Pioneering at scores `0`, `7`, and `9` (or `10` if exact historical-stop parity is required). Then propose a phase-aware content model to Jeff before any Edition 5 or report-plumbing change.

Peers remain out of scope. No peer benchmark should be refreshed from these reports.

## Post-audit outcome — 2026-08-20

The approved live work completed the May-like Delegation suite at scores `0`, `5`, `7`, and `9`. Every run resolved to phase 4 - Delegation and produced 61/61 ordered, nonblank feedback rows.

- Current May-like Delegation versus current Management: 198/244 exact word-preserving matches; 46 differing cells across 21 questions.
- Current May-like Delegation score 5 versus original May Delegation score 5: 61/61 print-exact feedback matches after whitespace/line-wrap normalization.
- Conclusion: a simple time/version-drift explanation is rejected at the only historically matched Delegation stop. Esperto feedback is profile-dependent, but this suite changed multiple profile variables and therefore cannot attribute all 46 differences to phase alone.
- Next control remains the phase-isolation suite defined above: preserve the current Management profile and change only the phase-driving employee input at scores `0`, `5`, `7`, and `9`.

Durable result artifacts: [Delegation live matrix](esperto-feedback-delegation-live-matrix-2026-08-20.csv), [Delegation-vs-Management comparison](esperto-feedback-delegation-vs-management-comparison-2026-08-20.csv), and the [Jeff closeout talking guide](jeff-feedback-response-change-closeout-2026-08-20.md#approved-step-2--current-may-like-delegation-control--completed).

## Source fingerprints

- May uniform PDF hashes are recorded in the profile table above.
- Historical catalogue SHA-256: `81d2289fd9a5de842479a2a3a6d8270fbe79dcc633d95be0f77fe906982cb74f`.
- Current Management matrix SHA-256: `707c03e09668d78bb2ef50e162261ad90424b64b35a07b66b03bbecf6ca6aff4`.
