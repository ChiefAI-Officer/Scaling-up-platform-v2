/**
 * Esperto → stableKey crosswalk — Scaling Up Full ("ScaleUp2").
 *
 * Spec ref: docs/specs/v7.6/12-esperto-historical-import.md §7;
 * plan 12a steps 5, 5b; Wave O Phase 2 (docs/specs/v7.6/18o-phase2-crosswalk-plan.md).
 *
 * Maps the restricted-individual SU-Full export's 61 slider answer codes
 * (Q3_1…Q12_10) onto our published-v1 stableKeys (Q01…Q61, all SLIDER_LIKERT,
 * scale 0–10). The restricted export has NO `variant` field, so this crosswalk
 * is resolved by template alias (`getCrosswalkByTemplateAlias("scaling-up-full")`),
 * never the variant path — hence `espertoVariant: null`.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CROSSWALK LOCK CHECKLIST — locked is TRUE: all 10 code families were mapped
 * to their sections by a CONTROLLED live-Esperto submission on 2026-07-02, not
 * by position (the export's Q-code order is a PROVEN permutation of survey
 * order, so position-binding is invalid and would silently mis-attribute
 * answers). PR review of this block is the gate.
 * ─────────────────────────────────────────────────────────────────────────
 * METHOD: a ScaleUp2 test campaign was filled with each of the 10 slider
 * sections set to a distinct constant (display section N → value N); the saved
 * answers were read back by code, so the family returning all-N is display
 * section N. Cross-checks passed: Q3=all-4, Q4=all-3, Q8=all-1, Q12=all-10.
 *
 *   FAMILY → SECTION (our stableKey block), confirmed by returned constant:
 *     [x] Q8  (8) → Your Employees          Q01–Q08   (returned all-1)  ✓
 *     [x] Q7  (5) → Company Culture          Q09–Q13   (returned all-2)  ✓
 *     [x] Q4  (7) → Strategy                 Q14–Q20   (returned all-3)  ✓
 *     [x] Q3  (4) → Leadership Team          Q21–Q24   (returned all-4)  ✓
 *     [x] Q5  (5) → Operational Processes    Q25–Q29   (returned all-5)  ✓
 *     [x] Q9  (5) → Sales & Marketing        Q30–Q34   (returned all-6)  ✓
 *     [x] Q10 (6) → Scalability/Innov/Tech   Q35–Q40   (returned all-7)  ✓
 *     [x] Q11 (5) → Cash                     Q41–Q45   (returned all-8)  ✓
 *     [x] Q6  (6) → Internal Communication   Q56–Q61   (returned all-9)  ✓
 *     [x] Q12 (10)→ Your Leadership          Q46–Q55   (returned all-10) ✓
 *   (Non-obvious, count-tied, that position would have gotten WRONG:
 *    Q6→Internal-Comm & Q10→Scalability; Q7→Culture, Q5→OpProc, Q9→Sales,
 *    Q11→Cash. The survey shows Internal Communication BEFORE "Making a
 *    statement"/Your Leadership — the reverse of our seed stableKey order — so
 *    the bind is by content, not position.)
 *
 *   WITHIN-BLOCK ROW ORDER: ascending (Q<n>_1 → first stableKey … Q<n>_m →
 *     last). The all-same-value decode could not distinguish rows; ascending is
 *     the QSP-confirmed Esperto convention (same survey engine). Affects only
 *     per-statement display + Wave-N same-question longitudinal deltas, never
 *     domain scores (order-independent mean). [ ] optional: confirm with a
 *     distinct-per-row submission if per-statement fidelity is ever disputed.
 *
 *   FTE / NON-SLIDER: the phase-tile FTE drivers are Q1o2_2 (permanent/temp
 *     FTE) and Q1o2_3 (freelance) — confirmed by the same decode. They are
 *     DROPPED here because the currently-published v1 has no FTE stableKeys
 *     (they live in the Wave J draft); when an FTE-bearing version publishes,
 *     move Q1o2_2/Q1o2_3 to `map` (→ Q_FTE_CONTRACT / Q_FREELANCE) and the
 *     growth-phase tile lights up with no other Wave O change.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { Crosswalk } from "./types";

export const scalingUpFullCrosswalk: Crosswalk = {
  templateAlias: "scaling-up-full",
  espertoVariant: null,
  locked: true,
  map: [
    // ── People › Your Employees (Esperto Q8_1…Q8_8) ────────────────────────
    { espertoKey: "Q8_1", stableKey: "Q01", ourType: "SLIDER_LIKERT" },
    { espertoKey: "Q8_2", stableKey: "Q02", ourType: "SLIDER_LIKERT" },
    { espertoKey: "Q8_3", stableKey: "Q03", ourType: "SLIDER_LIKERT" },
    { espertoKey: "Q8_4", stableKey: "Q04", ourType: "SLIDER_LIKERT" },
    { espertoKey: "Q8_5", stableKey: "Q05", ourType: "SLIDER_LIKERT" },
    { espertoKey: "Q8_6", stableKey: "Q06", ourType: "SLIDER_LIKERT" },
    { espertoKey: "Q8_7", stableKey: "Q07", ourType: "SLIDER_LIKERT" },
    { espertoKey: "Q8_8", stableKey: "Q08", ourType: "SLIDER_LIKERT" },
    // ── People › Company Culture (Q7_1…Q7_5) ───────────────────────────────
    { espertoKey: "Q7_1", stableKey: "Q09", ourType: "SLIDER_LIKERT" },
    { espertoKey: "Q7_2", stableKey: "Q10", ourType: "SLIDER_LIKERT" },
    { espertoKey: "Q7_3", stableKey: "Q11", ourType: "SLIDER_LIKERT" },
    { espertoKey: "Q7_4", stableKey: "Q12", ourType: "SLIDER_LIKERT" },
    { espertoKey: "Q7_5", stableKey: "Q13", ourType: "SLIDER_LIKERT" },
    // ── Strategy (Q4_1…Q4_7) ───────────────────────────────────────────────
    { espertoKey: "Q4_1", stableKey: "Q14", ourType: "SLIDER_LIKERT" },
    { espertoKey: "Q4_2", stableKey: "Q15", ourType: "SLIDER_LIKERT" },
    { espertoKey: "Q4_3", stableKey: "Q16", ourType: "SLIDER_LIKERT" },
    { espertoKey: "Q4_4", stableKey: "Q17", ourType: "SLIDER_LIKERT" },
    { espertoKey: "Q4_5", stableKey: "Q18", ourType: "SLIDER_LIKERT" },
    { espertoKey: "Q4_6", stableKey: "Q19", ourType: "SLIDER_LIKERT" },
    { espertoKey: "Q4_7", stableKey: "Q20", ourType: "SLIDER_LIKERT" },
    // ── Execution › Leadership Team (Q3_1…Q3_4) ────────────────────────────
    { espertoKey: "Q3_1", stableKey: "Q21", ourType: "SLIDER_LIKERT" },
    { espertoKey: "Q3_2", stableKey: "Q22", ourType: "SLIDER_LIKERT" },
    { espertoKey: "Q3_3", stableKey: "Q23", ourType: "SLIDER_LIKERT" },
    { espertoKey: "Q3_4", stableKey: "Q24", ourType: "SLIDER_LIKERT" },
    // ── Execution › Operational Processes (Q5_1…Q5_5) ──────────────────────
    { espertoKey: "Q5_1", stableKey: "Q25", ourType: "SLIDER_LIKERT" },
    { espertoKey: "Q5_2", stableKey: "Q26", ourType: "SLIDER_LIKERT" },
    { espertoKey: "Q5_3", stableKey: "Q27", ourType: "SLIDER_LIKERT" },
    { espertoKey: "Q5_4", stableKey: "Q28", ourType: "SLIDER_LIKERT" },
    { espertoKey: "Q5_5", stableKey: "Q29", ourType: "SLIDER_LIKERT" },
    // ── Execution › Sales & Marketing (Q9_1…Q9_5) ──────────────────────────
    { espertoKey: "Q9_1", stableKey: "Q30", ourType: "SLIDER_LIKERT" },
    { espertoKey: "Q9_2", stableKey: "Q31", ourType: "SLIDER_LIKERT" },
    { espertoKey: "Q9_3", stableKey: "Q32", ourType: "SLIDER_LIKERT" },
    { espertoKey: "Q9_4", stableKey: "Q33", ourType: "SLIDER_LIKERT" },
    { espertoKey: "Q9_5", stableKey: "Q34", ourType: "SLIDER_LIKERT" },
    // ── Execution › Scalability, Innovation & Technology (Q10_1…Q10_6) ──────
    { espertoKey: "Q10_1", stableKey: "Q35", ourType: "SLIDER_LIKERT" },
    { espertoKey: "Q10_2", stableKey: "Q36", ourType: "SLIDER_LIKERT" },
    { espertoKey: "Q10_3", stableKey: "Q37", ourType: "SLIDER_LIKERT" },
    { espertoKey: "Q10_4", stableKey: "Q38", ourType: "SLIDER_LIKERT" },
    { espertoKey: "Q10_5", stableKey: "Q39", ourType: "SLIDER_LIKERT" },
    { espertoKey: "Q10_6", stableKey: "Q40", ourType: "SLIDER_LIKERT" },
    // ── Cash (Q11_1…Q11_5) ─────────────────────────────────────────────────
    { espertoKey: "Q11_1", stableKey: "Q41", ourType: "SLIDER_LIKERT" },
    { espertoKey: "Q11_2", stableKey: "Q42", ourType: "SLIDER_LIKERT" },
    { espertoKey: "Q11_3", stableKey: "Q43", ourType: "SLIDER_LIKERT" },
    { espertoKey: "Q11_4", stableKey: "Q44", ourType: "SLIDER_LIKERT" },
    { espertoKey: "Q11_5", stableKey: "Q45", ourType: "SLIDER_LIKERT" },
    // ── You › Your Leadership / "Making a statement" (Q12_1…Q12_10) ─────────
    { espertoKey: "Q12_1", stableKey: "Q46", ourType: "SLIDER_LIKERT" },
    { espertoKey: "Q12_2", stableKey: "Q47", ourType: "SLIDER_LIKERT" },
    { espertoKey: "Q12_3", stableKey: "Q48", ourType: "SLIDER_LIKERT" },
    { espertoKey: "Q12_4", stableKey: "Q49", ourType: "SLIDER_LIKERT" },
    { espertoKey: "Q12_5", stableKey: "Q50", ourType: "SLIDER_LIKERT" },
    { espertoKey: "Q12_6", stableKey: "Q51", ourType: "SLIDER_LIKERT" },
    { espertoKey: "Q12_7", stableKey: "Q52", ourType: "SLIDER_LIKERT" },
    { espertoKey: "Q12_8", stableKey: "Q53", ourType: "SLIDER_LIKERT" },
    { espertoKey: "Q12_9", stableKey: "Q54", ourType: "SLIDER_LIKERT" },
    { espertoKey: "Q12_10", stableKey: "Q55", ourType: "SLIDER_LIKERT" },
    // ── You › Internal Communication (Q6_1…Q6_6) ───────────────────────────
    { espertoKey: "Q6_1", stableKey: "Q56", ourType: "SLIDER_LIKERT" },
    { espertoKey: "Q6_2", stableKey: "Q57", ourType: "SLIDER_LIKERT" },
    { espertoKey: "Q6_3", stableKey: "Q58", ourType: "SLIDER_LIKERT" },
    { espertoKey: "Q6_4", stableKey: "Q59", ourType: "SLIDER_LIKERT" },
    { espertoKey: "Q6_5", stableKey: "Q60", ourType: "SLIDER_LIKERT" },
    { espertoKey: "Q6_6", stableKey: "Q61", ourType: "SLIDER_LIKERT" },
  ],
  droppedKeys: [
    // CEO background intake (Q1o*) — recompute-not-store; not in published v1.
    { key: "Q1o1_1", reason: "CEO background: years the company has existed — firmographic, not a scored survey answer" },
    { key: "Q1o2_2", reason: "FTE headcount (permanent/temporary contract) — drives the growth-phase tile; DROPPED against published v1 (no FTE stableKey). Map to Q_FTE_CONTRACT once an FTE-bearing version publishes (Wave J)" },
    { key: "Q1o2_3", reason: "freelance FTE count — companion to Q1o2_2; DROPPED against published v1. Map to Q_FREELANCE once an FTE-bearing version publishes (Wave J)" },
    { key: "Q1o4", reason: "CEO background: number of leadership positions — firmographic, not scored" },
    // CEO revenue / growth firmographics (Q2o*).
    { key: "Q2o1_1", reason: "revenue/growth firmographic — CEO-only intake, not a scored survey answer" },
    { key: "Q2o1_2", reason: "revenue/growth firmographic — CEO-only intake, not scored" },
    { key: "Q2o1_3", reason: "revenue/growth firmographic — CEO-only intake, not scored" },
    { key: "Q2o2_2", reason: "revenue/growth firmographic — CEO-only intake, not scored" },
    { key: "Q2o2_3", reason: "revenue/growth firmographic — CEO-only intake, not scored" },
    // Open free-text (PII-bearing) — never imported.
    { key: "Q12open", reason: "free-text 'biggest challenge' — PII-bearing open answer; never imported (D12)" },
    // 'And on a general level' firmographics (Q13o*) — sector/market/etc.
    { key: "Q13o1_1", reason: "general-level firmographic (sector/co-founders bucket) — not a scored survey answer" },
    { key: "Q13o2_1", reason: "general-level firmographic — not scored" },
    { key: "Q13o3", reason: "general-level firmographic (industry string) — not scored" },
    { key: "Q13o4", reason: "general-level firmographic (B2B/B2C) — not scored" },
    { key: "Q13o5_1", reason: "general-level firmographic — not scored" },
    { key: "Q13o6_1", reason: "general-level firmographic — not scored" },
    { key: "Q13o6_2", reason: "general-level firmographic — not scored" },
    { key: "Q13o7_1", reason: "general-level firmographic — not scored" },
    { key: "Q13o7_2", reason: "general-level firmographic — not scored" },
    { key: "Q13o8_1", reason: "general-level firmographic — not scored" },
    // Internationalization / investor yes-no + self-estimate.
    { key: "Q16", reason: "internationalization/investor yes-no — CEO-only intake, not a scored slider" },
    { key: "Q17", reason: "internationalization/investor yes-no — CEO-only intake, not a scored slider" },
    { key: "ScoreSchatting", reason: "respondent's pre-survey ScaleUp-score self-estimate — not a scored survey answer (ADR-0015: our report doesn't reproduce Esperto's 0–100 index)" },
    // Demographics — PII we neither render nor score.
    { key: "country", reason: "demographic (country) — PII, not rendered/scored; dropped (D12)" },
    { key: "state", reason: "demographic (state/province) — PII, not rendered/scored; dropped (D12)" },
    { key: "provincie", reason: "demographic (province) — PII, not rendered/scored; dropped (D12)" },
    { key: "postcode", reason: "demographic (postal code) — PII, not rendered/scored; dropped (D12)" },
    { key: "geslacht", reason: "demographic (gender) — PII, not rendered/scored; dropped (D12)" },
    { key: "leeftijd", reason: "demographic (age) — PII, not rendered/scored; dropped (D12)" },
  ],
};
