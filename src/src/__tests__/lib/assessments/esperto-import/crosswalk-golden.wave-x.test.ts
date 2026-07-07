/**
 * Wave X (spec 19x, X-7 / Codex C4) — GOLDEN-FIXTURE lock gate.
 *
 * These fixtures are SANITIZED captures of controlled Esperto verification
 * submissions taken on the test account 2026-07-07 (identity faked; the
 * marker text + designed values are synthetic — no real PII). Each was filled
 * with a self-identifying pattern so the binding of every Esperto Q-code to
 * our stableKey is provable, not inferred:
 *   - Rockefeller: section s, row j → value (s+j)%4 (cycling, incl. 0s).
 *   - LVA: financials 11..99 positional; S3 matrix cycled; Q16a pick = 1,10,16;
 *     every TEXT answered "XV: <first words of its question>".
 *
 * The lock gate (below) REQUIRES a golden fixture for every `locked:true`
 * crosswalk — a crosswalk cannot claim locked without a captured export that
 * proves it. This is the automated half of the 12a §5b lock checklist.
 */
import rockGolden from "./fixtures/wavex-rock-golden.json";
import lvaGolden from "./fixtures/wavex-lva-golden.json";
import { rockefellerCrosswalk } from "@/lib/assessments/esperto-import/crosswalks/rockefeller";
import { lvaCrosswalk, LVA_FACTOR_ORDER } from "@/lib/assessments/esperto-import/crosswalks/lva";
import {
  ALL_CROSSWALKS,
  validateCrosswalkExhaustive,
} from "@/lib/assessments/esperto-import/crosswalks";
import { decodeMultiChoiceIndices } from "@/lib/assessments/esperto-import/restricted-plan";
import { buildRockefellerContent } from "../../../../../prisma/seed-rockefeller-assessment";
import { scoreSubmission, type TemplateVersionForScoring } from "@/lib/assessments/scoring";

type Raw = Record<string, unknown>;
const rockRaw = rockGolden.raw as Raw;
const lvaRaw = lvaGolden.raw as Raw;

// A registry of the golden fixtures keyed by crosswalk alias. The lock gate
// asserts every locked crosswalk has an entry here.
const GOLDEN_BY_ALIAS: Record<string, Raw> = {
  RockHabits: rockRaw,
  "leadership-vision-alignment": lvaRaw,
};

describe("Wave X lock gate — every locked crosswalk has a golden fixture (Codex C4)", () => {
  // Pre-Wave-X locked crosswalks predate the golden-fixture regime: qsp-v2 was
  // verified under the original 12a §5b lock checklist (report-qsp-v2.json),
  // and scaling-up-full via the Wave O controlled canary submission (spec 18o).
  // The C4 gate governs crosswalks locked from Wave X onward.
  const PRE_WAVE_X_LOCKED = new Set(["qsp-v2", "scaling-up-full"]);

  it("no crosswalk locked from Wave X onward is locked:true without a registered golden fixture", () => {
    for (const cw of ALL_CROSSWALKS) {
      if (cw.locked && !PRE_WAVE_X_LOCKED.has(cw.templateAlias)) {
        expect(Object.keys(GOLDEN_BY_ALIAS)).toContain(cw.templateAlias);
      }
    }
  });

  it("both Wave X crosswalks are LOCKED (verification complete 2026-07-07)", () => {
    expect(rockefellerCrosswalk.locked).toBe(true);
    expect(lvaCrosswalk.locked).toBe(true);
  });

  // Generalized over ALL non-exempt locked crosswalks so a future lock flip
  // cannot register a hollow fixture (e.g. raw: {}) and pass: the fixture must
  // (a) contain no keys the crosswalk doesn't know (exhaustiveness) and
  // (b) contain EVERY mapped espertoKey (coverage — empty-string answers count;
  //     keys the vendor omits from JSON when empty belong in droppedKeys, not map).
  it("each golden fixture is exhaustive AND fully covers its crosswalk's mapped keys", () => {
    for (const cw of ALL_CROSSWALKS) {
      if (!cw.locked || PRE_WAVE_X_LOCKED.has(cw.templateAlias)) continue;
      const raw = GOLDEN_BY_ALIAS[cw.templateAlias];
      expect(raw).toBeDefined();
      // (a) no unknown keys in the fixture
      expect(validateCrosswalkExhaustive(cw, Object.keys(raw))).toEqual({
        ok: true,
        unknownKeys: [],
      });
      // (b) every mapped espertoKey appears in the fixture raw
      const rawKeys = new Set(Object.keys(raw));
      const missing = cw.map.map((e) => e.espertoKey).filter((k) => !rawKeys.has(k));
      expect(missing).toEqual([]);
    }
  });
});

describe("Rockefeller golden fixture — every binding + known-answer parity", () => {
  it("all 40 raw values equal the designed (s+j)%4 pattern (proves within-section row order)", () => {
    for (let s = 1; s <= 10; s++) {
      for (let j = 1; j <= 4; j++) {
        expect(rockRaw[`Q${s}_${j}`]).toBe((s + j) % 4);
      }
    }
  });

  it("recompute matches the VENDOR-computed totals in the export (parity, incl. 0-valued answers)", () => {
    const content = buildRockefellerContent();
    const answers = Object.entries(rockRaw).map(([stableKey, value]) => ({
      stableKey,
      value: value as number,
    }));
    const result = scoreSubmission(
      {
        questions: content.questions,
        sections: content.sections,
        scoringConfig: content.scoringConfig,
      } as TemplateVersionForScoring,
      answers,
    );
    // Parity target = Esperto's own `processed` block from the captured export,
    // NOT values re-derived from the same raw we feed the scorer.
    expect(result.overallTotal).toBe(rockGolden.processed.overall_total);
    expect(result.countAchieved).toBe(rockGolden.processed.count_achieved);
    // Sanity: the designed pattern's arithmetic total (Σ (s+j)%4 over 10×4) is 60.
    expect(rockGolden.processed.overall_total).toBe(60);
  });
});

describe("LVA golden fixture — V1/V2/V3 bindings proven by self-identifying answers", () => {
  it("V1 — financials are positional (Q1_1=11, Q1a_2..9 = 22..99)", () => {
    expect(lvaRaw["Q1_1"]).toBe(11);
    for (let i = 2; i <= 9; i++) expect(lvaRaw[`Q1a_${i}`]).toBe(i * 11);
    // The crosswalk maps these to the 9 S1 NUMBER keys in the same order.
    const s1 = lvaCrosswalk.map.filter((e) => e.stableKey.startsWith("S1_"));
    expect(s1).toHaveLength(9);
    expect(s1.every((e) => e.ourType === "NUMBER")).toBe(true);
  });

  it("V2 — Q16a = '1,10,16' decodes to recruitment/sales/growth_financing, matching the non-empty Q17 why-texts", () => {
    expect(lvaRaw["Q16a"]).toBe("1,10,16");
    const mc = lvaCrosswalk.map.find((e) => e.espertoKey === "Q16a")!;
    const decoded = decodeMultiChoiceIndices(lvaRaw["Q16a"] as string, mc.optionOrder!, 3);
    expect(decoded.ok).toBe(true);
    if (decoded.ok) {
      expect(decoded.value).toEqual(["recruitment", "sales", "growth_financing"]);
    }
    // The why-texts present are exactly for the picked factor indices (1,10,16).
    const nonEmptyWhy = [];
    for (let n = 1; n <= 16; n++) {
      const v = lvaRaw[`Q17_${n}`];
      if (typeof v === "string" && v.trim() !== "") nonEmptyWhy.push(n);
    }
    expect(nonEmptyWhy).toEqual([1, 10, 16]);
    // Each of those maps to S5_why_<factor> for the same factor.
    for (const n of nonEmptyWhy) {
      const e = lvaCrosswalk.map.find((x) => x.espertoKey === `Q17_${n}`)!;
      expect(e.stableKey).toBe(`S5_why_${LVA_FACTOR_ORDER[n - 1]}`);
    }
  });

  it("V3 — the provisional tail is CONFIRMED: Q31/Q32/Q34 markers name their mapped questions; Q33 empty→dropped", () => {
    // Marker convention: 'XV: <first words>' — captured live from each question.
    const expectTail: Record<string, [string, string]> = {
      // espertoKey: [marker fragment, mapped stableKey]
      Q31: ["Is the leadership team", "S6_constructive_discussions"],
      Q32: ["What leadership position", "S6_add_leadership_position"],
      Q34: ["What are the three", "S6_dept_kpis"],
    };
    for (const [q, [frag, stableKey]] of Object.entries(expectTail)) {
      expect(String(lvaRaw[q])).toContain(frag);
      const e = lvaCrosswalk.map.find((x) => x.espertoKey === q)!;
      expect(e.stableKey).toBe(stableKey);
    }
    // Q33 is empty in the form version → carried in droppedKeys, never mapped.
    expect(String(lvaRaw["Q33"] ?? "")).toBe("");
    expect(lvaCrosswalk.droppedKeys.map((d) => d.key)).toContain("Q33");
    expect(lvaCrosswalk.map.find((e) => e.espertoKey === "Q33")).toBeUndefined();
  });

  // Every positional TEXT binding, pinned two ways: the fixture's captured
  // self-identifying marker (proves what the vendor stored under that Q-code)
  // AND the crosswalk's espertoKey→stableKey mapping (so a positional swap in
  // buildMap() — e.g. Q23↔Q24 — fails here even though set-equality tests pass).
  // Note: some adjacent fragments repeat verbatim (Q9/Q10 "Who are the main",
  // Q29/Q29a/Q30 "What is in your") — for those the stableKey pin, not the
  // marker, is what freezes the binding; their order was verified live in D4.
  it("every positional TEXT binding is pinned: fixture marker + mapped stableKey (anti-swap)", () => {
    const table: Array<[string, string, string]> = [
      // espertoKey, fixture marker fragment, mapped stableKey
      ["Q8", "XV: What are the main", "S2_main_products"],
      ["Q9", "XV: Who are the main", "S2_main_partners"],
      ["Q10", "XV: Who are the main", "S2_main_competitors"],
      ["Q11", "XV: What do the media", "S2_media"],
      ["Q12", "XV: What is the main", "S2_reason_success"],
      ["Q13", "XV: What do employees say", "S2_employees_say"],
      ["Q14", "XV: What are the major", "S2_major_initiatives"],
      ["Q15", "XV: What could be the", "S2_reason_not_reach"],
      ["Q18", "XV: Is another factor hindering", "S5_other_factor"],
      ["Q19", "XV: If you could change", "S5_change_one_thing"],
      ["Q21", "XV: What is the longterm", "S6_bhag"],
      ["Q22", "XV: What is the core", "S6_core_purpose"],
      ["Q23", "XV: What do you think", "S6_core_values"],
      ["Q24", "XV: Is there a clear", "S6_market_focus"],
      ["Q25", "XV: What is the defined", "S6_core_customer"],
      ["Q26", "XV: Describe the companys strategy", "S6_strategy_one_sentence"],
      ["Q27", "XV: Does the company manage", "S6_strategy_implementation"],
      ["Q28", "XV: Are the goals for", "S6_goals_clear"],
      ["Q29", "XV: What is in your", "S6_priority_org"],
      ["Q29a", "XV: What is in your", "S6_priority_year"],
      ["Q30", "XV: What is in your", "S6_priority_quarter"],
    ];
    for (const [q, frag, stableKey] of table) {
      expect(String(lvaRaw[q])).toContain(frag);
      expect(lvaCrosswalk.map.find((x) => x.espertoKey === q)?.stableKey).toBe(stableKey);
    }
    // Q20 is the lone S6 NUMBER — designed value 42.
    expect(lvaRaw["Q20"]).toBe(42);
    expect(lvaCrosswalk.map.find((x) => x.espertoKey === "Q20")?.stableKey).toBe("S6_rehire_pct");
  });
});
