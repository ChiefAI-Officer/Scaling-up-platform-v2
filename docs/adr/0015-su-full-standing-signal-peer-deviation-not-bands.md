# 15. Scaling Up Full standing signal: peer-deviation, not tier bands

Date: 2026-06-26
Status: Accepted

## Context

Every scored assessment on the platform renders a **tier band** (e.g. Rockefeller's checklist tiers; the
SU-Full seed invented a provisional 3-band scale — "Not ready / On the way / Exemplary" at cutoffs 4.0/6.5,
pending Jeff). Wave J surfaces the SU-Full group report, so we had to decide what "standing" it shows.

A full re-audit of the real Esperto Scaling Up source (all 13 sample report PDFs + the assessment workbooks,
2026-06-26) established two facts that contradict the seeded design:

1. **Esperto uses no tier bands at all.** Across every sample report there is no Low/Good/Top (or any) band on
   the ScaleUp score or any section. Standing is conveyed only by **peer-percentile prose** ("X% of comparable
   companies score higher") plus **▲/▼ deviation arrows**. The overall ScaleUp score is a 0–100 integer that
   can even exceed 100 (an all-10s fill scored 107) via "bonus points."
2. **We cannot reproduce Esperto's percentile.** "X% score higher" requires the peer *distribution*; we only
   harvested the peer *mean* (e.g. 53.1). Esperto owns that database; we do not. So a faithful percentile is
   infeasible with available data.

The provisional 4.0/6.5 band cutoffs were therefore both unfaithful to the source and unconfirmed by the
client.

## Decision

For Scaling Up Full, **do not show a tier band.** Convey standing through **deviation from the peer
benchmark** (▲/▼ against the seeded Peers values; see `su-full-benchmarks.ts`), which the YOUR PROFILE matrix
already computes once Peers is present (`Dev · Peers = CEO − Peers`).

- The tier block is **suppressed at the render layer** for SU-Full (config-gated, the same mechanism as
  Rockefeller's `showScoreTable:false`). **Scope:** applied to the **group report now** (Wave J). The
  **per-respondent** report keeps its tier for now and adopts peer-deviation in the later slice that adds
  per-respondent Peers — otherwise suppressing its band would leave a bare score with no standing signal
  (the per-respondent report shows no Peers in Wave J).
- The computed tier is **left intact in the frozen `ScoreResult`** — it is hidden, not removed. Un-hiding is a
  one-line config change.
- We do **not** fabricate an Esperto-style percentile, because we lack the peer distribution to compute one
  honestly.

## Consequences

- **Honest + source-aligned:** we show the defensible subset of Esperto's model (direction vs peers) without
  inventing cutoffs or claiming a percentile we cannot derive.
- **De-risks launch:** publishing SU-Full no longer waits on Jeff confirming band cutoffs that don't exist in
  the source.
- **Reversible:** because the tier remains in `ScoreResult`, restoring bands later (if Jeff wants them, or if a
  real peer distribution arrives) is a render-config flip with no re-seed.
- **Caveat:** standing quality is only as good as the Peers benchmark, which is seeded PROVISIONAL from a single
  Esperto sample cohort (0–10 scale) and is not yet cohort-matched. Surfaced in the Wave J plan.
- This decision is specific to SU-Full; other scored assessments keep their existing tier rendering.
