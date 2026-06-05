/**
 * Esperto → stableKey crosswalk — QSP v2 ("Quarterly Session Prep").
 *
 * Spec ref: docs/specs/v7.6/12-esperto-historical-import.md §7;
 * plan 12a steps 5, 5b.
 *
 * The 22 `map` entries are verified against `prisma/seed-qsp-v2-assessment.ts`
 * (every stableKey exists there and `ourType` matches the seed's question type)
 * and against the Esperto export (`__tests__/.../fixtures/report-qsp-v2.json`,
 * whose `raw_*` answer keys are all covered by `map` ∪ `droppedKeys`).
 *
 * templateAlias is the seed's TEMPLATE_ALIAS = "qsp-v2" (NOT the
 * "quarterly-session-prep-v2" placeholder from the spec example — the live
 * seed alias is the authority).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CROSSWALK LOCK CHECKLIST — locked is now TRUE: all 8 ambiguous orderings below
 * were CONFIRMED (2026-06-05) against the QSP seed screenshots (image9-22).
 * ─────────────────────────────────────────────────────────────────────────
 * The Esperto export gives no question LABELS, only positional Q-codes, so the
 * bindings below for the slider matrix, the START/STOP/CONTINUE triplet, and
 * the P4 pair are inferred from question ORDER. Each line must be marked
 * CONFIRMED with its screenshot ref before flipping `locked: true`. PR review
 * of this block is the gate (a wrong ordering silently mis-attributes verbatim
 * answers to the wrong stableKey — undetectable by the type/scale guard since
 * the types still match).
 *
 *   P1 slider matrix (image12 — 5 sliders, positional):
 *     [x] Q3_1 → P1_rate_success_rocks   (CONFIRM image12 row 1)   CONFIRMED ✓
 *     [x] Q3_2 → P1_rate_leadership_team (CONFIRM image12 row 2)   CONFIRMED ✓
 *     [x] Q3_3 → P1_rate_core_values     (CONFIRM image12 row 3)   CONFIRMED ✓
 *     [x] Q3_4 → P1_rate_atmosphere      (CONFIRM image12 row 4)   CONFIRMED ✓
 *     [x] Q3_6 → P1_rate_pride           (CONFIRM image12 row 5;   CONFIRMED ✓
 *             note Q3_5 is the dropped 6th slot — see droppedKeys)
 *   START / STOP / CONTINUE triplet (image15/16/17):
 *     [x] Q6 → P1_company_start          (CONFIRM image15)         CONFIRMED ✓
 *     [x] Q7 → P1_company_stop           (CONFIRM image16)         CONFIRMED ✓
 *     [x] Q8 → P1_company_continue       (CONFIRM image17)         CONFIRMED ✓
 *   P4 pair (image20):
 *     [x] Q14 → P4_critical_number       (CONFIRM image20 field 1) CONFIRMED ✓
 *     [x] Q15 → P4_top_priorities        (CONFIRM image20 field 2) CONFIRMED ✓
 *
 * (10 lines covering the 8 ambiguous orderings: 5 slider bindings + the
 * 3-element START/STOP/CONTINUE triplet + the 2-element P4 pair.)
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { Crosswalk } from "./types";

export const qspV2Crosswalk: Crosswalk = {
  templateAlias: "qsp-v2",
  espertoVariant: "QuartSessPrepv2",
  locked: true,
  map: [
    // ── PART 1: The Retrospective ──────────────────────────────────────────
    { espertoKey: "Q1", stableKey: "P1_overall_rating", ourType: "NUMBER" },
    { espertoKey: "Q2", stableKey: "P1_rating_explanation", ourType: "TEXT" },
    // P1 slider matrix (positional — see lock checklist):
    { espertoKey: "Q3_1", stableKey: "P1_rate_success_rocks", ourType: "SLIDER_LIKERT" },
    { espertoKey: "Q3_2", stableKey: "P1_rate_leadership_team", ourType: "SLIDER_LIKERT" },
    { espertoKey: "Q3_3", stableKey: "P1_rate_core_values", ourType: "SLIDER_LIKERT" },
    { espertoKey: "Q3_4", stableKey: "P1_rate_atmosphere", ourType: "SLIDER_LIKERT" },
    { espertoKey: "Q3_6", stableKey: "P1_rate_pride", ourType: "SLIDER_LIKERT" },
    { espertoKey: "Q4", stableKey: "P1_leadership_rocks_view", ourType: "TEXT" },
    { espertoKey: "Q5a", stableKey: "P1_core_values_story_1", ourType: "TEXT" },
    { espertoKey: "Q5b", stableKey: "P1_core_values_story_2", ourType: "TEXT" },
    { espertoKey: "Q5c", stableKey: "P1_core_values_story_3", ourType: "TEXT" },
    // START / STOP / CONTINUE triplet (positional — see lock checklist):
    { espertoKey: "Q6", stableKey: "P1_company_start", ourType: "TEXT" },
    { espertoKey: "Q7", stableKey: "P1_company_stop", ourType: "TEXT" },
    { espertoKey: "Q8", stableKey: "P1_company_continue", ourType: "TEXT" },
    // ── PART 2: The Personal Check-in ──────────────────────────────────────
    { espertoKey: "Q9", stableKey: "P2_checkin_slider", ourType: "SLIDER_LIKERT" },
    { espertoKey: "Q10", stableKey: "P2_checkin_explain", ourType: "TEXT" },
    // ── PART 3: The Growth Challenge ───────────────────────────────────────
    { espertoKey: "Q11", stableKey: "P3_growth_challenge", ourType: "TEXT" },
    { espertoKey: "Q12", stableKey: "P3_why_challenge", ourType: "TEXT" },
    { espertoKey: "Q13", stableKey: "P3_solution", ourType: "TEXT" },
    // ── PART 4: The Focus for Next Quarter (positional pair — see checklist) ─
    { espertoKey: "Q14", stableKey: "P4_critical_number", ourType: "TEXT" },
    { espertoKey: "Q15", stableKey: "P4_top_priorities", ourType: "TEXT" },
    // ── PART 5: Closing ────────────────────────────────────────────────────
    { espertoKey: "Remarks1", stableKey: "P5_closing", ourType: "TEXT" },
  ],
  droppedKeys: [
    { key: "Q3_5", reason: "dropped 6th slider slot — empty/0 in all exports; our 5th slider is Q3_6" },
    { key: "Q6a", reason: "unused Esperto follow-up field — empty" },
    { key: "Q7a", reason: "unused Esperto follow-up field — empty" },
    { key: "Q8a", reason: "unused Esperto follow-up field — empty" },
    { key: "Q11a", reason: "unused Esperto follow-up field — empty" },
    { key: "Q16", reason: "dead/always-empty key; closing content is in Remarks1" },
  ],
};
