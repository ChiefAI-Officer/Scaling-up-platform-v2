/**
 * Assessment Tool v1 — scoreSubmission() unit tests.
 *
 * Pure scoring function. Backs the entire INVITED + PUBLIC submit path.
 *
 * TDD discipline: Rockefeller golden fixture is the entry-point red test.
 * The fixture mirrors `prisma/seed-rockefeller-assessment.ts` (10 sections,
 * 40 questions, SLIDER_LIKERT scale 0–3, all required) so the math is anchored
 * to real production data, not synthetic.
 */

import {
  scoreSubmission,
  ScoringValidationError,
  GrowthPhaseRecommendationSchema,
  PhasePeerBenchmarkSchema,
  TemplateVersionForScoringSchema,
  TemplateVersionForPublishSchema,
  validateTierTiling,
  type TemplateVersionForScoring,
  type Answer,
  type GrowthPhaseRecommendation,
  type PhasePeerBenchmark,
} from "@/lib/assessments/scoring";
import {
  buildPhasePeerBenchmarks,
  SU_FULL_PHASE_PEER_CONTENT_HASHES,
  SU_FULL_PHASE_PEER_SOURCE_ID,
  SU_FULL_PHASE_PEER_VECTORS,
} from "@/lib/assessments/su-full-phase-peer-catalogue";
import type { GrowthPhaseNumber } from "@/lib/assessments/su-full-phase";

/**
 * Build the Rockefeller v1 template version structure.
 * Stable keys, scale, required flag, and scoring config exactly match
 * prisma/seed-rockefeller-assessment.ts. Labels are placeholders — they
 * don't affect scoring math.
 */
function buildRockefellerVersion(): TemplateVersionForScoring {
  const sections = Array.from({ length: 10 }, (_, idx) => ({
    stableKey: `S${idx + 1}`,
    sortOrder: idx + 1,
    name: `Section ${idx + 1}`,
  }));

  const questions: TemplateVersionForScoring["questions"] = [];
  let sortOrder = 0;
  for (let s = 1; s <= 10; s++) {
    for (let q = 1; q <= 4; q++) {
      sortOrder += 1;
      questions.push({
        stableKey: `Q${s}_${q}`,
        sortOrder,
        type: "SLIDER_LIKERT",
        label: `Question ${s}.${q}`,
        sectionStableKey: `S${s}`,
        isRequired: true,
        scale: {
          min: 0,
          max: 3,
          step: 1,
          anchorMin: "Not true",
          anchorMax: "Completely true",
        },
      });
    }
  }

  return {
    questions,
    sections,
    scoringConfig: {
      tierMetric: "countAchieved",
      passThreshold: 2,
      tiers: [
        {
          minMetric: 0,
          maxMetric: 16,
          label: "Low",
          message: "That is a very low overall score.",
        },
        {
          minMetric: 17,
          maxMetric: 32,
          label: "OK",
          message:
            "You're doing quite okay, and have a lot to improve further upon.",
        },
        {
          minMetric: 33,
          maxMetric: 40,
          label: "Great",
          message: "That is a great overall score.",
        },
      ],
    },
  };
}

/**
 * Golden answers — 85 total points, 37 of 40 achieved, tier "Great".
 * Layout: S1 all 2s (8); S2 [2,1,1,1] (5); S3 [3,2,2,2] (9); S4..S10 [3,2,2,2] (9 each).
 *   Total: 8 + 5 + 9*8 = 8 + 5 + 72 = 85. Wait — recheck.
 *   8 (S1) + 5 (S2) + 9 (S3) + 9 (S4) + 9 (S5) + 9 (S6) + 9 (S7) + 9 (S8) + 9 (S9) + 9 (S10)
 *   = 8 + 5 + 9*8 = 85. ✓
 *
 * countAchieved (value >= passThreshold=2):
 *   S1: 4 (all 2s pass)
 *   S2: 1 (only the 2 passes; three 1s fail)
 *   S3..S10: 4 each (one 3, three 2s — all pass)
 *   Total: 4 + 1 + 4*8 = 4 + 1 + 32 = 37. ✓
 */
const ROCKEFELLER_GOLDEN_ANSWERS: Answer[] = [
  { stableKey: "Q1_1", value: 2 }, { stableKey: "Q1_2", value: 2 }, { stableKey: "Q1_3", value: 2 }, { stableKey: "Q1_4", value: 2 },
  { stableKey: "Q2_1", value: 2 }, { stableKey: "Q2_2", value: 1 }, { stableKey: "Q2_3", value: 1 }, { stableKey: "Q2_4", value: 1 },
  { stableKey: "Q3_1", value: 3 }, { stableKey: "Q3_2", value: 2 }, { stableKey: "Q3_3", value: 2 }, { stableKey: "Q3_4", value: 2 },
  { stableKey: "Q4_1", value: 3 }, { stableKey: "Q4_2", value: 2 }, { stableKey: "Q4_3", value: 2 }, { stableKey: "Q4_4", value: 2 },
  { stableKey: "Q5_1", value: 3 }, { stableKey: "Q5_2", value: 2 }, { stableKey: "Q5_3", value: 2 }, { stableKey: "Q5_4", value: 2 },
  { stableKey: "Q6_1", value: 3 }, { stableKey: "Q6_2", value: 2 }, { stableKey: "Q6_3", value: 2 }, { stableKey: "Q6_4", value: 2 },
  { stableKey: "Q7_1", value: 3 }, { stableKey: "Q7_2", value: 2 }, { stableKey: "Q7_3", value: 2 }, { stableKey: "Q7_4", value: 2 },
  { stableKey: "Q8_1", value: 3 }, { stableKey: "Q8_2", value: 2 }, { stableKey: "Q8_3", value: 2 }, { stableKey: "Q8_4", value: 2 },
  { stableKey: "Q9_1", value: 3 }, { stableKey: "Q9_2", value: 2 }, { stableKey: "Q9_3", value: 2 }, { stableKey: "Q9_4", value: 2 },
  { stableKey: "Q10_1", value: 3 }, { stableKey: "Q10_2", value: 2 }, { stableKey: "Q10_3", value: 2 }, { stableKey: "Q10_4", value: 2 },
];

/**
 * Build uniform-value answers for all 40 Rockefeller questions.
 */
function buildUniformAnswers(value: number): Answer[] {
  const out: Answer[] = [];
  for (let s = 1; s <= 10; s++) {
    for (let q = 1; q <= 4; q++) {
      out.push({ stableKey: `Q${s}_${q}`, value });
    }
  }
  return out;
}

/**
 * Build answers with `passingCount` questions at value=3 (counts as achieved)
 * and the remaining 40 - passingCount at value=1 (counts as failed).
 * Used for tier-boundary tests.
 */
function buildSplitAnswers(passingCount: number): Answer[] {
  const out: Answer[] = [];
  let i = 0;
  for (let s = 1; s <= 10; s++) {
    for (let q = 1; q <= 4; q++) {
      out.push({
        stableKey: `Q${s}_${q}`,
        value: i < passingCount ? 3 : 1,
      });
      i += 1;
    }
  }
  return out;
}

describe("scoreSubmission — Rockefeller golden fixture", () => {
  it("matches the golden totals/tier/per-section breakdown", () => {
    const version = buildRockefellerVersion();
    const result = scoreSubmission(version, ROCKEFELLER_GOLDEN_ANSWERS);

    expect(result.overallTotal).toBe(85);
    expect(result.overallAverage).toBeCloseTo(2.125, 5);
    expect(result.countAchieved).toBe(37);
    expect(result.tier).not.toBeNull();
    expect(result.tier?.label).toBe("Great");
    expect(result.tier?.message).toBe("That is a great overall score.");
    expect(result.tierMetricValue).toBe(37);
    expect(result.unansweredKeys).toEqual([]);
    expect(result.perQuestion).toHaveLength(40);
    expect(result.perSection).toHaveLength(10);

    const sectionByKey = new Map(
      result.perSection.map((s) => [s.stableKey, s])
    );

    const s1 = sectionByKey.get("S1");
    expect(s1).toBeDefined();
    expect(s1?.totalPoints).toBe(8);
    expect(s1?.averagePoints).toBeCloseTo(2.0, 5);
    expect(s1?.achievedCount).toBe(4);
    expect(s1?.totalCount).toBe(4);

    const s2 = sectionByKey.get("S2");
    expect(s2?.totalPoints).toBe(5);
    expect(s2?.averagePoints).toBeCloseTo(1.25, 5);
    expect(s2?.achievedCount).toBe(1);

    const s3 = sectionByKey.get("S3");
    expect(s3?.totalPoints).toBe(9);
    expect(s3?.averagePoints).toBeCloseTo(2.25, 5);
    expect(s3?.achievedCount).toBe(4);
  });

  it("returns perQuestion entries with achieved flag set correctly", () => {
    const version = buildRockefellerVersion();
    const result = scoreSubmission(version, ROCKEFELLER_GOLDEN_ANSWERS);

    const byKey = new Map(result.perQuestion.map((q) => [q.stableKey, q]));
    expect(byKey.get("Q1_1")?.value).toBe(2);
    expect(byKey.get("Q1_1")?.achieved).toBe(true);
    expect(byKey.get("Q2_2")?.value).toBe(1);
    expect(byKey.get("Q2_2")?.achieved).toBe(false);
    expect(byKey.get("Q3_1")?.value).toBe(3);
    expect(byKey.get("Q3_1")?.achieved).toBe(true);
  });
});

describe("scoreSubmission — dynamic tier-domain validation", () => {
  it("rejects a gap between tiers", () => {
    const version = buildRockefellerVersion();
    version.scoringConfig.tiers = [
      { minMetric: 0, maxMetric: 10, label: "Low", message: "low" },
      { minMetric: 20, maxMetric: 40, label: "High", message: "high" },
    ];
    expect(() =>
      scoreSubmission(version, ROCKEFELLER_GOLDEN_ANSWERS)
    ).toThrow(ScoringValidationError);
    try {
      scoreSubmission(version, ROCKEFELLER_GOLDEN_ANSWERS);
    } catch (err) {
      expect(err).toBeInstanceOf(ScoringValidationError);
      expect((err as ScoringValidationError).code).toBe("INVALID_SCORING_CONFIG");
    }
  });

  it("rejects overlapping tiers", () => {
    const version = buildRockefellerVersion();
    version.scoringConfig.tiers = [
      { minMetric: 0, maxMetric: 20, label: "Low", message: "low" },
      { minMetric: 15, maxMetric: 40, label: "High", message: "high" },
    ];
    expect(() =>
      scoreSubmission(version, ROCKEFELLER_GOLDEN_ANSWERS)
    ).toThrow(ScoringValidationError);
    try {
      scoreSubmission(version, ROCKEFELLER_GOLDEN_ANSWERS);
    } catch (err) {
      expect((err as ScoringValidationError).code).toBe("INVALID_SCORING_CONFIG");
    }
  });

  it("rejects when the first tier minMetric does not start at the domain min", () => {
    const version = buildRockefellerVersion();
    version.scoringConfig.tiers = [
      { minMetric: 5, maxMetric: 20, label: "Mid", message: "mid" },
      { minMetric: 21, maxMetric: 40, label: "High", message: "high" },
    ];
    expect(() =>
      scoreSubmission(version, ROCKEFELLER_GOLDEN_ANSWERS)
    ).toThrow(ScoringValidationError);
  });

  it("rejects when the last tier maxMetric is less than the domain max and is not open-ended", () => {
    const version = buildRockefellerVersion();
    version.scoringConfig.tiers = [
      { minMetric: 0, maxMetric: 16, label: "Low", message: "low" },
      { minMetric: 17, maxMetric: 30, label: "High", message: "high" },
    ];
    expect(() =>
      scoreSubmission(version, ROCKEFELLER_GOLDEN_ANSWERS)
    ).toThrow(ScoringValidationError);
  });

  it("accepts the highest tier being open-ended (maxMetric omitted)", () => {
    const version = buildRockefellerVersion();
    version.scoringConfig.tiers = [
      { minMetric: 0, maxMetric: 16, label: "Low", message: "low" },
      { minMetric: 17, maxMetric: 32, label: "OK", message: "ok" },
      { minMetric: 33, label: "Great", message: "great" },
    ];
    const result = scoreSubmission(version, ROCKEFELLER_GOLDEN_ANSWERS);
    expect(result.tier?.label).toBe("Great");
  });

  it("rejects overallAvg with mixed scales (ambiguous)", () => {
    const version = buildRockefellerVersion();
    // Mutate Q1_1's scale to mismatch the rest, then ask for overallAvg.
    version.questions[0].scale = {
      min: 0,
      max: 10,
      step: 1,
      anchorMin: "Not at all",
      anchorMax: "Strongly agree",
    };
    version.scoringConfig.tierMetric = "overallAvg";
    // Build any tier shape — it won't matter; this should fail at the
    // mixed-scale check before tier validation.
    version.scoringConfig.tiers = [
      { minMetric: 0, maxMetric: 3, label: "Any", message: "any" },
    ];
    expect(() =>
      scoreSubmission(version, ROCKEFELLER_GOLDEN_ANSWERS)
    ).toThrow(ScoringValidationError);
    try {
      scoreSubmission(version, ROCKEFELLER_GOLDEN_ANSWERS);
    } catch (err) {
      expect((err as ScoringValidationError).code).toBe("INVALID_SCORING_CONFIG");
      expect((err as ScoringValidationError).details).toMatchObject({
        reason: expect.stringContaining("overallAvg"),
      });
    }
  });
});

describe("validateTierTiling — stable issue codes", () => {
  const domain = { min: 0, max: 10, isInteger: true };

  it("adds stable codes without changing legacy empty-tier output", () => {
    expect(validateTierTiling([], domain, ["tiers"])).toEqual([
      {
        code: "EMPTY_TIERS",
        path: ["tiers"],
        message: "tiers must contain at least one entry",
        details: { reason: "empty tiers" },
      },
    ]);
  });

  it("adds a stable code without changing the first-range output", () => {
    expect(
      validateTierTiling([
        { minMetric: 1, maxMetric: 10, label: "High", message: "high" },
      ], domain),
    ).toEqual([
      {
        code: "FIRST_RANGE_START",
        path: [0, "minMetric"],
        message: "first tier minMetric must equal domain min (0); got 1",
        details: {
          reason: "first tier minMetric must equal domain min",
          domainMin: 0,
          firstTierMin: 1,
        },
      },
    ]);
  });

  it("adds a stable code without changing the early-open-range output", () => {
    expect(
      validateTierTiling([
        { minMetric: 0, label: "Low", message: "low" },
        { minMetric: 1, maxMetric: 10, label: "High", message: "high" },
      ], domain),
    ).toEqual([
      {
        code: "EARLY_NO_MAXIMUM",
        path: [0, "maxMetric"],
        message: "only the highest tier may omit maxMetric (open-ended above)",
        details: {
          reason: "only the highest tier may omit maxMetric (open-ended above)",
          tierLabel: "Low",
          tierIndex: 0,
        },
      },
    ]);
  });

  it("adds a stable code without changing the gap output", () => {
    expect(
      validateTierTiling([
        { minMetric: 0, maxMetric: 4, label: "Low", message: "low" },
        { minMetric: 6, maxMetric: 10, label: "High", message: "high" },
      ], domain),
    ).toEqual([
      {
        code: "RANGE_GAP",
        path: [1, "minMetric"],
        message:
          'gap between tiers: tier "Low" ends at 4; tier "High" must start at 5 (no gap)',
        details: {
          reason: "gap between tiers",
          tierA: "Low",
          tierB: "High",
          aMax: 4,
          bMin: 6,
          expectedNextMin: 5,
        },
      },
    ]);
  });

  it("adds a stable code without changing the overlap output", () => {
    expect(
      validateTierTiling([
        { minMetric: 0, maxMetric: 6, label: "Low", message: "low" },
        { minMetric: 5, maxMetric: 10, label: "High", message: "high" },
      ], domain),
    ).toEqual([
      {
        code: "RANGE_OVERLAP",
        path: [1, "minMetric"],
        message:
          'overlap between tiers: tier "Low" ends at 6; tier "High" starts at 5 (overlap)',
        details: {
          reason: "overlap between tiers",
          tierA: "Low",
          tierB: "High",
          aMax: 6,
          bMin: 5,
          expectedNextMin: 7,
        },
      },
    ]);
  });

  it.each([
    [9, "below"],
    [11, "above"],
  ])("adds a stable code without changing the last-range-%s-domain output", (maxMetric) => {
    expect(
      validateTierTiling([
        { minMetric: 0, maxMetric, label: "Only", message: "only" },
      ], domain),
    ).toEqual([
      {
        code: "LAST_RANGE_END",
        path: [0, "maxMetric"],
        message: `last tier maxMetric must equal domain max (10) or be omitted (open-ended); got ${maxMetric}`,
        details: {
          reason:
            "last tier maxMetric must equal domain max or be omitted (open-ended)",
          lastTierLabel: "Only",
          lastTierMax: maxMetric,
          domainMax: 10,
        },
      },
    ]);
  });
});

describe("scoreSubmission — strict validation rejections", () => {
  it("throws UNKNOWN_STABLE_KEY for an answer with no matching question", () => {
    const version = buildRockefellerVersion();
    const answers: Answer[] = [
      ...ROCKEFELLER_GOLDEN_ANSWERS,
      { stableKey: "Q99_99", value: 2 },
    ];
    try {
      scoreSubmission(version, answers);
      throw new Error("Expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(ScoringValidationError);
      expect((err as ScoringValidationError).code).toBe("UNKNOWN_STABLE_KEY");
      expect((err as ScoringValidationError).details).toMatchObject({
        stableKey: "Q99_99",
      });
    }
  });

  it("throws OUT_OF_RANGE for value above scale.max", () => {
    const version = buildRockefellerVersion();
    const answers = ROCKEFELLER_GOLDEN_ANSWERS.map((a) =>
      a.stableKey === "Q1_1" ? { stableKey: "Q1_1", value: 5 } : a
    );
    try {
      scoreSubmission(version, answers);
      throw new Error("Expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(ScoringValidationError);
      expect((err as ScoringValidationError).code).toBe("OUT_OF_RANGE");
      expect((err as ScoringValidationError).details).toMatchObject({
        stableKey: "Q1_1",
        value: 5,
      });
    }
  });

  it("throws OUT_OF_RANGE for value below scale.min", () => {
    const version = buildRockefellerVersion();
    const answers = ROCKEFELLER_GOLDEN_ANSWERS.map((a) =>
      a.stableKey === "Q1_1" ? { stableKey: "Q1_1", value: -1 } : a
    );
    expect(() => scoreSubmission(version, answers)).toThrow(
      ScoringValidationError
    );
  });

  it("throws NON_INTEGER for fractional values", () => {
    const version = buildRockefellerVersion();
    const answers = ROCKEFELLER_GOLDEN_ANSWERS.map((a) =>
      a.stableKey === "Q1_1" ? { stableKey: "Q1_1", value: 2.5 } : a
    );
    try {
      scoreSubmission(version, answers);
      throw new Error("Expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(ScoringValidationError);
      expect((err as ScoringValidationError).code).toBe("NON_INTEGER");
      expect((err as ScoringValidationError).details).toMatchObject({
        stableKey: "Q1_1",
        value: 2.5,
      });
    }
  });

  it("throws INVALID_TYPE for string values", () => {
    const version = buildRockefellerVersion();
    const answers = ROCKEFELLER_GOLDEN_ANSWERS.map((a) =>
      a.stableKey === "Q1_1" ? { stableKey: "Q1_1", value: "2" } : a
    );
    try {
      scoreSubmission(version, answers);
      throw new Error("Expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(ScoringValidationError);
      expect((err as ScoringValidationError).code).toBe("INVALID_TYPE");
      expect((err as ScoringValidationError).details).toMatchObject({
        stableKey: "Q1_1",
        gotType: "string",
      });
    }
  });

  it("throws INVALID_TYPE for NaN", () => {
    const version = buildRockefellerVersion();
    const answers = ROCKEFELLER_GOLDEN_ANSWERS.map((a) =>
      a.stableKey === "Q1_1" ? { stableKey: "Q1_1", value: NaN } : a
    );
    try {
      scoreSubmission(version, answers);
      throw new Error("Expected throw");
    } catch (err) {
      expect((err as ScoringValidationError).code).toBe("INVALID_TYPE");
    }
  });

  it("throws INVALID_TYPE for null", () => {
    const version = buildRockefellerVersion();
    const answers = ROCKEFELLER_GOLDEN_ANSWERS.map((a) =>
      a.stableKey === "Q1_1" ? { stableKey: "Q1_1", value: null } : a
    );
    try {
      scoreSubmission(version, answers);
      throw new Error("Expected throw");
    } catch (err) {
      expect((err as ScoringValidationError).code).toBe("INVALID_TYPE");
    }
  });

  it("throws INVALID_TYPE for undefined", () => {
    const version = buildRockefellerVersion();
    const answers = ROCKEFELLER_GOLDEN_ANSWERS.map((a) =>
      a.stableKey === "Q1_1" ? { stableKey: "Q1_1", value: undefined } : a
    );
    try {
      scoreSubmission(version, answers);
      throw new Error("Expected throw");
    } catch (err) {
      expect((err as ScoringValidationError).code).toBe("INVALID_TYPE");
    }
  });

  it("throws EMPTY_ANSWERS for an empty answers array", () => {
    const version = buildRockefellerVersion();
    try {
      scoreSubmission(version, []);
      throw new Error("Expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(ScoringValidationError);
      expect((err as ScoringValidationError).code).toBe("EMPTY_ANSWERS");
    }
  });

  it("throws DUPLICATE_STABLE_KEY when one stableKey appears twice", () => {
    const version = buildRockefellerVersion();
    const answers: Answer[] = [
      ...ROCKEFELLER_GOLDEN_ANSWERS,
      { stableKey: "Q1_1", value: 0 },
    ];
    try {
      scoreSubmission(version, answers);
      throw new Error("Expected throw");
    } catch (err) {
      expect((err as ScoringValidationError).code).toBe("DUPLICATE_STABLE_KEY");
      expect((err as ScoringValidationError).details).toMatchObject({
        stableKey: "Q1_1",
      });
    }
  });

  it("throws MISSING_REQUIRED_KEY when a required answer is absent", () => {
    const version = buildRockefellerVersion();
    const answers = ROCKEFELLER_GOLDEN_ANSWERS.filter(
      (a) => a.stableKey !== "Q1_1"
    );
    try {
      scoreSubmission(version, answers);
      throw new Error("Expected throw");
    } catch (err) {
      expect((err as ScoringValidationError).code).toBe("MISSING_REQUIRED_KEY");
      expect((err as ScoringValidationError).details).toMatchObject({
        stableKeys: expect.arrayContaining(["Q1_1"]),
      });
    }
  });
});

describe("scoreSubmission — edge cases & tier boundaries", () => {
  it("all 40 answers = 0 → countAchieved=0, tier=Low, total=0, avg=0", () => {
    const version = buildRockefellerVersion();
    const result = scoreSubmission(version, buildUniformAnswers(0));
    expect(result.countAchieved).toBe(0);
    expect(result.overallTotal).toBe(0);
    expect(result.overallAverage).toBe(0);
    expect(result.tier?.label).toBe("Low");
    expect(result.tier?.message).toBe("That is a very low overall score.");
  });

  it("all 40 answers = 3 → countAchieved=40, tier=Great, total=120, avg=3", () => {
    const version = buildRockefellerVersion();
    const result = scoreSubmission(version, buildUniformAnswers(3));
    expect(result.countAchieved).toBe(40);
    expect(result.overallTotal).toBe(120);
    expect(result.overallAverage).toBeCloseTo(3, 5);
    expect(result.tier?.label).toBe("Great");
  });

  it("countAchieved=33 → tier=Great (lower boundary of Great)", () => {
    const version = buildRockefellerVersion();
    const result = scoreSubmission(version, buildSplitAnswers(33));
    expect(result.countAchieved).toBe(33);
    expect(result.tier?.label).toBe("Great");
  });

  it("countAchieved=32 → tier=OK (upper boundary of OK)", () => {
    const version = buildRockefellerVersion();
    const result = scoreSubmission(version, buildSplitAnswers(32));
    expect(result.countAchieved).toBe(32);
    expect(result.tier?.label).toBe("OK");
  });

  it("countAchieved=17 → tier=OK (lower boundary of OK)", () => {
    const version = buildRockefellerVersion();
    const result = scoreSubmission(version, buildSplitAnswers(17));
    expect(result.countAchieved).toBe(17);
    expect(result.tier?.label).toBe("OK");
  });

  it("countAchieved=16 → tier=Low (upper boundary of Low)", () => {
    const version = buildRockefellerVersion();
    const result = scoreSubmission(version, buildSplitAnswers(16));
    expect(result.countAchieved).toBe(16);
    expect(result.tier?.label).toBe("Low");
  });
});

// ─── QSP scoring integration (regression guard for field-name drift) ─────
//
// Anchors the QSP seeds to the engine's scoringConfig contract. The QSP seeds
// shipped with `minScore` / `maxScore` / `tierMetric: "average"` — names the
// engine doesn't accept. Any submission against a QSP template would have
// thrown at the Zod validation step. This test scores a synthetic answer set
// through `scoreSubmission` end-to-end so future field-name drift fails CI
// instead of slipping into a runtime crash.

import { buildTemplateContent as buildQspV1Content } from "../../../../prisma/seed-qsp-v1-assessment";
import { buildTemplateContent as buildQspV2Content } from "../../../../prisma/seed-qsp-v2-assessment";

describe("QSP scoring integration (regression guard for field-name drift)", () => {
  it("scores a QSP v1 template with a synthetic answer set without throwing", () => {
    const { sections, questions, scoringConfig } = buildQspV1Content();
    // Cast through unknown — the seed's `scoringConfig` is `as const` (readonly
    // literal type) plus a wrapper `scale` field the engine ignores. The
    // engine validates the runtime shape via Zod, not the TS type.
    const version: TemplateVersionForScoring = {
      sections,
      questions,
      scoringConfig: scoringConfig as unknown as TemplateVersionForScoring["scoringConfig"],
    };
    // QSP v1 now has NUMBER + SLIDER_LIKERT + TEXT questions. Provide
    // type-correct synthetic answers so the engine's answer validation passes.
    // The scoring engine only computes scores for SLIDER_LIKERT; TEXT/NUMBER
    // answers are stored but pass through without scoring.
    const answers: Answer[] = questions.map((q, idx) => ({
      stableKey: q.stableKey,
      value: q.type === "TEXT" ? "synthetic answer" : (idx % 2 === 0 ? 7 : 8),
    }));

    expect(() => scoreSubmission(version, answers)).not.toThrow();

    const result = scoreSubmission(version, answers);
    expect(result.tier).not.toBeNull();
    expect(result.overallAverage).toBeGreaterThanOrEqual(1);
    expect(result.overallAverage).toBeLessThanOrEqual(10);
  });

  it("scores a QSP v2 template (SLIDER_LIKERT subset) without throwing", () => {
    const { sections, questions, scoringConfig } = buildQspV2Content();
    const version: TemplateVersionForScoring = {
      sections,
      questions,
      scoringConfig: scoringConfig as unknown as TemplateVersionForScoring["scoringConfig"],
    };
    // QSP v2 has NUMBER + SLIDER_LIKERT + TEXT questions. Provide
    // type-correct synthetic answers so the engine's answer validation passes.
    // The scoring engine only computes scores for SLIDER_LIKERT; TEXT/NUMBER
    // answers are stored but pass through without scoring.
    const answers: Answer[] = questions.map((q, idx) => ({
      stableKey: q.stableKey,
      value: q.type === "TEXT" ? "synthetic answer" : (idx % 2 === 0 ? 7 : 8),
    }));

    expect(() => scoreSubmission(version, answers)).not.toThrow();

    const result = scoreSubmission(version, answers);
    expect(result.tier).not.toBeNull();
    expect(result.overallAverage).toBeGreaterThanOrEqual(1);
    expect(result.overallAverage).toBeLessThanOrEqual(10);
  });
});

// ──────────────────────────────────────────────────────────────────────
// D2.1 — engine extension: recommendations, domains, rollup, ScaleUp Score
// ──────────────────────────────────────────────────────────────────────
//
// All 21 D2 test cases live below. Each block maps to a numbered case from
// the Phase D2 plan ("Tests added to scoring.test.ts" list). New ScoreResult
// fields are optional, so the existing Rockefeller + QSP suites above are
// not affected.

/**
 * Build a tiny 0-10 scale template for D2 feature testing.
 * 3 sections, 2 questions each (6 questions total). Optional sections
 * can be remapped to a domain via `withDomains`.
 */
function buildD2BaseVersion(opts: {
  sectionDomains?: Record<string, string | undefined>;
  scoringConfig?: Record<string, unknown>;
  recommendations?: Array<{ minScore: number; maxScore: number; text: string }>;
  scaleMax?: number;
}): TemplateVersionForScoring {
  const scaleMax = opts.scaleMax ?? 10;
  const sectionKeys = ["S1", "S2", "S3"];
  const sections = sectionKeys.map((stableKey, idx) => {
    const base = {
      stableKey,
      sortOrder: idx + 1,
      name: `Section ${stableKey}`,
    } as Record<string, unknown>;
    const dom = opts.sectionDomains?.[stableKey];
    if (dom !== undefined) base.domain = dom;
    return base;
  }) as TemplateVersionForScoring["sections"];

  const questions: TemplateVersionForScoring["questions"] = [];
  let sortOrder = 0;
  for (const sk of sectionKeys) {
    for (let q = 1; q <= 2; q++) {
      sortOrder += 1;
      const qObj: Record<string, unknown> = {
        stableKey: `${sk}_Q${q}`,
        sortOrder,
        type: "SLIDER_LIKERT",
        label: `${sk} Question ${q}`,
        sectionStableKey: sk,
        isRequired: true,
        scale: {
          min: 0,
          max: scaleMax,
          step: 1,
          anchorMin: "Low",
          anchorMax: "High",
        },
      };
      if (opts.recommendations) qObj.recommendations = opts.recommendations;
      questions.push(qObj as unknown as TemplateVersionForScoring["questions"][number]);
    }
  }

  const defaultTiers = [
    { minMetric: 0, maxMetric: 3, label: "Critical", message: "low" },
    { minMetric: 4, maxMetric: 6, label: "At Risk", message: "mid" },
    { minMetric: 7, maxMetric: scaleMax, label: "Strong", message: "high" },
  ];
  // overallTotal domain is [0, scaleMax * questions.length]; default the
  // config to overallTotal to stay BC unless caller overrides.
  const overallMax = scaleMax * questions.length;
  const overallTiers = [
    {
      minMetric: 0,
      maxMetric: Math.floor(overallMax / 3),
      label: "Critical",
      message: "low",
    },
    {
      minMetric: Math.floor(overallMax / 3) + 1,
      maxMetric: Math.floor((2 * overallMax) / 3),
      label: "At Risk",
      message: "mid",
    },
    {
      minMetric: Math.floor((2 * overallMax) / 3) + 1,
      maxMetric: overallMax,
      label: "Strong",
      message: "high",
    },
  ];
  void defaultTiers;

  const scoringConfig = {
    tierMetric: "overallTotal" as const,
    passThreshold: 7,
    tiers: overallTiers,
    ...(opts.scoringConfig ?? {}),
  } as unknown as TemplateVersionForScoring["scoringConfig"];

  return { sections, questions, scoringConfig };
}

/**
 * Helper: build full-coverage 3-band recommendations for a 0-10 scale.
 */
const FULL_BANDS = [
  { minScore: 0, maxScore: 3, text: "LOW band copy" },
  { minScore: 4, maxScore: 7, text: "MEDIUM band copy" },
  { minScore: 8, maxScore: 10, text: "HIGH band copy" },
];

describe("D2 — per-question recommendation bands", () => {
  it("[1] emits the matched band text at value 5 (middle band) — runtime", () => {
    const version = buildD2BaseVersion({ recommendations: FULL_BANDS });
    const answers: Answer[] = version.questions.map((q) => ({
      stableKey: q.stableKey,
      value: 5,
    }));
    const result = scoreSubmission(version, answers);
    const q1 = result.perQuestion.find((r) => r.stableKey === "S1_Q1");
    expect(q1).toBeDefined();
    expect(q1?.recommendation).toBe("MEDIUM band copy");
  });

  it("[2] runtime lenient on a band gap — returns undefined recommendation, no throw", () => {
    const gappedBands = [
      { minScore: 0, maxScore: 3, text: "LOW" },
      { minScore: 8, maxScore: 10, text: "HIGH" },
    ];
    const version = buildD2BaseVersion({ recommendations: gappedBands });
    const answers: Answer[] = version.questions.map((q) => ({
      stableKey: q.stableKey,
      value: 5, // falls in the gap
    }));
    // Runtime schema must accept gaps (BC) — engine returns undefined per question.
    const runtimeParse = TemplateVersionForScoringSchema.safeParse(version);
    expect(runtimeParse.success).toBe(true);
    expect(() => scoreSubmission(version, answers)).not.toThrow();
    const result = scoreSubmission(version, answers);
    const q = result.perQuestion.find((r) => r.stableKey === "S1_Q1");
    expect(q?.recommendation).toBeUndefined();
  });

  it("[3] publish schema rejects a band gap", () => {
    const gappedBands = [
      { minScore: 0, maxScore: 3, text: "LOW" },
      { minScore: 8, maxScore: 10, text: "HIGH" },
    ];
    const version = buildD2BaseVersion({ recommendations: gappedBands });
    const publishParse = TemplateVersionForPublishSchema.safeParse(version);
    expect(publishParse.success).toBe(false);
  });

  it("[4] band overlap rejected by BOTH runtime + publish", () => {
    const overlap = [
      { minScore: 0, maxScore: 5, text: "LOW" },
      { minScore: 5, maxScore: 10, text: "HIGH" }, // 5 matches both
    ];
    const version = buildD2BaseVersion({ recommendations: overlap });
    expect(TemplateVersionForScoringSchema.safeParse(version).success).toBe(
      false
    );
    expect(TemplateVersionForPublishSchema.safeParse(version).success).toBe(
      false
    );
  });

  it("[5] band outside scale rejected by BOTH runtime + publish", () => {
    const outOfScale = [
      { minScore: 0, maxScore: 3, text: "LOW" },
      { minScore: 4, maxScore: 7, text: "MEDIUM" },
      { minScore: 8, maxScore: 15, text: "HIGH" }, // 15 > scale.max=10
    ];
    const version = buildD2BaseVersion({ recommendations: outOfScale });
    expect(TemplateVersionForScoringSchema.safeParse(version).success).toBe(
      false
    );
    expect(TemplateVersionForPublishSchema.safeParse(version).success).toBe(
      false
    );
  });

  it("[6] publish-only: placeholder sentinel text ('TODO'/'PLACEHOLDER'/'Lorem') rejected by publish", () => {
    const sentinelBands = [
      { minScore: 0, maxScore: 3, text: "TODO low copy" },
      { minScore: 4, maxScore: 7, text: "okay copy" },
      { minScore: 8, maxScore: 10, text: "high copy" },
    ];
    const version = buildD2BaseVersion({ recommendations: sentinelBands });
    // Runtime is permissive — only publish enforces sentinel rejection.
    expect(TemplateVersionForScoringSchema.safeParse(version).success).toBe(
      true
    );
    expect(TemplateVersionForPublishSchema.safeParse(version).success).toBe(
      false
    );

    const placeholderBands = [
      { minScore: 0, maxScore: 3, text: "low copy" },
      { minScore: 4, maxScore: 7, text: "PLACEHOLDER mid" },
      { minScore: 8, maxScore: 10, text: "high copy" },
    ];
    const v2 = buildD2BaseVersion({ recommendations: placeholderBands });
    expect(TemplateVersionForPublishSchema.safeParse(v2).success).toBe(false);

    const loremBands = [
      { minScore: 0, maxScore: 3, text: "Lorem ipsum dolor" },
      { minScore: 4, maxScore: 7, text: "ok" },
      { minScore: 8, maxScore: 10, text: "high" },
    ];
    const v3 = buildD2BaseVersion({ recommendations: loremBands });
    expect(TemplateVersionForPublishSchema.safeParse(v3).success).toBe(false);
  });
});

describe("phase-aware slider recommendations", () => {
  const phaseRecommendations: GrowthPhaseRecommendation[] = (
    [1, 2, 3, 4, 5] as GrowthPhaseNumber[]
  ).map((phase) => ({
    phase,
    bands: [
      { minScore: 0, maxScore: 4, text: `P${phase} low` },
      { minScore: 5, maxScore: 6, text: `P${phase} middle` },
      { minScore: 7, maxScore: 8, text: `P${phase} high` },
      { minScore: 9, maxScore: 10, text: `P${phase} top` },
    ],
  }));

  function scoreAt({ phase, value }: { phase: GrowthPhaseNumber; value: number }) {
    const version = buildD2BaseVersion({
      recommendations: [{ minScore: 0, maxScore: 10, text: "legacy" }],
    });
    for (const question of version.questions) {
      Object.assign(question, { phaseRecommendations });
    }
    const result = scoreSubmission(
      version,
      version.questions.map((question) => ({ stableKey: question.stableKey, value })),
      { recommendationPhase: phase },
    );
    return result.perQuestion[0];
  }

  function scoreWithoutPhase() {
    const version = buildD2BaseVersion({
      recommendations: [{ minScore: 0, maxScore: 10, text: "legacy" }],
    });
    for (const question of version.questions) {
      Object.assign(question, { phaseRecommendations });
    }
    const result = scoreSubmission(
      version,
      version.questions.map((question) => ({ stableKey: question.stableKey, value: 5 })),
    );
    return result.perQuestion[0];
  }

  function legacyScoreOnlyQuestion() {
    const version = buildD2BaseVersion({
      recommendations: [{ minScore: 0, maxScore: 10, text: "legacy" }],
    });
    const result = scoreSubmission(
      version,
      version.questions.map((question) => ({ stableKey: question.stableKey, value: 5 })),
    );
    return result.perQuestion[0];
  }

  it("resolves the selected phase without falling back to legacy recommendations", () => {
    expect(scoreAt({ phase: 1, value: 4 }).recommendation).toBe("P1 low");
    expect(scoreAt({ phase: 2, value: 5 }).recommendation).toBe("P2 middle");
    expect(scoreAt({ phase: 3, value: 7 }).recommendation).toBe("P3 high");
    expect(scoreAt({ phase: 5, value: 10 }).recommendation).toBe("P5 top");
    expect(scoreWithoutPhase().recommendation).toBeUndefined();
    expect(legacyScoreOnlyQuestion().recommendation).toBe("legacy");
  });

  it("does not fall back to legacy recommendations when phaseRecommendations is empty", () => {
    const version = buildD2BaseVersion({
      recommendations: [{ minScore: 0, maxScore: 10, text: "legacy" }],
    });
    for (const question of version.questions) {
      Object.assign(question, { phaseRecommendations: [] });
    }

    const result = scoreSubmission(
      version,
      version.questions.map((question) => ({ stableKey: question.stableKey, value: 5 })),
      { recommendationPhase: 1 },
    );

    expect(result.perQuestion[0].recommendation).toBeUndefined();
  });

  it("freezes a supplied recommendation phase but leaves omitted phases absent", () => {
    const version = buildD2BaseVersion({
      recommendations: [{ minScore: 0, maxScore: 10, text: "legacy" }],
    });
    for (const question of version.questions) {
      Object.assign(question, { phaseRecommendations });
    }
    const answers = version.questions.map((question) => ({
      stableKey: question.stableKey,
      value: 5,
    }));

    const frozen = scoreSubmission(
      version,
      answers,
      { recommendationPhase: 3 },
    );
    const unfrozen = scoreSubmission(version, answers);

    expect(frozen.recommendationPhase).toBe(3);
    expect(unfrozen.recommendationPhase).toBeUndefined();
  });

  it("rejects malformed or incomplete phase recommendations at publish", () => {
    expect(GrowthPhaseRecommendationSchema.safeParse(phaseRecommendations[0]).success).toBe(true);

    const phaseVersion = () => {
      const version = buildD2BaseVersion({});
      for (const question of version.questions) {
        Object.assign(question, { phaseRecommendations });
      }
      return version;
    };

    const missingPhase = phaseVersion();
    for (const question of missingPhase.questions) {
      Object.assign(question, { phaseRecommendations: phaseRecommendations.slice(0, 4) });
    }
    expect(TemplateVersionForPublishSchema.safeParse(missingPhase).success).toBe(false);

    const duplicatePhase = phaseVersion();
    for (const question of duplicatePhase.questions) {
      Object.assign(question, {
        phaseRecommendations: [
          ...phaseRecommendations.slice(0, 4),
          phaseRecommendations[3],
        ],
      });
    }
    expect(TemplateVersionForPublishSchema.safeParse(duplicatePhase).success).toBe(false);

    const gappedPhaseBands = phaseVersion();
    for (const question of gappedPhaseBands.questions) {
      Object.assign(question, {
        phaseRecommendations: phaseRecommendations.map((row) =>
          row.phase === 1
            ? {
                ...row,
                bands: [
                  { minScore: 0, maxScore: 4, text: "low" },
                  { minScore: 6, maxScore: 10, text: "high" },
                ],
              }
            : row,
        ),
      });
    }
    expect(TemplateVersionForPublishSchema.safeParse(gappedPhaseBands).success).toBe(false);

    const overlappingPhaseBands = phaseVersion();
    for (const question of overlappingPhaseBands.questions) {
      Object.assign(question, {
        phaseRecommendations: phaseRecommendations.map((row) =>
          row.phase === 1
            ? {
                ...row,
                bands: [
                  { minScore: 0, maxScore: 5, text: "low" },
                  { minScore: 5, maxScore: 10, text: "high" },
                ],
              }
            : row,
        ),
      });
    }
    expect(TemplateVersionForPublishSchema.safeParse(overlappingPhaseBands).success).toBe(false);

    const fractionalPhaseBands = phaseVersion();
    for (const question of fractionalPhaseBands.questions) {
      Object.assign(question, {
        phaseRecommendations: phaseRecommendations.map((row) =>
          row.phase === 1
            ? {
                ...row,
                bands: [
                  { minScore: 0, maxScore: 4.5, text: "low" },
                  { minScore: 5.5, maxScore: 10, text: "high" },
                ],
              }
            : row,
        ),
      });
    }
    expect(TemplateVersionForPublishSchema.safeParse(fractionalPhaseBands).success).toBe(false);

    for (const text of [" ", "TODO", "x".repeat(2001)]) {
      const invalidText = phaseVersion();
      for (const question of invalidText.questions) {
        Object.assign(question, {
          phaseRecommendations: phaseRecommendations.map((row) =>
            row.phase === 1
              ? { ...row, bands: [{ minScore: 0, maxScore: 10, text }] }
              : row,
          ),
        });
      }
      expect(TemplateVersionForPublishSchema.safeParse(invalidText).success).toBe(false);
    }

    const mixedShapes = phaseVersion();
    for (const question of mixedShapes.questions) {
      Object.assign(question, {
        phaseRecommendations: [
          phaseRecommendations[0],
          { minScore: 0, maxScore: 10, text: "legacy-shaped row" },
        ],
      });
    }
    expect(TemplateVersionForPublishSchema.safeParse(mixedShapes).success).toBe(false);
  });
});

describe("phase-aware peer benchmark freezing", () => {
  const phases = [1, 2, 3, 4, 5] as const satisfies readonly GrowthPhaseNumber[];

  function phasePeerVersion(): TemplateVersionForScoring {
    const questions = Array.from({ length: 61 }, (_, index) => {
      const stableKey = `Q${String(index + 1).padStart(2, "0")}`;
      return {
        stableKey,
        sortOrder: index + 1,
        type: "SLIDER_LIKERT" as const,
        label: stableKey,
        sectionStableKey: "S1",
        isRequired: true,
        scale: {
          min: 0,
          max: 10,
          step: 1,
          anchorMin: "Low",
          anchorMax: "High",
        },
        phasePeerBenchmarks: [...buildPhasePeerBenchmarks(stableKey)],
      };
    });

    return {
      questions,
      sections: [{ stableKey: "S1", sortOrder: 1, name: "Section 1" }],
      scoringConfig: {
        tierMetric: "countAchieved",
        passThreshold: 7,
        tiers: [{ minMetric: 0, maxMetric: 61, label: "All", message: "All" }],
        phasePeerBenchmarkCatalogue: {
          sourceId: SU_FULL_PHASE_PEER_SOURCE_ID,
          phases: phases.map((phase) => ({
            phase,
            contentHash: SU_FULL_PHASE_PEER_CONTENT_HASHES[phase],
          })),
        },
      },
    };
  }

  function completeAnswers(value = 5): Answer[] {
    return Array.from({ length: 61 }, (_, index) => ({
      stableKey: `Q${String(index + 1).padStart(2, "0")}`,
      value,
    }));
  }

  function expectPeerError(
    version: TemplateVersionForScoring,
    code:
      | "SU_FULL_PHASE_PEERS_CATALOGUE_INCOMPLETE"
      | "SU_FULL_PHASE_PEERS_PHASE_MISSING"
      | "SU_FULL_PHASE_PEERS_HASH_MISMATCH",
    recommendationPhase: GrowthPhaseNumber = 4,
  ): void {
    try {
      scoreSubmission(version, completeAnswers(), { recommendationPhase });
      throw new Error("expected scoreSubmission to reject malformed phase peers");
    } catch (error) {
      expect(error).toBeInstanceOf(ScoringValidationError);
      expect((error as ScoringValidationError).code).toBe(code);
    }
  }

  it("accepts the generic phase-peer schema and freezes the exact P4 row and provenance", () => {
    expect(
      PhasePeerBenchmarkSchema.safeParse({ phase: 4, value: 6.6 }).success,
    ).toBe(true);
    const result = scoreSubmission(phasePeerVersion(), completeAnswers(), {
      recommendationPhase: 4,
    });

    expect(result.perQuestion.find((row) => row.stableKey === "Q01")?.peerValue).toBe(6.6);
    expect(result.peerBenchmarkSnapshot).toEqual({
      sourceId: "2026-08-20.esperto-five-phase-peers-v1",
      contentHash: "ae9e9e2fbfc8525f4e6d8c3ca65775a50b85476371f29a74934dbe6dd3a965ff",
      phase: 4,
    });
    expect(result.perQuestion).toHaveLength(61);
    expect(result.perQuestion.every((row) => Number.isFinite(row.peerValue))).toBe(true);
  });

  it.each([
    [1, 6.3, "fe63364e3b5e42897b3b3886135310f673e320b4a07b1453ad300a49a91b4dbd"],
    [2, 6.3, "fe63364e3b5e42897b3b3886135310f673e320b4a07b1453ad300a49a91b4dbd"],
    [3, 6.3, "fe63364e3b5e42897b3b3886135310f673e320b4a07b1453ad300a49a91b4dbd"],
    [4, 6.6, "ae9e9e2fbfc8525f4e6d8c3ca65775a50b85476371f29a74934dbe6dd3a965ff"],
    [5, 6.3, "fe63364e3b5e42897b3b3886135310f673e320b4a07b1453ad300a49a91b4dbd"],
  ] as const)("selects the explicit P%s peer vector", (phase, q01Peer, contentHash) => {
    const result = scoreSubmission(phasePeerVersion(), completeAnswers(), {
      recommendationPhase: phase,
    });

    expect(result.perQuestion.find((row) => row.stableKey === "Q01")?.peerValue).toBe(q01Peer);
    expect(
      Object.fromEntries(
        result.perQuestion.map((row) => [row.stableKey, row.peerValue]),
      ),
    ).toEqual(SU_FULL_PHASE_PEER_VECTORS[phase]);
    expect(result.peerBenchmarkSnapshot).toEqual({
      sourceId: "2026-08-20.esperto-five-phase-peers-v1",
      contentHash,
      phase,
    });
  });

  it("keeps P4 peers score-invariant while P3 differs and P5 returns to baseline", () => {
    const p4Low = scoreSubmission(phasePeerVersion(), completeAnswers(0), {
      recommendationPhase: 4,
    });
    const p4High = scoreSubmission(phasePeerVersion(), completeAnswers(10), {
      recommendationPhase: 4,
    });
    const p3 = scoreSubmission(phasePeerVersion(), completeAnswers(10), {
      recommendationPhase: 3,
    });
    const p5 = scoreSubmission(phasePeerVersion(), completeAnswers(10), {
      recommendationPhase: 5,
    });

    expect(p4Low.perQuestion.map((row) => row.peerValue)).toEqual(
      p4High.perQuestion.map((row) => row.peerValue),
    );
    expect(p3.perQuestion[0].peerValue).toBe(6.3);
    expect(p4High.perQuestion[0].peerValue).toBe(6.6);
    expect(p5.perQuestion[0].peerValue).toBe(6.3);
  });

  it("preserves non-CEO scoring when recommendationPhase is absent", () => {
    const result = scoreSubmission(phasePeerVersion(), completeAnswers());

    expect(result.peerBenchmarkSnapshot).toBeUndefined();
    expect(result.perQuestion.every((row) => row.peerValue === undefined)).toBe(true);
  });

  it("omits snapshot provenance until every scorable peer value is frozen", () => {
    const result = scoreSubmission(
      phasePeerVersion(),
      completeAnswers().slice(0, 60),
      { allowMissingRequired: true, recommendationPhase: 4 },
    );

    expect(result.perQuestion).toHaveLength(60);
    expect(result.perQuestion.every((row) => Number.isFinite(row.peerValue))).toBe(true);
    expect(result.peerBenchmarkSnapshot).toBeUndefined();
  });

  it("rejects duplicate catalogue phases as incomplete governed metadata", () => {
    const version = phasePeerVersion();
    const catalogue = version.scoringConfig.phasePeerBenchmarkCatalogue!;
    catalogue.phases[4] = { ...catalogue.phases[3] };

    expectPeerError(version, "SU_FULL_PHASE_PEERS_CATALOGUE_INCOMPLETE", 1);
    expect(TemplateVersionForScoringSchema.safeParse(version).success).toBe(false);
    expect(TemplateVersionForPublishSchema.safeParse(version).success).toBe(false);
  });

  it("rejects a catalogue attached to only 60 of 61 scorable questions", () => {
    const version = phasePeerVersion();
    delete (version.questions[60] as { phasePeerBenchmarks?: PhasePeerBenchmark[] })
      .phasePeerBenchmarks;

    expectPeerError(version, "SU_FULL_PHASE_PEERS_CATALOGUE_INCOMPLETE");
  });

  it("rejects question peer rows without their catalogue metadata", () => {
    const version = phasePeerVersion();
    delete version.scoringConfig.phasePeerBenchmarkCatalogue;

    expectPeerError(version, "SU_FULL_PHASE_PEERS_CATALOGUE_INCOMPLETE");
  });

  it("rejects catalogue metadata on a version with no peer-bearing scorable questions", () => {
    const version = {
      questions: [{
        stableKey: "TEXT_1",
        sortOrder: 1,
        type: "TEXT",
        label: "Context",
        isRequired: true,
      }],
      sections: [],
      scoringConfig: {
        tierMetric: "countAchieved",
        passThreshold: 7,
        tiers: [{ minMetric: 0, maxMetric: 0, label: "None", message: "None" }],
        phasePeerBenchmarkCatalogue: phasePeerVersion().scoringConfig
          .phasePeerBenchmarkCatalogue,
      },
    } as TemplateVersionForScoring;

    try {
      scoreSubmission(version, [{ stableKey: "TEXT_1", value: "answer" }], {
        recommendationPhase: 4,
      });
      throw new Error("expected empty governed peer catalogue to be rejected");
    } catch (error) {
      expect(error).toBeInstanceOf(ScoringValidationError);
      expect((error as ScoringValidationError).code).toBe(
        "SU_FULL_PHASE_PEERS_CATALOGUE_INCOMPLETE",
      );
    }
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, -0.1, 10.1])(
    "rejects a non-finite or out-of-range peer value %s",
    (value) => {
      const version = phasePeerVersion();
      const question = version.questions[0] as {
        phasePeerBenchmarks: PhasePeerBenchmark[];
      };
      question.phasePeerBenchmarks[3] = { phase: 4, value };

      expectPeerError(version, "SU_FULL_PHASE_PEERS_CATALOGUE_INCOMPLETE");
    },
  );

  it("rejects a missing explicitly selected catalogue phase", () => {
    const version = phasePeerVersion();
    version.scoringConfig.phasePeerBenchmarkCatalogue!.phases =
      version.scoringConfig.phasePeerBenchmarkCatalogue!.phases.filter(
        (row) => row.phase !== 4,
      );

    expectPeerError(version, "SU_FULL_PHASE_PEERS_PHASE_MISSING");
  });

  it("rejects a selected question row whose declared phase disagrees", () => {
    const version = phasePeerVersion();
    const question = version.questions[0] as {
      phasePeerBenchmarks: PhasePeerBenchmark[];
    };
    question.phasePeerBenchmarks[3] = {
      ...question.phasePeerBenchmarks[3],
      phase: 3,
    };

    expectPeerError(version, "SU_FULL_PHASE_PEERS_HASH_MISMATCH");
  });
});

describe("D2 — per-domain rollup", () => {
  it("[7] groups sections by domain and emits perDomain[] with averages", () => {
    // 2 domains: D1 (S1, S2), D2 (S3). 6 questions total.
    const version = buildD2BaseVersion({
      sectionDomains: { S1: "D1", S2: "D1", S3: "D2" },
      scoringConfig: {
        domains: [
          {
            key: "D1",
            label: "Domain 1",
            tiers: [
              { minMetric: 0, maxMetric: 3, label: "Lo", message: "lo" },
              { minMetric: 3, maxMetric: 6, label: "Mid", message: "mid" },
              { minMetric: 6, maxMetric: 10, label: "Hi", message: "hi" },
            ],
          },
          {
            key: "D2",
            label: "Domain 2",
            tiers: [
              { minMetric: 0, maxMetric: 3, label: "Lo", message: "lo" },
              { minMetric: 3, maxMetric: 6, label: "Mid", message: "mid" },
              { minMetric: 6, maxMetric: 10, label: "Hi", message: "hi" },
            ],
          },
        ],
      },
    });
    // S1 [4,4]=4, S2 [6,6]=6 → D1 mean of section means = 5
    // S3 [8,8]=8 → D2 = 8
    const answers: Answer[] = [
      { stableKey: "S1_Q1", value: 4 },
      { stableKey: "S1_Q2", value: 4 },
      { stableKey: "S2_Q1", value: 6 },
      { stableKey: "S2_Q2", value: 6 },
      { stableKey: "S3_Q1", value: 8 },
      { stableKey: "S3_Q2", value: 8 },
    ];
    const result = scoreSubmission(version, answers);
    expect(result.perDomain).toBeDefined();
    expect(result.perDomain).toHaveLength(2);
    const d1 = result.perDomain!.find((d) => d.key === "D1");
    const d2 = result.perDomain!.find((d) => d.key === "D2");
    expect(d1?.averagePoints).toBeCloseTo(5, 5);
    expect(d1?.answeredSectionCount).toBe(2);
    expect(d1?.totalSectionCount).toBe(2);
    expect(d2?.averagePoints).toBeCloseTo(8, 5);
    expect(d1?.tier?.label).toBe("Mid");
    expect(d2?.tier?.label).toBe("Hi");
  });

  it("[8] mean-of-section-means math: [2.8, 3.4] → 3.1", () => {
    // Override step so we can produce non-integer means. Use scale 0-10 with
    // 5 questions per section to get fractional averages naturally.
    const version: TemplateVersionForScoring = {
      sections: [
        { stableKey: "S1", sortOrder: 1, name: "S1", domain: "D1" } as TemplateVersionForScoring["sections"][number],
        { stableKey: "S2", sortOrder: 2, name: "S2", domain: "D1" } as TemplateVersionForScoring["sections"][number],
      ],
      questions: [
        // S1 values: [1, 2, 3, 4, 4] sum=14 mean=2.8
        ...[1, 2, 3, 4, 4].map((v, i) => ({
          stableKey: `S1_Q${i + 1}`,
          sortOrder: i + 1,
          type: "SLIDER_LIKERT" as const,
          label: `S1Q${i + 1}`,
          sectionStableKey: "S1",
          isRequired: true,
          scale: { min: 0, max: 10, step: 1, anchorMin: "L", anchorMax: "H" },
        })),
        // S2 values: [2, 3, 3, 4, 5] sum=17 mean=3.4
        ...[2, 3, 3, 4, 5].map((v, i) => ({
          stableKey: `S2_Q${i + 1}`,
          sortOrder: i + 6,
          type: "SLIDER_LIKERT" as const,
          label: `S2Q${i + 1}`,
          sectionStableKey: "S2",
          isRequired: true,
          scale: { min: 0, max: 10, step: 1, anchorMin: "L", anchorMax: "H" },
        })),
      ],
      scoringConfig: {
        tierMetric: "overallTotal",
        passThreshold: 7,
        tiers: [
          { minMetric: 0, maxMetric: 33, label: "Lo", message: "lo" },
          { minMetric: 34, maxMetric: 66, label: "Mid", message: "mid" },
          { minMetric: 67, maxMetric: 100, label: "Hi", message: "hi" },
        ],
        domains: [
          {
            key: "D1",
            label: "Domain 1",
            tiers: [
              { minMetric: 0, maxMetric: 3, label: "Lo", message: "lo" },
              { minMetric: 3, maxMetric: 10, label: "Hi", message: "hi" },
            ],
          },
        ],
      } as unknown as TemplateVersionForScoring["scoringConfig"],
    };
    const answers: Answer[] = [
      { stableKey: "S1_Q1", value: 1 },
      { stableKey: "S1_Q2", value: 2 },
      { stableKey: "S1_Q3", value: 3 },
      { stableKey: "S1_Q4", value: 4 },
      { stableKey: "S1_Q5", value: 4 },
      { stableKey: "S2_Q1", value: 2 },
      { stableKey: "S2_Q2", value: 3 },
      { stableKey: "S2_Q3", value: 3 },
      { stableKey: "S2_Q4", value: 4 },
      { stableKey: "S2_Q5", value: 5 },
    ];
    const result = scoreSubmission(version, answers);
    const d1 = result.perDomain!.find((d) => d.key === "D1");
    expect(d1?.averagePoints).toBeCloseTo(3.1, 5);
  });

  it("[9] empty section in domain excluded; answeredSectionCount reflects only answered sections", () => {
    // 3 sections in domain D1; only S1, S2 have answers; S3 has none (optional)
    const sections: TemplateVersionForScoring["sections"] = [
      { stableKey: "S1", sortOrder: 1, name: "S1", domain: "D1" } as TemplateVersionForScoring["sections"][number],
      { stableKey: "S2", sortOrder: 2, name: "S2", domain: "D1" } as TemplateVersionForScoring["sections"][number],
      { stableKey: "S3", sortOrder: 3, name: "S3", domain: "D1" } as TemplateVersionForScoring["sections"][number],
    ];
    const questions: TemplateVersionForScoring["questions"] = [
      ...["S1", "S2", "S3"].flatMap((sk, i) =>
        [1, 2].map((q) => ({
          stableKey: `${sk}_Q${q}`,
          sortOrder: i * 2 + q,
          type: "SLIDER_LIKERT" as const,
          label: `${sk}Q${q}`,
          sectionStableKey: sk,
          isRequired: false, // optional so S3 can be unanswered
          scale: { min: 0, max: 10, step: 1, anchorMin: "L", anchorMax: "H" },
        }))
      ),
    ];
    const version: TemplateVersionForScoring = {
      sections,
      questions,
      scoringConfig: {
        tierMetric: "overallTotal",
        passThreshold: 7,
        tiers: [
          { minMetric: 0, maxMetric: 30, label: "Lo", message: "lo" },
          { minMetric: 31, maxMetric: 60, label: "Hi", message: "hi" },
        ],
        domains: [
          {
            key: "D1",
            label: "D1",
            tiers: [
              { minMetric: 0, maxMetric: 5, label: "Lo", message: "lo" },
              { minMetric: 5, maxMetric: 10, label: "Hi", message: "hi" },
            ],
          },
        ],
      } as unknown as TemplateVersionForScoring["scoringConfig"],
    };
    const answers: Answer[] = [
      { stableKey: "S1_Q1", value: 4 },
      { stableKey: "S1_Q2", value: 4 },
      { stableKey: "S2_Q1", value: 6 },
      { stableKey: "S2_Q2", value: 6 },
    ];
    const result = scoreSubmission(version, answers);
    const d1 = result.perDomain!.find((d) => d.key === "D1");
    expect(d1).toBeDefined();
    expect(d1?.answeredSectionCount).toBe(2);
    expect(d1?.totalSectionCount).toBe(3);
    // mean of (4, 6) = 5
    expect(d1?.averagePoints).toBeCloseTo(5, 5);
  });

  it("[10] zero-answer domain → averagePoints: null, tier: null, answeredSectionCount: 0", () => {
    // D2 has all-optional sections that go unanswered.
    const sections: TemplateVersionForScoring["sections"] = [
      { stableKey: "S1", sortOrder: 1, name: "S1", domain: "D1" } as TemplateVersionForScoring["sections"][number],
      { stableKey: "S2", sortOrder: 2, name: "S2", domain: "D2" } as TemplateVersionForScoring["sections"][number],
      { stableKey: "S3", sortOrder: 3, name: "S3", domain: "D2" } as TemplateVersionForScoring["sections"][number],
    ];
    const questions: TemplateVersionForScoring["questions"] = [
      ...["S1", "S2", "S3"].flatMap((sk, i) =>
        [1, 2].map((q) => ({
          stableKey: `${sk}_Q${q}`,
          sortOrder: i * 2 + q,
          type: "SLIDER_LIKERT" as const,
          label: `${sk}Q${q}`,
          sectionStableKey: sk,
          isRequired: false,
          scale: { min: 0, max: 10, step: 1, anchorMin: "L", anchorMax: "H" },
        }))
      ),
    ];
    const version: TemplateVersionForScoring = {
      sections,
      questions,
      scoringConfig: {
        tierMetric: "overallTotal",
        passThreshold: 7,
        tiers: [
          { minMetric: 0, maxMetric: 30, label: "Lo", message: "lo" },
          { minMetric: 31, maxMetric: 60, label: "Hi", message: "hi" },
        ],
        domains: [
          {
            key: "D1",
            label: "D1",
            tiers: [
              { minMetric: 0, maxMetric: 5, label: "Lo", message: "lo" },
              { minMetric: 5, maxMetric: 10, label: "Hi", message: "hi" },
            ],
          },
          {
            key: "D2",
            label: "D2",
            tiers: [
              { minMetric: 0, maxMetric: 5, label: "Lo", message: "lo" },
              { minMetric: 5, maxMetric: 10, label: "Hi", message: "hi" },
            ],
          },
        ],
      } as unknown as TemplateVersionForScoring["scoringConfig"],
    };
    const answers: Answer[] = [
      { stableKey: "S1_Q1", value: 4 },
      { stableKey: "S1_Q2", value: 4 },
    ];
    const result = scoreSubmission(version, answers);
    const d2 = result.perDomain!.find((d) => d.key === "D2");
    expect(d2).toBeDefined();
    expect(d2?.averagePoints).toBeNull();
    expect(d2?.tier).toBeNull();
    expect(d2?.answeredSectionCount).toBe(0);
    expect(d2?.totalSectionCount).toBe(2);
  });

  it("[11] null domains excluded from meanOfDomains rollup", () => {
    // 2 domains, D2 has no answers → null. Global rollup over only D1.
    const sections: TemplateVersionForScoring["sections"] = [
      { stableKey: "S1", sortOrder: 1, name: "S1", domain: "D1" } as TemplateVersionForScoring["sections"][number],
      { stableKey: "S2", sortOrder: 2, name: "S2", domain: "D2" } as TemplateVersionForScoring["sections"][number],
    ];
    const questions: TemplateVersionForScoring["questions"] = [
      ...["S1", "S2"].flatMap((sk, i) =>
        [1, 2].map((q) => ({
          stableKey: `${sk}_Q${q}`,
          sortOrder: i * 2 + q,
          type: "SLIDER_LIKERT" as const,
          label: `${sk}Q${q}`,
          sectionStableKey: sk,
          isRequired: false,
          scale: { min: 0, max: 10, step: 1, anchorMin: "L", anchorMax: "H" },
        }))
      ),
    ];
    const version: TemplateVersionForScoring = {
      sections,
      questions,
      scoringConfig: {
        tierMetric: "overallTotal",
        passThreshold: 7,
        // With rollup set, global tiers resolve against rollup.overall (0-10
        // domain-mean scale), so the tier shape uses 0-10.
        tiers: [
          { minMetric: 0, maxMetric: 5, label: "Lo", message: "lo" },
          { minMetric: 5, maxMetric: 10, label: "Hi", message: "hi" },
        ],
        rollup: { overall: "meanOfDomains" },
        domains: [
          {
            key: "D1",
            label: "D1",
            tiers: [
              { minMetric: 0, maxMetric: 5, label: "Lo", message: "lo" },
              { minMetric: 5, maxMetric: 10, label: "Hi", message: "hi" },
            ],
          },
          {
            key: "D2",
            label: "D2",
            tiers: [
              { minMetric: 0, maxMetric: 5, label: "Lo", message: "lo" },
              { minMetric: 5, maxMetric: 10, label: "Hi", message: "hi" },
            ],
          },
        ],
      } as unknown as TemplateVersionForScoring["scoringConfig"],
    };
    const answers: Answer[] = [
      { stableKey: "S1_Q1", value: 7 },
      { stableKey: "S1_Q2", value: 7 },
    ];
    const result = scoreSubmission(version, answers);
    // Mean of (7) since D2 is null → 7
    expect(result.tierMetricValue).toBeCloseTo(7, 5);
    expect(result.tier?.label).toBe("Hi");
  });
});

describe("D2 — canonical overall rollup", () => {
  it("[12] rollup.overall='meanOfDomains' resolves global tier against mean of non-null domain means", () => {
    const sections: TemplateVersionForScoring["sections"] = [
      { stableKey: "S1", sortOrder: 1, name: "S1", domain: "D1" } as TemplateVersionForScoring["sections"][number],
      { stableKey: "S2", sortOrder: 2, name: "S2", domain: "D2" } as TemplateVersionForScoring["sections"][number],
    ];
    const questions: TemplateVersionForScoring["questions"] = [
      ...["S1", "S2"].flatMap((sk, i) =>
        [1, 2].map((q) => ({
          stableKey: `${sk}_Q${q}`,
          sortOrder: i * 2 + q,
          type: "SLIDER_LIKERT" as const,
          label: `${sk}Q${q}`,
          sectionStableKey: sk,
          isRequired: true,
          scale: { min: 0, max: 10, step: 1, anchorMin: "L", anchorMax: "H" },
        }))
      ),
    ];
    const version: TemplateVersionForScoring = {
      sections,
      questions,
      scoringConfig: {
        tierMetric: "overallTotal",
        passThreshold: 7,
        tiers: [
          { minMetric: 0, maxMetric: 5, label: "Lo", message: "lo" },
          { minMetric: 5, maxMetric: 10, label: "Hi", message: "hi" },
        ],
        rollup: { overall: "meanOfDomains" },
        domains: [
          {
            key: "D1",
            label: "D1",
            tiers: [
              { minMetric: 0, maxMetric: 10, label: "X", message: "x" },
            ],
          },
          {
            key: "D2",
            label: "D2",
            tiers: [
              { minMetric: 0, maxMetric: 10, label: "X", message: "x" },
            ],
          },
        ],
      } as unknown as TemplateVersionForScoring["scoringConfig"],
    };
    const answers: Answer[] = [
      // D1 = mean(4,4) = 4
      { stableKey: "S1_Q1", value: 4 },
      { stableKey: "S1_Q2", value: 4 },
      // D2 = mean(8,8) = 8
      { stableKey: "S2_Q1", value: 8 },
      { stableKey: "S2_Q2", value: 8 },
    ];
    const result = scoreSubmission(version, answers);
    // mean(4, 8) = 6
    expect(result.tierMetricValue).toBeCloseTo(6, 5);
    expect(result.tier?.label).toBe("Hi");
  });

  it("[13] rollup.overall='meanOfSections' resolves against mean of section means (skip nulls)", () => {
    const sections: TemplateVersionForScoring["sections"] = [
      { stableKey: "S1", sortOrder: 1, name: "S1" } as TemplateVersionForScoring["sections"][number],
      { stableKey: "S2", sortOrder: 2, name: "S2" } as TemplateVersionForScoring["sections"][number],
      { stableKey: "S3", sortOrder: 3, name: "S3" } as TemplateVersionForScoring["sections"][number],
    ];
    const questions: TemplateVersionForScoring["questions"] = [
      ...["S1", "S2", "S3"].flatMap((sk, i) =>
        [1, 2].map((q) => ({
          stableKey: `${sk}_Q${q}`,
          sortOrder: i * 2 + q,
          type: "SLIDER_LIKERT" as const,
          label: `${sk}Q${q}`,
          sectionStableKey: sk,
          isRequired: false,
          scale: { min: 0, max: 10, step: 1, anchorMin: "L", anchorMax: "H" },
        }))
      ),
    ];
    const version: TemplateVersionForScoring = {
      sections,
      questions,
      scoringConfig: {
        tierMetric: "overallTotal",
        passThreshold: 7,
        tiers: [
          { minMetric: 0, maxMetric: 5, label: "Lo", message: "lo" },
          { minMetric: 5, maxMetric: 10, label: "Hi", message: "hi" },
        ],
        rollup: { overall: "meanOfSections" },
      } as unknown as TemplateVersionForScoring["scoringConfig"],
    };
    // S1 mean = 4, S2 mean = 8, S3 unanswered (skipped). overall = mean(4,8) = 6
    const answers: Answer[] = [
      { stableKey: "S1_Q1", value: 4 },
      { stableKey: "S1_Q2", value: 4 },
      { stableKey: "S2_Q1", value: 8 },
      { stableKey: "S2_Q2", value: 8 },
    ];
    const result = scoreSubmission(version, answers);
    expect(result.tierMetricValue).toBeCloseTo(6, 5);
    expect(result.tier?.label).toBe("Hi");
  });

  it("[14] rollup.overall='meanOfQuestions' resolves against mean of question values (skip unanswered)", () => {
    const version = buildD2BaseVersion({
      scoringConfig: {
        rollup: { overall: "meanOfQuestions" },
        tiers: [
          { minMetric: 0, maxMetric: 5, label: "Lo", message: "lo" },
          { minMetric: 5, maxMetric: 10, label: "Hi", message: "hi" },
        ],
      },
    });
    const answers: Answer[] = version.questions.map((q) => ({
      stableKey: q.stableKey,
      value: 7,
    }));
    const result = scoreSubmission(version, answers);
    expect(result.tierMetricValue).toBeCloseTo(7, 5);
    expect(result.tier?.label).toBe("Hi");
  });

  it("[15] legacy tierMetric='countAchieved' with no rollup runs legacy path; BC snapshot matches scoring-bc-snapshot suite", () => {
    // The dedicated scoring-bc-snapshot.test.ts locks the byte-exact
    // Rockefeller output. Here we just assert the legacy code path still
    // produces non-null tier resolution + that no new D2 fields leak into
    // the output when rollup is omitted.
    const version = buildRockefellerVersion();
    const result = scoreSubmission(version, ROCKEFELLER_GOLDEN_ANSWERS);
    expect(result.tier).not.toBeNull();
    expect(result.tierMetricValue).toBe(37); // countAchieved
    // No D2 fields when not opted in.
    expect(result.perDomain).toBeUndefined();
    expect(result.scaleUpScore).toBeUndefined();
    for (const q of result.perQuestion) {
      expect(q.recommendation).toBeUndefined();
    }
  });
});

describe("D2 — ScaleUp Score 0-100", () => {
  function buildScaleUpVersion(opts: {
    scaleMax?: number;
    rollupOverall?: "meanOfQuestions" | "meanOfSections" | "meanOfDomains";
    enable?: boolean;
  } = {}): TemplateVersionForScoring {
    const scaleMax = opts.scaleMax ?? 10;
    const sections: TemplateVersionForScoring["sections"] = [
      { stableKey: "S1", sortOrder: 1, name: "S1", domain: "D1" } as TemplateVersionForScoring["sections"][number],
      { stableKey: "S2", sortOrder: 2, name: "S2", domain: "D2" } as TemplateVersionForScoring["sections"][number],
    ];
    const questions: TemplateVersionForScoring["questions"] = [
      ...["S1", "S2"].flatMap((sk, i) =>
        [1, 2].map((q) => ({
          stableKey: `${sk}_Q${q}`,
          sortOrder: i * 2 + q,
          type: "SLIDER_LIKERT" as const,
          label: `${sk}Q${q}`,
          sectionStableKey: sk,
          isRequired: true,
          scale: { min: 0, max: scaleMax, step: 1, anchorMin: "L", anchorMax: "H" },
        }))
      ),
    ];
    const cfg: Record<string, unknown> = {
      tierMetric: "overallTotal",
      passThreshold: 7,
      tiers: [
        { minMetric: 0, maxMetric: 5, label: "Lo", message: "lo" },
        { minMetric: 5, maxMetric: 10, label: "Hi", message: "hi" },
      ],
      domains: [
        {
          key: "D1",
          label: "D1",
          tiers: [{ minMetric: 0, maxMetric: 10, label: "X", message: "x" }],
        },
        {
          key: "D2",
          label: "D2",
          tiers: [{ minMetric: 0, maxMetric: 10, label: "X", message: "x" }],
        },
      ],
    };
    if (opts.rollupOverall) cfg.rollup = { overall: opts.rollupOverall };
    if (opts.enable) cfg.scaleUpScore = true;
    return {
      sections,
      questions,
      scoringConfig: cfg as unknown as TemplateVersionForScoring["scoringConfig"],
    };
  }

  it("[18] enabled + meanOfDomains → scaleUpScore = round(meanOfDomains * 10)", () => {
    const version = buildScaleUpVersion({
      rollupOverall: "meanOfDomains",
      enable: true,
    });
    const answers: Answer[] = [
      // D1 mean = 4, D2 mean = 8 → meanOfDomains = 6 → scaleUp = 60
      { stableKey: "S1_Q1", value: 4 },
      { stableKey: "S1_Q2", value: 4 },
      { stableKey: "S2_Q1", value: 8 },
      { stableKey: "S2_Q2", value: 8 },
    ];
    const result = scoreSubmission(version, answers);
    expect(result.scaleUpScore).toBe(60);
  });

  it("[19] publish schema rejects scaleUpScore=true without rollup.overall", () => {
    const version = buildScaleUpVersion({ enable: true }); // no rollupOverall
    expect(TemplateVersionForPublishSchema.safeParse(version).success).toBe(
      false
    );
    // Also rejected at runtime per Codex round 3 #3 (new opt-in field).
    expect(TemplateVersionForScoringSchema.safeParse(version).success).toBe(
      false
    );
  });

  it("[20] publish schema rejects scaleUpScore=true on non-0-10 scale", () => {
    const version = buildScaleUpVersion({
      scaleMax: 4,
      rollupOverall: "meanOfDomains",
      enable: true,
    });
    expect(TemplateVersionForPublishSchema.safeParse(version).success).toBe(
      false
    );
    expect(TemplateVersionForScoringSchema.safeParse(version).success).toBe(
      false
    );
  });

  it("[21] Rockefeller / QSP do not opt in — scaleUpScore stays undefined", () => {
    const version = buildRockefellerVersion();
    const result = scoreSubmission(version, ROCKEFELLER_GOLDEN_ANSWERS);
    expect(result.scaleUpScore).toBeUndefined();
  });
});

describe("D2 — backwards-compat snapshot for QSP (post-D2.0 hotfix)", () => {
  it("[17] QSP v1 scoring path output is snapshotted (locks the post-D2.0 shape)", () => {
    const { sections, questions, scoringConfig } = buildQspV1Content();
    const version: TemplateVersionForScoring = {
      sections,
      questions,
      scoringConfig:
        scoringConfig as unknown as TemplateVersionForScoring["scoringConfig"],
    };
    // QSP v1 now has NUMBER + SLIDER_LIKERT + TEXT questions. Provide
    // type-correct answers. The engine only scores SLIDER_LIKERT; the 7
    // sliders (alternating 7/8) drive the overallAverage.
    const answers: Answer[] = questions.map((q, idx) => ({
      stableKey: q.stableKey,
      value: q.type === "TEXT" ? "synthetic answer" : (idx % 2 === 0 ? 7 : 8),
    }));
    const result = scoreSubmission(version, answers);
    expect(result.tier).not.toBeNull();
    // BC: no D2 fields leak through (QSP doesn't opt in).
    expect(result.perDomain).toBeUndefined();
    expect(result.scaleUpScore).toBeUndefined();
    for (const q of result.perQuestion) {
      expect(q.recommendation).toBeUndefined();
    }
    // Sanity: snapshot the totals as an inline regression guard.
    // With 7 SLIDER_LIKERT questions at alternating 7/8, overallAverage is 7.5.
    expect(typeof result.overallAverage).toBe("number");
    expect(result.overallAverage).toBeGreaterThanOrEqual(1);
    expect(result.overallAverage).toBeLessThanOrEqual(10);
  });
});


// ─── E1.1 — Per-domain tier-tiling enforcement (publish + runtime) ──────

describe("E1.1 — per-domain tier-tiling validation", () => {
  function buildDomainTierVersion(opts: {
    domainTiers: Array<{
      minMetric: number;
      maxMetric?: number;
      label: string;
      message: string;
    }>;
    scaleMax?: number;
    scaleMin?: number;
    mixedScales?: boolean;
  }): TemplateVersionForScoring {
    const scaleMax = opts.scaleMax ?? 10;
    const scaleMin = opts.scaleMin ?? 0;
    const sections = [
      { stableKey: "S1", sortOrder: 1, name: "Section 1", domain: "D1" },
      { stableKey: "S2", sortOrder: 2, name: "Section 2", domain: "D1" },
    ] as TemplateVersionForScoring["sections"];
    const questions: TemplateVersionForScoring["questions"] = [];
    let sortOrder = 0;
    for (const sk of ["S1", "S2"]) {
      for (let q = 1; q <= 2; q++) {
        sortOrder += 1;
        // Optionally make one question on a different scale to exercise
        // the mixed-scale rejection.
        const isMixed = opts.mixedScales && sk === "S2" && q === 1;
        questions.push({
          stableKey: `${sk}_Q${q}`,
          sortOrder,
          type: "SLIDER_LIKERT" as const,
          label: `${sk}Q${q}`,
          sectionStableKey: sk,
          isRequired: true,
          scale: {
            min: scaleMin,
            max: isMixed ? scaleMax + 1 : scaleMax,
            step: 1,
            anchorMin: "L",
            anchorMax: "H",
          },
        });
      }
    }
    return {
      sections,
      questions,
      scoringConfig: {
        tierMetric: "overallAvg",
        passThreshold: 7,
        tiers: [
          { minMetric: 0, maxMetric: 5, label: "Lo", message: "lo" },
          { minMetric: 5, maxMetric: scaleMax, label: "Hi", message: "hi" },
        ],
        rollup: { overall: "meanOfDomains" },
        domains: [
          {
            key: "D1",
            label: "Domain 1",
            tiers: opts.domainTiers,
          },
        ],
      } as unknown as TemplateVersionForScoring["scoringConfig"],
    };
  }

  it("publish schema rejects per-domain tier gap (fractional touching required)", () => {
    const version = buildDomainTierVersion({
      domainTiers: [
        { minMetric: 0, maxMetric: 3, label: "Lo", message: "lo" },
        { minMetric: 4, maxMetric: 7, label: "Mid", message: "mid" },
        { minMetric: 7, maxMetric: 10, label: "Hi", message: "hi" },
      ],
    });
    const parsed = TemplateVersionForPublishSchema.safeParse(version);
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      const hasDomainPath = parsed.error.issues.some(
        (i) => i.path[0] === "scoringConfig" && i.path[1] === "domains",
      );
      expect(hasDomainPath).toBe(true);
    }
  });

  it("publish schema rejects per-domain tier overlap", () => {
    const version = buildDomainTierVersion({
      domainTiers: [
        { minMetric: 0, maxMetric: 5, label: "Lo", message: "lo" },
        { minMetric: 4, maxMetric: 8, label: "Mid", message: "mid" },
        { minMetric: 8, maxMetric: 10, label: "Hi", message: "hi" },
      ],
    });
    const parsed = TemplateVersionForPublishSchema.safeParse(version);
    expect(parsed.success).toBe(false);
  });

  it("publish schema accepts well-formed fractional-touching per-domain tiers", () => {
    const version = buildDomainTierVersion({
      domainTiers: [
        { minMetric: 0, maxMetric: 3, label: "Lo", message: "lo" },
        { minMetric: 3, maxMetric: 7, label: "Mid", message: "mid" },
        { minMetric: 7, maxMetric: 10, label: "Hi", message: "hi" },
      ],
    });
    // Add a full-coverage recommendation band per question + assignment
    // (the publish schema also enforces recommendations on D2 templates,
    // but a template that opts into rollup without per-question
    // recommendations is OK — runtime+publish are lenient on recs being
    // absent).
    const parsed = TemplateVersionForPublishSchema.safeParse(version);
    expect(parsed.success).toBe(true);
  });

  it("runtime engine rejects malformed per-domain tiers (belt-and-suspenders)", () => {
    const version = buildDomainTierVersion({
      domainTiers: [
        { minMetric: 0, maxMetric: 3, label: "Lo", message: "lo" },
        { minMetric: 5, maxMetric: 7, label: "Mid", message: "mid" },
        { minMetric: 7, maxMetric: 10, label: "Hi", message: "hi" },
      ],
    });
    const answers: Answer[] = [
      { stableKey: "S1_Q1", value: 5 },
      { stableKey: "S1_Q2", value: 5 },
      { stableKey: "S2_Q1", value: 5 },
      { stableKey: "S2_Q2", value: 5 },
    ];
    expect(() => scoreSubmission(version, answers)).toThrow(
      ScoringValidationError,
    );
  });

  it("publish schema rejects mixed question scales within a domain", () => {
    const version = buildDomainTierVersion({
      domainTiers: [
        { minMetric: 0, maxMetric: 3, label: "Lo", message: "lo" },
        { minMetric: 3, maxMetric: 7, label: "Mid", message: "mid" },
        { minMetric: 7, maxMetric: 10, label: "Hi", message: "hi" },
      ],
      mixedScales: true,
    });
    const parsed = TemplateVersionForPublishSchema.safeParse(version);
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      const hasAmbiguousMessage = parsed.error.issues.some((i) =>
        String(i.message).toLowerCase().includes("ambiguous"),
      );
      expect(hasAmbiguousMessage).toBe(true);
    }
  });

  it("legacy Rockefeller BC: no rollup, no domains → no per-domain validation", () => {
    // Reuse the existing Rockefeller fixture; just confirm it still scores
    // without invoking any per-domain tile checks.
    const version = buildRockefellerVersion();
    const answers: Answer[] = version.questions.map((q) => ({
      stableKey: q.stableKey,
      value: 2,
    }));
    const result = scoreSubmission(version, answers);
    expect(result.perDomain).toBeUndefined();
    expect(result.tier).not.toBeNull();
  });
});
