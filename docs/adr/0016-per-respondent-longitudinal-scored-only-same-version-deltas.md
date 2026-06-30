# 16. Per-respondent longitudinal comparison is scored-only, with same-version deltas

Date: 2026-06-30
Status: Accepted

## Context

Jeff's June-9 punch-list item #23 asks: *"Is comparison reporting built in? … If this is not built, it
needs to be on the roadmap."* The **Cohort trend** (`/portal/assessments/trends`,
`getLongitudinalTrend`) already answers the *aggregate* version of this — one organization's mean results
for a template across its successive campaigns. What is missing is the **per-respondent** counterpart:
tracking **one person**'s results across the campaigns they completed for the same template (Q1 vs Q2,
Year-1 vs Year-2). This ADR fixes two design questions that are expensive to reverse once the view ships
and coaches start reading it.

Two facts from the codebase constrain the design:

1. **Only SLIDER_LIKERT questions are scored.** `scoreSubmission` filters to `SLIDER_LIKERT`; TEXT /
   NUMBER / MULTI_CHOICE answers are stored but never enter `perQuestion` / `perSection` / `overallAverage`
   / `tier` (`scoring.ts`, ~L19-22, L1107-1109). Consequently the frozen `ScoreResult` is rich for
   **scored** templates (Rockefeller, Five Dysfunctions, Scaling Up Full, Scaling Up Quick) and **near-empty**
   for **qualitative** ones (LVA — only `S3_strengths` lands in `perSection`; QSP v1/v2 — nothing). There is
   no numeric series to trend for the qualitative templates.

2. **A frozen result is computed under its version's scoring config.** A respondent who took the
   assessment under template version v1 and again under v3 has two results whose section scales or tier
   bands may differ. stableKeys are continuity-stable across versions (ADR-0001), but the *values* keyed to
   them are not guaranteed comparable when the scoring config changed. The existing Cohort trend sidesteps
   this bluntly — it includes only the latest-published-version cohort and excludes the rest.

## Decision

**1. The per-respondent longitudinal comparison applies to scored templates only.**
The entry point appears only when `reportConfigFor(alias).reportType === "scored"` (the same ADR-0010 gate
that splits scored vs qualitative reports). For a qualitative template the entry is hidden and a direct hit
returns `notApplicable: "qualitative-template"`. A *qualitative* answer-level comparison (a person's raw
free-text / choices across time) is a genuinely different feature — answer-level, not metric-level — and is
explicitly deferred, not bolted on.

**2. Deltas are computed only between submissions on the same Template Version.**
All of the person's submissions for the template are listed chronologically, each tagged with its version.
A delta (▲/▼ vs the previous point) is shown **only between two submissions that share the same
`versionId`**. A submission on a different version still shows its values (so the full history is visible)
but renders the delta as "—" with a "different version" badge, plus a one-line note that deltas are shown
only between comparable versions. This is strictly more useful than the Cohort trend's hard-exclude (a
quarterly re-taker who crossed a re-seed still sees their whole history) while staying correctness-safe.

The view reads the **frozen `ScoreResult` only** — it never re-scores — and is authorized exactly like the
Cohort trend (`canAccessOrganization`), because it is the same underlying data disaggregated to one person.

## Consequences

- **Honest:** we never trend a metric that does not exist (qualitative templates) nor delta two numbers
  that were computed under different rules (cross-version).
- **Consistent:** scope and authorization mirror the already-shipped Cohort trend and the scored/qualitative
  report split (ADR-0010), so there is one mental model, not three.
- **Reversible-ish:** un-deferring the qualitative answer-level comparison is additive (a new view over the
  raw `answers`, no change to this one). Relaxing the same-version delta rule later (e.g. once a
  scoring-config-equality check exists) is a render-layer change, not a data change.
- **Caveat — sparse history:** a template that is re-seeded between a person's takes will show their points
  but few deltas (each take on a different version). This is the correctness-safe degradation, and the
  "different version" badge makes it legible rather than silently wrong.
- **Caveat — Scaling Up Full ScaleUp score is PROVISIONAL** (ADR-0015): the longitudinal view trends the
  frozen ScaleUp value carrying its existing provisional label; it does not add new provenance claims.
