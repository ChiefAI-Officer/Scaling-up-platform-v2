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
  type TemplateVersionForScoring,
  type Answer,
} from "@/lib/assessments/scoring";

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
    // Synthetic answers: alternate 7 and 8 across all questions → avg 7.5.
    const answers: Answer[] = questions.map((q, idx) => ({
      stableKey: q.stableKey,
      value: idx % 2 === 0 ? 7 : 8,
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
    const answers: Answer[] = questions.map((q) => ({
      stableKey: q.stableKey,
      value: 6,
    }));

    expect(() => scoreSubmission(version, answers)).not.toThrow();

    const result = scoreSubmission(version, answers);
    expect(result.tier).not.toBeNull();
    expect(result.overallAverage).toBeGreaterThanOrEqual(1);
    expect(result.overallAverage).toBeLessThanOrEqual(10);
  });
});
