/**
 * Esperto → stableKey crosswalk module — unit tests.
 *
 * Spec ref: docs/specs/v7.6/12-esperto-historical-import.md §7;
 * plan 12a steps 5, 5b, 6.
 *
 * PURE: no DB. The crosswalk maps Esperto answer Q-codes to our pinned-version
 * stableKeys + types, and the registry/validators enforce exhaustiveness (every
 * answer key mapped or explicitly dropped) and pinned-version type/scale
 * compatibility (ADR-0001 / spec §7).
 *
 * The QSP fixture's actual answer keys are derived from report-qsp-v2.json
 * personal[0] (raw_* keys, stripped of the `raw_` prefix), so the test proves
 * the crosswalk covers the REAL export, not a hand-listed set.
 */

import reportQspV2 from "./fixtures/report-qsp-v2.json";
import restrictedIndividual from "./fixtures/restricted-individual.json";

import { qspV2Crosswalk } from "../../../../lib/assessments/esperto-import/crosswalks/qsp-v2";
import { rockefellerCrosswalk } from "../../../../lib/assessments/esperto-import/crosswalks/rockefeller";
import { lvaCrosswalk } from "../../../../lib/assessments/esperto-import/crosswalks/lva";
import { scalingUpFullCrosswalk } from "../../../../lib/assessments/esperto-import/crosswalks/scaling-up-full";
import { buildRockefellerContent } from "../../../../../prisma/seed-rockefeller-assessment";
import { scoreSubmission } from "../../../../lib/assessments/scoring";
import { buildLvaContent } from "../../../../../prisma/seed-lva-assessment";
import {
  getCrosswalkByVariant,
  getCrosswalkByTemplateAlias,
  validateCrosswalkExhaustive,
  validateCrosswalkAgainstVersion,
} from "../../../../lib/assessments/esperto-import/crosswalks";
import type { Crosswalk } from "../../../../lib/assessments/esperto-import/crosswalks/types";

// ── Helpers ───────────────────────────────────────────────────────────────

/** Derive the actual ANSWER keys from the QSP fixture (raw_* → Q-code). */
function fixtureAnswerKeys(): string[] {
  const row = (reportQspV2 as { personal: Record<string, unknown>[] }).personal[0];
  return Object.keys(row)
    .filter((k) => k.startsWith("raw_"))
    .map((k) => k.slice("raw_".length));
}

/** Build a mock pinned version whose questions match the crosswalk map. */
function versionFromCrosswalk(c: Crosswalk) {
  return c.map.map((e) => {
    const q: { stableKey: string; type: string; scale?: { min: number; max: number } } = {
      stableKey: e.stableKey,
      type: e.ourType,
    };
    if (e.ourType === "SLIDER_LIKERT") q.scale = { min: 1, max: 10 };
    return q;
  });
}

// ── QSP v2 crosswalk content ────────────────────────────────────────────────

describe("qspV2Crosswalk", () => {
  it("targets the qsp-v2 template alias + QuartSessPrepv2 variant, LOCKED (confirmed 2026-06-05)", () => {
    expect(qspV2Crosswalk.templateAlias).toBe("qsp-v2");
    expect(qspV2Crosswalk.espertoVariant).toBe("QuartSessPrepv2");
    expect(qspV2Crosswalk.locked).toBe(true);
  });

  it("has exactly the 22 expected map entries (espertoKey → stableKey + type)", () => {
    expect(qspV2Crosswalk.map).toHaveLength(22);

    const byKey = new Map(qspV2Crosswalk.map.map((e) => [e.espertoKey, e]));
    const expected: Array<[string, string, string]> = [
      ["Q1", "P1_overall_rating", "NUMBER"],
      ["Q2", "P1_rating_explanation", "TEXT"],
      ["Q3_1", "P1_rate_success_rocks", "SLIDER_LIKERT"],
      ["Q3_2", "P1_rate_leadership_team", "SLIDER_LIKERT"],
      ["Q3_3", "P1_rate_core_values", "SLIDER_LIKERT"],
      ["Q3_4", "P1_rate_atmosphere", "SLIDER_LIKERT"],
      ["Q3_6", "P1_rate_pride", "SLIDER_LIKERT"],
      ["Q4", "P1_leadership_rocks_view", "TEXT"],
      ["Q5a", "P1_core_values_story_1", "TEXT"],
      ["Q5b", "P1_core_values_story_2", "TEXT"],
      ["Q5c", "P1_core_values_story_3", "TEXT"],
      ["Q6", "P1_company_start", "TEXT"],
      ["Q7", "P1_company_stop", "TEXT"],
      ["Q8", "P1_company_continue", "TEXT"],
      ["Q9", "P2_checkin_slider", "SLIDER_LIKERT"],
      ["Q10", "P2_checkin_explain", "TEXT"],
      ["Q11", "P3_growth_challenge", "TEXT"],
      ["Q12", "P3_why_challenge", "TEXT"],
      ["Q13", "P3_solution", "TEXT"],
      ["Q14", "P4_critical_number", "TEXT"],
      ["Q15", "P4_top_priorities", "TEXT"],
      ["Remarks1", "P5_closing", "TEXT"],
    ];

    for (const [espertoKey, stableKey, ourType] of expected) {
      const entry = byKey.get(espertoKey);
      expect(entry).toBeDefined();
      expect(entry!.stableKey).toBe(stableKey);
      expect(entry!.ourType).toBe(ourType);
    }
  });

  it("drops exactly the 6 unmapped Esperto keys with reasons", () => {
    const droppedKeys = qspV2Crosswalk.droppedKeys.map((d) => d.key).sort();
    expect(droppedKeys).toEqual(["Q11a", "Q16", "Q3_5", "Q6a", "Q7a", "Q8a"]);
    for (const d of qspV2Crosswalk.droppedKeys) {
      expect(d.reason.length).toBeGreaterThan(0);
    }
  });

  it("has no stableKey appearing twice in the map", () => {
    const stableKeys = qspV2Crosswalk.map.map((e) => e.stableKey);
    expect(new Set(stableKeys).size).toBe(stableKeys.length);
  });
});

// ── Registry lookups ─────────────────────────────────────────────────────────

describe("crosswalk registry", () => {
  it("resolves QSP v2 by Esperto variant", () => {
    expect(getCrosswalkByVariant("QuartSessPrepv2")).toBe(qspV2Crosswalk);
  });

  it("resolves QSP v2 by template alias", () => {
    expect(getCrosswalkByTemplateAlias("qsp-v2")).toBe(qspV2Crosswalk);
  });

  it("returns null for an unknown variant", () => {
    expect(getCrosswalkByVariant("NopeNotAVariant")).toBeNull();
  });

  it("returns null for an unknown template alias", () => {
    expect(getCrosswalkByTemplateAlias("nope-not-an-alias")).toBeNull();
  });

  it("registers Rockefeller + LVA as authored + LOCKED (Wave X — D4 verification complete 2026-07-07)", () => {
    expect(rockefellerCrosswalk.locked).toBe(true);
    expect(rockefellerCrosswalk.map).toHaveLength(40);
    expect(rockefellerCrosswalk.templateAlias).toBe("RockHabits");

    expect(lvaCrosswalk.locked).toBe(true);
    expect(lvaCrosswalk.map).toHaveLength(67);
    expect(lvaCrosswalk.templateAlias).toBe("leadership-vision-alignment");
  });

  it("resolves the Rockefeller + LVA crosswalks by alias", () => {
    expect(getCrosswalkByTemplateAlias("RockHabits")).toBe(rockefellerCrosswalk);
    expect(getCrosswalkByTemplateAlias("leadership-vision-alignment")).toBe(lvaCrosswalk);
  });

  it("keeps Rockefeller + LVA OUT of the report-kind variant path (espertoVariant null)", () => {
    // Restricted exports carry no `variant`; the report-kind path must never
    // accidentally resolve these unverified-for-report-kind crosswalks.
    expect(rockefellerCrosswalk.espertoVariant).toBeNull();
    expect(lvaCrosswalk.espertoVariant).toBeNull();
    expect(getCrosswalkByVariant("RockHabits")).toBeNull();
    expect(getCrosswalkByVariant("LeadVision")).toBeNull();
  });
});

// ── Wave X (19x X-5) — Rockefeller crosswalk ───────────────────────────────

describe("rockefellerCrosswalk (Wave X)", () => {
  it("is the identity map: Q{s}_{q} → Q{s}_{q} × 40, all SLIDER_LIKERT", () => {
    const expected: string[] = [];
    for (let s = 1; s <= 10; s++) {
      for (let q = 1; q <= 4; q++) expected.push(`Q${s}_${q}`);
    }
    expect(rockefellerCrosswalk.map.map((e) => e.espertoKey)).toEqual(expected);
    for (const e of rockefellerCrosswalk.map) {
      expect(e.stableKey).toBe(e.espertoKey);
      expect(e.ourType).toBe("SLIDER_LIKERT");
    }
  });

  it("has an empty droppedKeys (raw universe = exactly the 40 sliders — xlsx-header verified)", () => {
    expect(rockefellerCrosswalk.droppedKeys).toEqual([]);
  });

  it("is exhaustive over the full 40-key export shape AND over a sparser shape (JSON omits empties)", () => {
    const fullKeys = rockefellerCrosswalk.map.map((e) => e.espertoKey);
    expect(validateCrosswalkExhaustive(rockefellerCrosswalk, fullKeys).ok).toBe(true);
    // A respondent who skipped some sliders → fewer keys, still exhaustive.
    expect(validateCrosswalkExhaustive(rockefellerCrosswalk, fullKeys.slice(0, 25)).ok).toBe(true);
    // An unknown key is a hard error (schema tripwire, D8 fallback).
    const injected = validateCrosswalkExhaustive(rockefellerCrosswalk, [...fullKeys, "Q11_1"]);
    expect(injected.ok).toBe(false);
    expect(injected.unknownKeys).toEqual(["Q11_1"]);
  });

  it("is compatible with the seed's version content (types + scales)", () => {
    const content = buildRockefellerContent();
    const versionQuestions = content.questions.map((q) => ({
      stableKey: q.stableKey,
      type: q.type,
      scale: q.scale,
    }));
    const compat = validateCrosswalkAgainstVersion(rockefellerCrosswalk, versionQuestions);
    expect(compat.problems).toEqual([]);
    expect(compat.ok).toBe(true);
  });

  it("known-answer: recomputed score matches hand-computed totals/avg/countAchieved incl. 0-valued answers", () => {
    // Synthetic designed round (NOT Jeff's file — never commit derived copies):
    // section s, row j → value (s + j) mod 4 — the same pattern as the D4
    // verification run-sheet; includes 0s (valid on the 4-pt scale).
    const content = buildRockefellerContent();
    const answers: { stableKey: string; value: number }[] = [];
    let expectedTotal = 0;
    let expectedAchieved = 0;
    for (let s = 1; s <= 10; s++) {
      for (let q = 1; q <= 4; q++) {
        const value = (s + q) % 4;
        answers.push({ stableKey: `Q${s}_${q}`, value });
        expectedTotal += value;
        if (value >= 2) expectedAchieved += 1; // passThreshold: 2 (countAchieved semantics)
      }
    }
    const result = scoreSubmission(
      {
        questions: content.questions,
        sections: content.sections,
        scoringConfig: content.scoringConfig,
      } as never,
      answers,
    );
    expect(result.overallTotal).toBe(expectedTotal);
    expect(result.countAchieved).toBe(expectedAchieved);
    expect(result.overallAverage).toBeCloseTo(expectedTotal / 40, 10);
    expect(result.tierMetricValue).toBe(expectedAchieved);
  });
});

// ── Wave X (19x X-4) — LVA crosswalk ───────────────────────────────────────

describe("lvaCrosswalk (Wave X)", () => {
  /** The sample JSON export's 71 raw keys (structural shape, no data). */
  function sampleJsonKeys(): string[] {
    const keys: string[] = ["Q1_1"];
    for (let i = 2; i <= 9; i++) keys.push(`Q1a_${i}`);
    for (let i = 8; i <= 15; i++) keys.push(`Q${i}`);
    keys.push("Q15A", "Q15B");
    for (let n = 1; n <= 16; n++) keys.push(`Q16_${n}`);
    keys.push("Q16a");
    for (let n = 1; n <= 16; n++) keys.push(`Q17_${n}`);
    for (let i = 18; i <= 34; i++) keys.push(`Q${i}`);
    keys.push("Q29a", "currency");
    return keys; // 71
  }

  it("maps all 67 seed questions — set-equal with buildLvaContent, no duplicates", () => {
    const content = buildLvaContent();
    const contentKeys = content.questions.map((q) => q.stableKey).sort();
    const mappedKeys = lvaCrosswalk.map.map((e) => e.stableKey).sort();
    expect(mappedKeys).toEqual(contentKeys);
    expect(new Set(mappedKeys).size).toBe(mappedKeys.length);
    expect(lvaCrosswalk.map).toHaveLength(67);
  });

  it("is exhaustive over the sample's 71-key JSON shape AND the 73-key xlsx-union shape", () => {
    const json71 = sampleJsonKeys();
    expect(json71).toHaveLength(71);
    expect(validateCrosswalkExhaustive(lvaCrosswalk, json71).ok).toBe(true);
    // Q35/Q36 exist only in the xlsx header (JSON omits empty keys per-key) —
    // a historical respondent who answered them must not hard-fail.
    const union73 = [...json71, "Q35", "Q36"];
    expect(validateCrosswalkExhaustive(lvaCrosswalk, union73).ok).toBe(true);
    // Unknown keys stay a hard error (schema tripwire).
    const injected = validateCrosswalkExhaustive(lvaCrosswalk, [...json71, "Q99"]);
    expect(injected.ok).toBe(false);
    expect(injected.unknownKeys).toEqual(["Q99"]);
  });

  it("is compatible with the seed's version content (types + scales + MC options)", () => {
    const content = buildLvaContent();
    const versionQuestions = content.questions.map((q) => ({
      stableKey: q.stableKey,
      type: q.type,
      scale: (q as { scale?: { min: number; max: number } }).scale,
      options: (q as { options?: { key: string }[] }).options,
      maxChoices: (q as { maxChoices?: number }).maxChoices,
    }));
    const compat = validateCrosswalkAgainstVersion(lvaCrosswalk, versionQuestions);
    expect(compat.problems).toEqual([]);
    expect(compat.ok).toBe(true);
  });

  it("version-compat FAILS when the MC question lacks options (Wave X D7 rule)", () => {
    const content = buildLvaContent();
    const versionQuestions = content.questions.map((q) => ({
      stableKey: q.stableKey,
      type: q.type,
      scale: (q as { scale?: { min: number; max: number } }).scale,
      // options deliberately omitted
    }));
    const compat = validateCrosswalkAgainstVersion(lvaCrosswalk, versionQuestions);
    expect(compat.ok).toBe(false);
    expect(compat.problems.some((p) => p.includes("S4_biggest_obstacles") && p.includes("no options"))).toBe(true);
  });

  it("binds the 16-factor matrix and why-texts in the SAME factor order as the seed's S4 options", () => {
    const content = buildLvaContent();
    const s4 = content.questions.find((q) => q.stableKey === "S4_biggest_obstacles") as {
      options: { key: string }[];
    };
    const optionOrder = s4.options.map((o) => o.key);
    for (let n = 1; n <= 16; n++) {
      const matrix = lvaCrosswalk.map.find((e) => e.espertoKey === `Q16_${n}`)!;
      const why = lvaCrosswalk.map.find((e) => e.espertoKey === `Q17_${n}`)!;
      expect(matrix.stableKey).toBe(`S3_${optionOrder[n - 1]}`);
      expect(why.stableKey).toBe(`S5_why_${optionOrder[n - 1]}`);
    }
  });

  it("Q16a is the single MULTI_CHOICE entry, with the pinned Esperto index order (D7/MED-4)", () => {
    const mc = lvaCrosswalk.map.filter((e) => e.ourType === "MULTI_CHOICE");
    expect(mc).toHaveLength(1);
    expect(mc[0]).toMatchObject({
      espertoKey: "Q16a",
      stableKey: "S4_biggest_obstacles",
      ourType: "MULTI_CHOICE",
    });
    // The decode targets the CROSSWALK's order — a later version-edit that
    // reorders options can never remap historical picks.
    const content = buildLvaContent();
    const s4 = content.questions.find((q) => q.stableKey === "S4_biggest_obstacles") as {
      options: { key: string }[];
    };
    expect([...mc[0].optionOrder!]).toEqual(s4.options.map((o) => o.key));
  });

  it("version-compat FAILS when the version's option keys are not set-equal to the pinned optionOrder (MED-4)", () => {
    const content = buildLvaContent();
    const versionQuestions = content.questions.map((q) => ({
      stableKey: q.stableKey,
      type: q.type,
      scale: (q as { scale?: { min: number; max: number } }).scale,
      options:
        q.stableKey === "S4_biggest_obstacles"
          ? [{ key: "some_new_factor" }, ...(q as { options: { key: string }[] }).options.slice(1)]
          : (q as { options?: { key: string }[] }).options,
      maxChoices: (q as { maxChoices?: number }).maxChoices,
    }));
    const compat = validateCrosswalkAgainstVersion(lvaCrosswalk, versionQuestions);
    expect(compat.ok).toBe(false);
    expect(compat.problems.some((p) => p.includes("not set-equal"))).toBe(true);
  });

  it("drops exactly the 6 no-home keys with reasons (currency, Q15A/B, Q33, Q35/Q36)", () => {
    expect(lvaCrosswalk.droppedKeys.map((d) => d.key).sort()).toEqual(
      ["Q15A", "Q15B", "Q33", "Q35", "Q36", "currency"],
    );
    for (const d of lvaCrosswalk.droppedKeys) expect(d.reason.length).toBeGreaterThan(10);
  });
});

// ── Exhaustiveness guard (answer keys only) ────────────────────────────────

describe("validateCrosswalkExhaustive", () => {
  it("covers every raw_* answer key in the QSP fixture", () => {
    const answerKeys = fixtureAnswerKeys();
    // Sanity: the fixture really carries the full QSP answer key set.
    expect(answerKeys).toEqual(
      expect.arrayContaining([
        "Q1", "Q2", "Q3_1", "Q3_2", "Q3_3", "Q3_4", "Q3_5", "Q3_6",
        "Q4", "Q5a", "Q5b", "Q5c", "Q6", "Q6a", "Q7", "Q7a", "Q8", "Q8a",
        "Q9", "Q10", "Q11", "Q11a", "Q12", "Q13", "Q14", "Q15", "Q16", "Remarks1",
      ]),
    );

    const result = validateCrosswalkExhaustive(qspV2Crosswalk, answerKeys);
    expect(result.unknownKeys).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it("flags an injected bogus answer key", () => {
    const answerKeys = [...fixtureAnswerKeys(), "Q99"];
    const result = validateCrosswalkExhaustive(qspV2Crosswalk, answerKeys);
    expect(result.ok).toBe(false);
    expect(result.unknownKeys).toEqual(["Q99"]);
  });
});

// ── Pinned-version type/scale compatibility (ADR-0001 / spec §7) ────────────

describe("validateCrosswalkAgainstVersion", () => {
  it("passes when every stableKey exists with a matching type (+ slider scale)", () => {
    const version = versionFromCrosswalk(qspV2Crosswalk);
    const result = validateCrosswalkAgainstVersion(qspV2Crosswalk, version);
    expect(result.problems).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it("fails when a mapped stableKey has a drifted type", () => {
    const version = versionFromCrosswalk(qspV2Crosswalk).map((q) =>
      q.stableKey === "P1_rate_pride" ? { ...q, type: "TEXT", scale: undefined } : q,
    );
    const result = validateCrosswalkAgainstVersion(qspV2Crosswalk, version);
    expect(result.ok).toBe(false);
    expect(result.problems.join(" ")).toContain("P1_rate_pride");
  });

  it("fails when a mapped stableKey is missing from the version", () => {
    const version = versionFromCrosswalk(qspV2Crosswalk).filter(
      (q) => q.stableKey !== "P1_overall_rating",
    );
    const result = validateCrosswalkAgainstVersion(qspV2Crosswalk, version);
    expect(result.ok).toBe(false);
    expect(result.problems.join(" ")).toContain("P1_overall_rating");
  });

  it("fails when a SLIDER_LIKERT version question has no scale", () => {
    const version = versionFromCrosswalk(qspV2Crosswalk).map((q) =>
      q.stableKey === "P1_rate_success_rocks" ? { stableKey: q.stableKey, type: q.type } : q,
    );
    const result = validateCrosswalkAgainstVersion(qspV2Crosswalk, version);
    expect(result.ok).toBe(false);
    expect(result.problems.join(" ")).toContain("P1_rate_success_rocks");
  });
});

// ── SU-Full crosswalk content (verified via live-Esperto controlled decode) ──

/**
 * Family → (stableKey block) as VERIFIED 2026-07-02 by a controlled ScaleUp2
 * submission (each display section filled with a distinct constant, then the
 * saved answers read back by code). `[espertoFamily, count, startStableKey]`;
 * within-block order ascending (Q<n>_1 → first stableKey …).
 */
const SU_FULL_FAMILIES: Array<[string, number, number]> = [
  ["Q8", 8, 1], // Your Employees        → Q01–Q08
  ["Q7", 5, 9], // Company Culture       → Q09–Q13
  ["Q4", 7, 14], // Strategy             → Q14–Q20
  ["Q3", 4, 21], // Leadership Team      → Q21–Q24
  ["Q5", 5, 25], // Operational Processes→ Q25–Q29
  ["Q9", 5, 30], // Sales & Marketing    → Q30–Q34
  ["Q10", 6, 35], // Scalability/Innov/Tech → Q35–Q40
  ["Q11", 5, 41], // Cash                → Q41–Q45
  ["Q12", 10, 46], // Your Leadership    → Q46–Q55
  ["Q6", 6, 56], // Internal Communication → Q56–Q61
];

function expectedSuFullMap(): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  for (const [fam, count, start] of SU_FULL_FAMILIES) {
    for (let i = 1; i <= count; i++) {
      out.push([`${fam}_${i}`, `Q${String(start + i - 1).padStart(2, "0")}`]);
    }
  }
  return out;
}

/** The 27 non-slider raw keys the export carries that we intentionally drop.
 * (Q1o2_2/Q1o2_3 moved to `map` in Phase 3a — the published version is now
 * FTE-bearing v3, whose REQUIRED Q_FTE_CONTRACT would otherwise make the
 * completeness gate skip every respondent.) */
const SU_FULL_DROPPED = [
  "Q1o1_1", "Q1o4",
  "Q2o1_1", "Q2o1_2", "Q2o1_3", "Q2o2_2", "Q2o2_3",
  "Q12open",
  "Q13o1_1", "Q13o2_1", "Q13o3", "Q13o4", "Q13o5_1",
  "Q13o6_1", "Q13o6_2", "Q13o7_1", "Q13o7_2", "Q13o8_1",
  "Q16", "Q17", "ScoreSchatting",
  "country", "geslacht", "leeftijd", "postcode", "provincie", "state",
];

/** Actual export answer keys from the sanitized restricted-individual fixture. */
function restrictedRawKeys(): string[] {
  return Object.keys((restrictedIndividual as { raw: Record<string, unknown> }).raw);
}

describe("scalingUpFullCrosswalk", () => {
  it("targets the scaling-up-full alias, no Esperto variant, LOCKED (decoded 2026-07-02)", () => {
    expect(scalingUpFullCrosswalk.templateAlias).toBe("scaling-up-full");
    expect(scalingUpFullCrosswalk.espertoVariant).toBeNull();
    expect(scalingUpFullCrosswalk.locked).toBe(true);
  });

  it("maps the 61 verified sliders (Q3_1…Q12_10 → Q01…Q61, ascending) + 2 FTE NUMBER entries = 63", () => {
    expect(scalingUpFullCrosswalk.map).toHaveLength(63);
    const byKey = new Map(scalingUpFullCrosswalk.map.map((e) => [e.espertoKey, e]));
    for (const [espertoKey, stableKey] of expectedSuFullMap()) {
      const entry = byKey.get(espertoKey);
      expect(entry).toBeDefined();
      expect(entry!.stableKey).toBe(stableKey);
      expect(entry!.ourType).toBe("SLIDER_LIKERT");
    }
  });

  it("covers stableKeys Q01…Q61 + Q_FTE_CONTRACT + Q_FREELANCE with no duplicates", () => {
    const stableKeys = scalingUpFullCrosswalk.map.map((e) => e.stableKey).sort();
    const expected = [
      ...Array.from({ length: 61 }, (_, i) => `Q${String(i + 1).padStart(2, "0")}`),
      "Q_FTE_CONTRACT",
      "Q_FREELANCE",
    ].sort();
    expect(stableKeys).toEqual(expected);
    expect(new Set(stableKeys).size).toBe(63);
  });

  it("drops exactly the 27 non-slider keys (firmographics/demographics/free-text), each with a reason", () => {
    const dropped = scalingUpFullCrosswalk.droppedKeys.map((d) => d.key).sort();
    expect(dropped).toEqual([...SU_FULL_DROPPED].sort());
    for (const d of scalingUpFullCrosswalk.droppedKeys) {
      expect(d.reason.length).toBeGreaterThan(0);
    }
  });

  it("maps the FTE keys (Phase 3a): Q1o2_2 → Q_FTE_CONTRACT, Q1o2_3 → Q_FREELANCE, both NUMBER, not dropped", () => {
    const byKey = new Map(scalingUpFullCrosswalk.map.map((e) => [e.espertoKey, e]));
    const dropped = new Set(scalingUpFullCrosswalk.droppedKeys.map((d) => d.key));
    expect(byKey.get("Q1o2_2")).toEqual({ espertoKey: "Q1o2_2", stableKey: "Q_FTE_CONTRACT", ourType: "NUMBER" });
    expect(byKey.get("Q1o2_3")).toEqual({ espertoKey: "Q1o2_3", stableKey: "Q_FREELANCE", ourType: "NUMBER" });
    expect(dropped.has("Q1o2_2")).toBe(false);
    expect(dropped.has("Q1o2_3")).toBe(false);
  });

  it("is EXHAUSTIVE over the real restricted export (every raw key mapped or dropped)", () => {
    const rawKeys = restrictedRawKeys();
    expect(rawKeys).toHaveLength(90); // 61 sliders + 29 non-slider
    const result = validateCrosswalkExhaustive(scalingUpFullCrosswalk, rawKeys);
    expect(result.unknownKeys).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it("passes pinned-version compatibility when Q01…Q61 exist as scaled sliders", () => {
    const version = versionFromCrosswalk(scalingUpFullCrosswalk);
    const result = validateCrosswalkAgainstVersion(scalingUpFullCrosswalk, version);
    expect(result.problems).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it("resolves by template alias and is reachable from the registry", () => {
    expect(getCrosswalkByTemplateAlias("scaling-up-full")).toBe(scalingUpFullCrosswalk);
  });
});
