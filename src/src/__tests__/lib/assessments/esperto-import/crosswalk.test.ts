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

  it("registers Rockefeller + LVA as locked:false stubs with empty maps", () => {
    expect(rockefellerCrosswalk.locked).toBe(false);
    expect(rockefellerCrosswalk.map).toEqual([]);
    expect(rockefellerCrosswalk.droppedKeys).toEqual([]);
    expect(rockefellerCrosswalk.templateAlias).toBe("RockHabits");

    expect(lvaCrosswalk.locked).toBe(false);
    expect(lvaCrosswalk.map).toEqual([]);
    expect(lvaCrosswalk.droppedKeys).toEqual([]);
    expect(lvaCrosswalk.templateAlias).toBe("leadership-vision-alignment");
  });

  it("resolves the Rockefeller + LVA stubs by alias", () => {
    expect(getCrosswalkByTemplateAlias("RockHabits")).toBe(rockefellerCrosswalk);
    expect(getCrosswalkByTemplateAlias("leadership-vision-alignment")).toBe(lvaCrosswalk);
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

/** The 29 non-slider raw keys the export carries that we intentionally drop. */
const SU_FULL_DROPPED = [
  "Q1o1_1", "Q1o2_2", "Q1o2_3", "Q1o4",
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

  it("maps exactly the 61 verified sliders (Q3_1…Q12_10 → Q01…Q61, ascending), all SLIDER_LIKERT", () => {
    expect(scalingUpFullCrosswalk.map).toHaveLength(61);
    const byKey = new Map(scalingUpFullCrosswalk.map.map((e) => [e.espertoKey, e]));
    for (const [espertoKey, stableKey] of expectedSuFullMap()) {
      const entry = byKey.get(espertoKey);
      expect(entry).toBeDefined();
      expect(entry!.stableKey).toBe(stableKey);
      expect(entry!.ourType).toBe("SLIDER_LIKERT");
    }
  });

  it("covers stableKeys Q01…Q61 with no duplicates", () => {
    const stableKeys = scalingUpFullCrosswalk.map.map((e) => e.stableKey).sort();
    const expected = Array.from({ length: 61 }, (_, i) => `Q${String(i + 1).padStart(2, "0")}`).sort();
    expect(stableKeys).toEqual(expected);
    expect(new Set(stableKeys).size).toBe(61);
  });

  it("drops exactly the 29 non-slider keys (firmographics/demographics/free-text), each with a reason", () => {
    const dropped = scalingUpFullCrosswalk.droppedKeys.map((d) => d.key).sort();
    expect(dropped).toEqual([...SU_FULL_DROPPED].sort());
    for (const d of scalingUpFullCrosswalk.droppedKeys) {
      expect(d.reason.length).toBeGreaterThan(0);
    }
  });

  it("keeps the FTE keys (Q1o2_2 permanent, Q1o2_3 freelance) in droppedKeys, NOT in map", () => {
    const mapped = new Set(scalingUpFullCrosswalk.map.map((e) => e.espertoKey));
    const dropped = new Set(scalingUpFullCrosswalk.droppedKeys.map((d) => d.key));
    for (const fte of ["Q1o2_2", "Q1o2_3"]) {
      expect(mapped.has(fte)).toBe(false);
      expect(dropped.has(fte)).toBe(true);
    }
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
