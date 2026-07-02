# Wave O — Phase 2: SU-Full crosswalk build plan

**Status:** source FULLY RESOLVED 2026-07-02 via a live-Esperto controlled submission. Ready to build the **complete** crosswalk in one PR — the earlier 2a/2b split + Jeff dependency are **no longer needed**. Phase 1 shipped dark (PRs #113/#114).

---

## How the mapping was verified (no Jeff, no guessing)

Static files (seed, screenshots, sanitized fixtures, raw export `.xlsx`) proved insufficient: the export is bare `code→value` with **no question text**, and Esperto's code order is a **permutation** of survey order, so 6 of 10 families (four 5-item, two 6-item) were indistinguishable. Firestore/definition reads were auth-gated (403 / anon-auth disabled).

Resolved by driving the **live Esperto** account (login provided by the user; NOT a third party): created a ScaleUp2 test campaign, filled **each of the 10 slider sections with a distinct constant** (section N → value N), submitted, and read the saved answers back by code. The family returning all-N is display-section N. **Cross-checks passed** (Q3=all-4, Q4=all-3, Q8=all-1, Q12=all-10). Test campaign deleted; the real April campaign + client member were untouched and cleanup was verified.

### Verified crosswalk (Esperto family → our stableKeys; within-block ascending)

| Esperto | count | → our block | stableKeys |
|---|---|---|---|
| `Q8` | 8 | Your Employees (S_PEOPLE_YE) | Q01–Q08 |
| `Q7` | 5 | Company Culture (S_PEOPLE_CC) | Q09–Q13 |
| `Q4` | 7 | Strategy (S_STRATEGY) | Q14–Q20 |
| `Q3` | 4 | Leadership Team (S_EXEC_LT) | Q21–Q24 |
| `Q5` | 5 | Operational Processes (S_EXEC_OP) | Q25–Q29 |
| `Q9` | 5 | Sales & Marketing (S_EXEC_SM) | Q30–Q34 |
| `Q10` | 6 | Scalability/Innovation/Tech (S_EXEC_SIT) | Q35–Q40 |
| `Q11` | 5 | Cash (S_CASH) | Q41–Q45 |
| `Q12` | 10 | Your Leadership / "Making a statement" (S_YOU_LEAD) | Q46–Q55 |
| `Q6` | 6 | Internal Communication (S_YOU_IC) | Q56–Q61 |

**Non-obvious results the decode caught** (a naive position/order guess would have been wrong): `Q6`→Internal Communication and `Q10`→Scalability (the count-6 pair); `Q7`→Culture, `Q5`→Op-Processes, `Q9`→Sales, `Q11`→Cash (the count-5 four-way). Also note the survey shows Internal Communication *before* "Making a statement", the reverse of our seed's stableKey order — so the bind is by content, not position.

### droppedKeys (all non-slider raw keys → not imported)
- FTE (corrected by the live decode; earlier static guess of `Q13o*` was wrong): **`Q1o2_2` = permanent/temp-contract FTE, `Q1o2_3` = freelance FTE**. Also `Q1o1_1` (years in existence), `Q1o4` (leadership positions), all `Q2o*` (revenue/growth), all `Q13o*` (sector/firmographics), `ScoreSchatting` (self-estimate), `Q16`/`Q17`, `Q12open` (free-text), demographics (`geslacht`/`leeftijd`/`country`/`state`/`provincie`/`postcode`).
- FTE keys stay in `droppedKeys` (recompute-not-store; absent from published v1 → phase tile lights up later via Wave J with no Wave O change; when an FTE-bearing version publishes, move `Q1o2_2`/`Q1o2_3` to `map`).
- Every one of the export's raw keys must be in `map ∪ droppedKeys` (exhaustiveness guard).

### One documented residual (low-stakes)
Within-block **row order** = **ascending** (`Q<n>_1` → first stableKey … `Q<n>_m` → last). The all-same-value decode couldn't distinguish rows; ascending is the **QSP-confirmed Esperto convention** (same engine). It affects per-statement display + Wave-N same-question longitudinal deltas, **not** domain scores (order-independent mean). A distinct-per-row verification submission can confirm it if we want belt-and-suspenders; otherwise it ships as a documented lock-checklist assumption.

---

## Build (one PR, dark)

`locked:true` only makes the crosswalk *acceptable* — the Wave O flag stays **OFF**, so nothing is reachable until the separate Phase-3 canary flag-flip. Scope:

1. **Author `crosswalks/scaling-up-full.ts`** (replace the stub): `templateAlias:"scaling-up-full"`, `espertoVariant:null`, all **61 slider `map` entries** (families above, ascending), full **`droppedKeys`** with reasons, and a **lock-checklist JSDoc** that cites the 2026-07-02 controlled-decode evidence (method + cross-checks + the ascending-order note). Set `locked:true` (the checklist is satisfied by the decode; PR review is the gate).
2. **Tests (TDD, sanitized fixtures only):**
   - shape (alias / `espertoVariant:null` / `locked:true`); the 61 mappings exactly as verified; all SLIDER_LIKERT.
   - `validateCrosswalkAgainstVersion(crosswalk, publishedV1)` → `ok:true` (all 61 stableKeys exist in v1 as SLIDER_LIKERT w/ scale).
   - FTE keys are in `droppedKeys`, not `map`.
   - `validateCrosswalkExhaustive(crosswalk, allRawKeysFromFixture)` → `ok:true` (map ∪ dropped covers every raw key).
   - end-to-end: adapter flatten → recompute yields the expected domain averages for a sanitized SU-Full round; Rockefeller/LVA imports still refused.
3. **No route/UI/flag change** (Phase 1 wiring already resolves this crosswalk). Verify `CI=true npx next build --turbopack` green.

## Phase 3 — canary launch (separate PR, explicit auth)
Pilot org → allowlist → global `WAVE_O_ESPERTO_SUFULL_IMPORT_ENABLED=1`, per `18o-ops-runbook.md`. Confirm prod's published SU-Full version content at flip time.
