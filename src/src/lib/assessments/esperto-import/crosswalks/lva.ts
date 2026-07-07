/**
 * Esperto → stableKey crosswalk — Leadership Vision Alignment (Wave X).
 *
 * Spec ref: docs/specs/v7.6/19x-wave-x-lva-rockefeller-import.md (X-4, V1–V3);
 * 12-esperto-historical-import.md §7 lock rules.
 *
 * templateAlias is the seed's TEMPLATE_ALIAS = "leadership-vision-alignment"
 * (prisma/seed-lva-assessment.ts); imports pin the latest published version.
 *
 * Mapping evidence (2026-07-06/07 study — sample export + xlsx twin header +
 * the LVA source workbook + the spec-18 fidelity audit):
 *  - S1 financials: Q1_1 + Q1a_2..9 → the 9 NUMBER questions, positional in
 *    seed/source order (verification family V1 — count-tied; run-sheet uses
 *    distinct values 11..99).
 *  - S2 vision: plain Q8..Q15 → the 8 TEXT questions positional (source xlsx
 *    sharedStrings indices 20–27).
 *  - S3 matrix: Q16_1..16 → S3_<factor> in FACTOR order (1–3 scale, identical
 *    to the seed's — no transform; verification family V2, cycling pattern).
 *  - S4: Q16a → S4_biggest_obstacles, MULTI_CHOICE — the value is a
 *    comma-separated list of 1-BASED FACTOR INDICES (e.g. "15,10,9"), decoded
 *    by the restricted adapter against the pinned version's option order
 *    (D7). Confirmed self-validating in the sample: the non-empty Q17_N
 *    exactly match Q16a's indices.
 *  - S5: Q17_1..16 → S5_why_<factor> (empty string = unanswered → dropped by
 *    the blank rule, mirroring LVA's live conditional visibility);
 *    Q18 → S5_other_factor; Q19 → S5_change_one_thing.
 *  - S6: Q20 (NUMBER, sample value 100) → S6_rehire_pct; Q21..Q30 + Q29a →
 *    positional through S6_priority_quarter (sample semantics all corroborate;
 *    note Q29a = priority_year sits BETWEEN Q29 and Q30).
 *  - S6 PROVISIONAL TAIL (verification family V3 — Esperto's tail numbering
 *    does NOT follow the form's display order): Q31 → constructive_discussions
 *    ("yes, things." = yes+explain), Q32 → add_leadership_position ("sales"),
 *    Q34 → dept_kpis ("calls, conversions, mrr" = three KPIs). Q33 has no
 *    seed home. The D4 controlled submission settles V3 before lock.
 *
 * droppedKeys: currency (S1 context; no platform question), Q15A/Q15B
 * (empty in the sample; likely conditional follow-ups — identities recorded
 * from the controlled submission), Q33/Q35/Q36 (xlsx-header keys with no
 * seed home; Q35/Q36 are absent from the JSON when empty — the map∪dropped
 * UNION, not any single export, is the universe).
 *
 * `espertoVariant` stays null DELIBERATELY (report-kind path must keep
 * refusing; restricted exports carry no variant).
 *
 * `locked: false` until the D4 controlled verification submission resolves
 * V1–V3 (19x run-sheet; golden-fixture CI gate per Codex C4).
 */

import type { Crosswalk, CrosswalkEntry } from "./types";

/** The 16 factor slugs, in matrix order — MUST mirror the seed's FACTOR_STABLE_KEYS. */
export const LVA_FACTOR_ORDER = [
  "recruitment",
  "retaining_staff",
  "leadership_team",
  "the_leadership",
  "culture",
  "internal_comms",
  "strategy",
  "execution",
  "marketing",
  "sales",
  "technology",
  "scalability",
  "innovation",
  "financial_processes",
  "cash",
  "growth_financing",
] as const;

function buildMap(): CrosswalkEntry[] {
  const map: CrosswalkEntry[] = [];

  // S1 financials — positional (V1).
  const s1 = [
    "S1_revenue",
    "S1_gross_margin",
    "S1_net_profit_pct",
    "S1_customers",
    "S1_total_employees",
    "S1_permanent_fte",
    "S1_parttime_fte",
    "S1_branches",
    "S1_countries",
  ];
  map.push({ espertoKey: "Q1_1", stableKey: s1[0], ourType: "NUMBER" });
  for (let i = 2; i <= 9; i++) {
    map.push({ espertoKey: `Q1a_${i}`, stableKey: s1[i - 1], ourType: "NUMBER" });
  }

  // S2 vision — positional (source xlsx indices 20–27).
  const s2 = [
    "S2_main_products",
    "S2_main_partners",
    "S2_main_competitors",
    "S2_media",
    "S2_reason_success",
    "S2_employees_say",
    "S2_major_initiatives",
    "S2_reason_not_reach",
  ];
  for (let i = 0; i < 8; i++) {
    map.push({ espertoKey: `Q${8 + i}`, stableKey: s2[i], ourType: "TEXT" });
  }

  // S3 matrix (V2) + S5 why-texts — factor order.
  for (let n = 1; n <= 16; n++) {
    map.push({
      espertoKey: `Q16_${n}`,
      stableKey: `S3_${LVA_FACTOR_ORDER[n - 1]}`,
      ourType: "SLIDER_LIKERT",
    });
  }
  map.push({ espertoKey: "Q16a", stableKey: "S4_biggest_obstacles", ourType: "MULTI_CHOICE" });
  for (let n = 1; n <= 16; n++) {
    map.push({
      espertoKey: `Q17_${n}`,
      stableKey: `S5_why_${LVA_FACTOR_ORDER[n - 1]}`,
      ourType: "TEXT",
    });
  }

  // S5 tail.
  map.push({ espertoKey: "Q18", stableKey: "S5_other_factor", ourType: "TEXT" });
  map.push({ espertoKey: "Q19", stableKey: "S5_change_one_thing", ourType: "TEXT" });

  // S6 focus block — Q20..Q30 + Q29a positional; V3 provisional tail.
  map.push({ espertoKey: "Q20", stableKey: "S6_rehire_pct", ourType: "NUMBER" });
  const s6Text: Array<[string, string]> = [
    ["Q21", "S6_bhag"],
    ["Q22", "S6_core_purpose"],
    ["Q23", "S6_core_values"],
    ["Q24", "S6_market_focus"],
    ["Q25", "S6_core_customer"],
    ["Q26", "S6_strategy_one_sentence"],
    ["Q27", "S6_strategy_implementation"],
    ["Q28", "S6_goals_clear"],
    ["Q29", "S6_priority_org"],
    ["Q29a", "S6_priority_year"],
    ["Q30", "S6_priority_quarter"],
    // V3 PROVISIONAL — settled by the D4 controlled submission before lock:
    ["Q31", "S6_constructive_discussions"],
    ["Q32", "S6_add_leadership_position"],
    ["Q34", "S6_dept_kpis"],
  ];
  for (const [espertoKey, stableKey] of s6Text) {
    map.push({ espertoKey, stableKey, ourType: "TEXT" });
  }

  return map;
}

export const lvaCrosswalk: Crosswalk = {
  templateAlias: "leadership-vision-alignment",
  espertoVariant: null,
  locked: false,
  map: buildMap(),
  droppedKeys: [
    { key: "currency", reason: "S1 financial-context currency selector — no platform question; amounts import as entered" },
    { key: "Q15A", reason: "empty in the sample; likely a conditional S2 follow-up — identity recorded from the D4 controlled submission (no seed home)" },
    { key: "Q15B", reason: "empty in the sample; likely a conditional S2 follow-up — identity recorded from the D4 controlled submission (no seed home)" },
    { key: "Q33", reason: "V3 tail key with no seed home (empty in the sample); identity recorded from the D4 controlled submission" },
    { key: "Q35", reason: "xlsx-header-only key (JSON omits it when empty); no seed home; identity recorded from the D4 controlled submission" },
    { key: "Q36", reason: "xlsx-header-only key (JSON omits it when empty); no seed home; identity recorded from the D4 controlled submission" },
  ],
};
