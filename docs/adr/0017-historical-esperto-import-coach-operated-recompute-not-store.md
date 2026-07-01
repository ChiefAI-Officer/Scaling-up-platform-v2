# 17. Historical Esperto import is coach-operated and recompute-not-store

Date: 2026-07-01
Status: Accepted

## Context

The assessment module *is* the Esperto replacement, but import today (Wave O predecessor work)
covers only **Members (roster)** and **QSP-v2 results**. The marquee gap for actually retiring
Esperto is bringing in a company's historical **Scaling Up Full (SU-Full)** results so they render
as normal per-respondent reports and feed the Wave N per-respondent longitudinal comparison
("Year 1 vs Year 2"). Wave O closes that gap.

Two properties of the real Esperto exports (studied 2026-07-01 against
`From Jeff/Exports/_extracted`) constrain the design and are expensive to reverse once coaches
start importing client history and reading the resulting reports:

1. **Each restricted-individual export is one respondent** and carries a `raw` block (the 61 SU-Full
   rating items `Q3_1…Q12_10` + financial/demographic keys) *and* a `processed` block (Esperto's own
   Phase, `indexTotal`, peer statistics). Our `scoreSubmission` already fully scores SU-Full from the
   raw answers (per-section/per-domain, tier, and — per ADR-0015 — a peer-deviation standing signal),
   and every report + the longitudinal view read **only the frozen `ScoreResult`** (ADR-0007,
   ADR-0016). Esperto's 0–100 index is **not reproducible** and is not rendered anywhere (ADR-0015).

2. **The export has no round/wave identifier** — only `cid` (company), `mid` (person), and a `date`.
   A company assessed twice yields the same `(cid, mid)` again, distinguishable only by `date`.

The prior glossary described historical import as *admin-operated*. That was a provisional note, not a
decision, and it conflicts with the product goal (coaches retire Esperto for *their own* clients).

## Decision

**1. Historical import is coach-operated, org-scoped.** A coach imports history only into their own
organizations, through the same pipeline the admin path uses, gated by the *same* entitlement checks
as normal campaign creation — `canCreateCampaign` (certification status **and** access-group
`canAccessTemplate` intersection), applied at both preview and commit. This supersedes the
"admin-operated" glossary note. Admin retains an unrestricted import path. Rollout to coaches is a
canary ramp (pilot org → allowlist → global), but the end state is coach self-serve — there is no
permanent admin gatekeeping.

**2. Recompute, don't store.** We import the **raw answers** and let `scoreSubmission` recompute the
frozen `ScoreResult` under the pinned published version's scoring config. Esperto's `processed` block
is **never stored or rendered**, and the separate **aggregate export is dropped** — the group/cohort
view is recomputed from the imported individuals (the same way live campaigns produce group views,
per ADR-0011), so there is a single group-report code path, not two. Demographic PII in `raw`
(`geslacht`/`leeftijd`/`country`/`postcode`, names) is dropped by the crosswalk and never persisted.

**3. A round is the coach's declared import batch, not an inferred date cluster.** Because the export
has no round identifier, one import batch = one round = one campaign for one company (`cid`). The
coach supplies a **round label**; the campaign's identity is
`externalId = esperto:sufull:<cid>:<slug(roundLabel)>` plus a batch **content fingerprint** stored in
`AssessmentCampaign.importManifest`. Re-import with the same label but different content is a
conflict (409), not a silent merge; a divergent per-respondent answer hash is a conflict, not a
silent skip. This keeps distinct rounds (even with disjoint participants) as distinct campaigns so the
longitudinal comparison is correct.

**4. Pin latest-published; appends bind to the campaign's pinned version.** A new imported round pins
the latest published SU-Full version. A late-respondent append to an existing round scores against
*that campaign's* already-pinned `versionId`, never re-resolving latest-published — otherwise a
version published between two imports would produce mixed-version submissions inside one historical
round, breaking the ADR-0016 same-version delta rule.

Imported campaigns remain CLOSED and never email (ADR-0006). The whole capability ships dark behind
`WAVE_O_ESPERTO_SUFULL_IMPORT` and the SU-Full crosswalk stays `locked:false` (import refused) until a
PR-reviewed lock-checklist verifies the mapping — a wrong crosswalk silently binds answers to the
wrong questions and corrupts historical results, so the lock is the safety gate.

## Consequences

- **Consistent:** imported and live SU-Full results are scored by one engine and read through one
  report + one group-view + one longitudinal path — no vendor-number reconciliation, no second code
  path to keep in sync.
- **Honest about fidelity:** the growth-phase tile depends on the FTE questions, which exist only in
  the (Jeff-gated, unpublished) SU-Full v2 draft; against the published v1 the FTE source values are
  simply unmapped and the tile is absent (degrades gracefully). Baseline imported fidelity is domain
  scores + peer comparison + an "Imported from Esperto (historical)" label. The tile appears
  automatically once an FTE-bearing version is published — Wave O neither depends on nor blocks Wave J.
- **Operator draws the round boundary:** the coach must import one round at a time and label it. This
  is a small UI ask, but it replaces a fragile date-clustering heuristic that would silently merge or
  split rounds (especially across staff turnover, where two rounds share no `(cid, mid)`).
- **Reversible-ish:** because imported campaigns are isolated (CLOSED, externalId-keyed, manifested), a
  bad batch is removed by a by-batch quarantine/purge rather than an all-or-nothing rollback; the
  kill-switch stops new imports, the purge cleans already-written ones.
- **Not reversed lightly:** once coaches import client history under recompute-not-store and read the
  reports, switching to preserving Esperto's stored numbers would change every historical report's
  values. That is the trade-off we are accepting deliberately in favor of one consistent engine.

Related: ADR-0006 (imported = closed), ADR-0007 (per-respondent report is canonical), ADR-0011 (group
report aggregation), ADR-0015 (SU-Full peer-deviation standing signal), ADR-0016 (per-respondent
longitudinal, scored-only, same-version deltas).
