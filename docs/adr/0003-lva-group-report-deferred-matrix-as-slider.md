# LVA: defer the group-factor report; model the 16-factor matrix as an ordinal slider

The Leadership Vision Alignment instrument's only quantified output in Esperto is a **group report** — a 0–10-per-factor bar (Strong/Average/Weak, team-averaged) plus an obstacle %-vote-share chart. Reproducing it requires a cross-respondent aggregation renderer the platform does not have. We **defer that group-report visualization out of the content re-seed** (we faithfully capture the 16-factor matrix answers and the obstacle pick-3 so the data is complete, and LVA ships with a single neutral tier like the Quarterly Session Prep pair). We model each of the 16 matrix factors as a **`SLIDER_LIKERT` 1–3 (1=Weak, 2=Average, 3=Strong)** rather than a single-select `MULTI_CHOICE`.

## Considered options
- **Build the group-aggregation report now** — rejected: a separate, meaningfully larger report-rendering slice; the re-seed only needs the questions + captured data to be correct.
- **Matrix as 16 single-select `MULTI_CHOICE`** — rejected: loses the ordinal meaning and the clean rescale path (1/2/3 → 0/5/10) a future group report needs.

## Consequences
- LVA respondents' matrix + obstacle answers are stored faithfully, but the Esperto-style group factor-bar report is a future slice.
- A future group report can rescale the 1–3 slider values to Esperto's 0–10 per-factor display without re-collecting data.
