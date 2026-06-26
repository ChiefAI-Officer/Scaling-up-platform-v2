# 09b — Assessment Re-seed: Publish-Review Checklist & Runbook

> Companion to [09-assessment-content-reseed.md](09-assessment-content-reseed.md). The re-seed appends each template's real content as a **new DRAFT version** (`publishedAt: null`). Nothing is published or sent to respondents until an admin clicks Publish. This doc is the operator + reviewer gate between "seeded as DRAFT" and "published."

## A. Pre-seed (operator, at seed time)

The implementation does NOT touch prod automatically. To seed the new DRAFT versions into prod:

1. **Capture the prod baseline (read-only)** — record the current latest `versionNumber` + `publishedAt` per template, and Rockefeller's existing stableKeys (ADR-0001). Fill the table in §D below. Run from `src/`:
   ```bash
   npx dotenv-cli -e .env.production.local -- npx tsx -e '<the read-only query from 09 §Task 0>'
   ```
2. **Confirm the guard env**: set `ASSESSMENT_PROD_EXPECTED_HOST` to the prod Neon host so `safe-seed.mjs` can match it.
3. **PITR / snapshot** per the DB-protection runbook before any write.
4. **Seed (guarded)** — `safe-seed.mjs` refuses a prod host without the explicit flag:
   ```bash
   cd src && npm run db:seed-assessments -- --i-know-this-is-prod   # ordered, stop-on-error, writes a seedRunId manifest
   ```
5. **Verify (read-only)**:
   ```bash
   cd src && npm run verify:seeded-assessments                      # asserts each alias's latest DRAFT version + hash vs the manifest
   ```
   Each template should now have a new **DRAFT** version; the prior published version is unchanged.

## B. Per-template publish review (Jeff / admin)

For **every** template: open the new DRAFT in the admin editor, confirm the questions render and read verbatim-correct, then Publish.

| Template | Scoring model | Safe to publish as-is? | What owner must confirm first |
|---|---|---|---|
| **Rockefeller** | items-passed → 3 bands (verbatim messages) | Yes, with one check | Band edges **17 / 33** are consistent with the Logic sheet but not uniquely pinned — confirm the exact Low/OK and OK/Great integers. |
| **QSP v1** | none (aggregation-only → neutral tier) | **Yes** | Nothing scoring-wise (no bands). Spot-check question wording. |
| **QSP v2** | none (aggregation-only → neutral tier) | **Yes** | Same — neutral, no bands. |
| **LVA** | per-factor (group report, out of v1) → neutral tier | **Yes** | Confirm the 16-factor matrix renders as Weak/Average/Strong and the financial questions read as **"in three years"** (aspirational). The Esperto group factor-bar report is a future slice. |
| **Scaling Up Full** | weighted ScaleUp Score → 3 bands (**provisional cutoffs**) | **NO — needs input** | See §C. Do not publish until the Esperto-dependent gaps are resolved. |

## C. Scaling Up Full — open items (block publish)

The export does not contain enough to reproduce Esperto's exact scoring. Confirmed vs provisional:
- **Confirmed (verbatim):** the 61 questions, the per-question recommendation text we have, and the 3 ScaleUp band **messages** (Not ready / On the way / Exemplary).
- **Provisional (flagged in the seed):** the band cutoffs **4.0 / 6.5** on the 0–10 rollup (derived by ÷10 from the confirmed 0–100 evidence: ≤28 LOW, 47–62 GOOD, ≥73 TOP). The exact integers are interpolations.
- **Missing from the export — get from Esperto before publish:**
  1. The ScaleUp Score **weighting + bonus formula** (it is weighted 0–100 and overflows to 107 at all-10s; our rollup is a simple mean-of-domains placeholder).
  2. The full **5-stop {0,3,5,7,10}** per-question recommendation text for all 61 questions (only 3 rows were populated in `matrix.xlsx`; we kept the existing 3-band recommendation text).
  3. The **non-scored profile inputs** (age, ambition %, etc.) that feed the score and peer comparison — currently unmodeled.
  4. Whether slider endpoints (0/10) carry worded labels (the PDFs show none; we seeded empty anchors).

## D. Prod baseline (fill at seed time — read-only)

| Alias | Latest versionNumber (pre-seed) | Published? | Notes |
|---|---|---|---|
| RockHabits | _TBD_ | _TBD_ | reuse existing stableKeys (ADR-0001) |
| qsp-v1 | _TBD_ | _TBD_ | |
| qsp-v2 | _TBD_ | _TBD_ | |
| leadership-vision-alignment | _TBD_ | _TBD_ | |
| scaling-up-full | _TBD_ | _TBD_ | |

## E. Rollback

A wrongly-seeded version is **DRAFT** (`publishedAt: null`), so the immutability trigger does NOT protect it — it can be deleted directly (or superseded by a corrected re-seed, which appends the next versionNumber). The prior published version is untouched throughout, so no campaign or in-flight submission is affected. If a publish was done in error, restore via Neon PITR per the DB-protection runbook. Use `verify:seeded-assessments` to confirm state before and after.
