# Esperto peer benchmark: controlled-source findings

Date: 2026-08-14

## 2026-08-21 scope correction

The static-vector conclusion below is valid for the profiles observed on
2026-08-14, but it is not the current global conclusion. The later five-phase
suite and adjacent boundary reports found a second vector in P4 Delegation:
P1/P2/P3/P5 share the baseline vector, while P4 changes 56/61 values and P5
returns to baseline. The earlier very-small, baseline, and very-large controls
sampled baseline-vector phases and therefore could not expose this P4 cohort.

The current source of truth is
[`esperto-peer-vector-five-phase-csv-audit-2026-08-21.md`](esperto-peer-vector-five-phase-csv-audit-2026-08-21.md).
Keep this note as the historical receipt for the 2026-08-14 snapshot; do not
use its global-static wording as a current product-fidelity claim.

## Conclusion

Esperto describes `Peers` as an external benchmark derived from companies that
previously completed the Scaling Up Assessment. It is not the current
company's team average. In the controlled tests below, the product behaved as
a fixed per-question lookup table: all 61 displayed Peer values stayed fixed
when the answer, current campaign completion state, company size, revenue
history, and organizational phase screen changed.

This evidence supports storing the captured values as a governed snapshot. It
does not disclose Esperto's private historical cohort formula or prove the
snapshot will never be refreshed.

## Controlled evidence

Eleven otherwise-identical CEO reports changed only `Effective recruitment
process`, once for each integer score from 0 through 10.

- Recruitment Peers was `6.3` in every report.
- Every report contained 61 Peer values.
- The ordered Peer vector had the same SHA-256 fingerprint in all 11 reports:
  `3a18bef3018c20910a192491775217263caea0f89ec0df5c86f4eff78e745d4a`.
- Other invited respondents remained incomplete when most CEO reports were
  generated, rejecting a current-team-average calculation.

A second contrast held every assessment answer at 5 and changed only company
profile:

| Profile | Company age | Employees | Freelancers | Revenue history |
| --- | ---: | ---: | ---: | --- |
| Very small | 1 year | 2 | 0 | USD 1m each year |
| Baseline | 5 years | 10 | 1 | USD 1m–5m |
| Very large | 20 years | 500 | 50 | USD 100m–300m |

The very-large profile reached a different organizational phase screen. All 61
Peer values still matched by question across the three reports, with zero
mapped differences.

The captured Q01–Q61 values and their version/effective date live in
`src/src/lib/assessments/su-full-question-benchmarks.ts`. Integrity tests match
that snapshot against the canonical Scaling Up Full assessment seed. The full
value table and campaign/report evidence ledger are recorded in
`esperto-peer-benchmark-snapshot-2026-08-14.md`.

## Primary-source context

- The controlled Esperto report states that Peers are companies of comparable
  size that previously took the Scaling Up Assessment, and describes matching
  by similar size and organizational phase.
- An official Scaling Up sample report uses the same description:
  <https://scalingup.com/wp-content/uploads/2020/10/Scaling-Up-Master-Class-Brochure-Oct-2020-FINAL-2.pdf>
- The Scaling Up Assessment Toolkit privacy policy confirms that assessment
  data is stored in its assessment database:
  <https://scalinguptoolkit.com/privacy>
- Official Scaling Up resources distinguish the books/framework from the
  assessment software: <https://scalingup.com/resources/>

## Still unknown

- employee/revenue cohort bands;
- organizational-phase assignment rules;
- simple versus weighted averaging;
- minimum sample size and exclusions;
- treatment of repeat assessments;
- refresh schedule; and
- who approves or publishes a refreshed benchmark set.

A Scaling Up book may explain the methodology and phases, but it is not
expected to contain this operational numeric table or its refresh rules.
