/**
 * TDD — `scoreSubmission(version, answers, { allowMissingRequired })`.
 *
 * The historical-import path needs to score year-old Esperto submissions that
 * may lack a now-required answer. A new optional third parameter
 * `{ allowMissingRequired?: boolean }` opts into that behavior:
 *
 *   - falsy / absent (default): MISSING_REQUIRED_KEY still throws, byte-for-byte
 *     unchanged from the live submit-route path.
 *   - `true`: missing required keys are NOT a hard error — they are merged into
 *     `result.unansweredKeys` (deduped, appended after optional unanswered keys)
 *     and the scorer returns a normal ScoreResult over whatever WAS answered.
 *
 * All other validations (EMPTY_ANSWERS, OUT_OF_RANGE, etc.) still apply in both
 * modes. Pure / mocked — no DB.
 */

import {
  scoreSubmission,
  ScoringValidationError,
} from "@/lib/assessments/scoring";

// ─── Shared fixtures (same shape as scoring-answer-validation.test.ts) ─────

function makeSlider(stableKey: string, overrides: Record<string, unknown> = {}) {
  return {
    stableKey,
    sortOrder: 1,
    type: "SLIDER_LIKERT" as const,
    label: "Slider Q",
    isRequired: true,
    sectionStableKey: "S1",
    scale: { min: 1, max: 7, step: 1, anchorMin: "Low", anchorMax: "High" },
    ...overrides,
  };
}

function makeSection() {
  return { stableKey: "S1", sortOrder: 1, name: "General" };
}

/** Minimal scoring config with one pass-through tier covering a 1-7 slider scale. */
function makeConfig() {
  return {
    tierMetric: "overallAvg" as const,
    passThreshold: 4,
    tiers: [{ minMetric: 1, label: "All", message: "ok" }],
  };
}

/** Build a version with the given questions. */
function makeVersion(questions: unknown[]) {
  return {
    questions,
    sections: [makeSection()],
    scoringConfig: makeConfig(),
  };
}

type ScoringVersion = Parameters<typeof scoreSubmission>[0];
type ScoringAnswers = Parameters<typeof scoreSubmission>[1];

// ─── 1. DEFAULT behavior unchanged ─────────────────────────────────────────

describe("default mode — missing required slider still throws MISSING_REQUIRED_KEY", () => {
  // Two required sliders; answer only one so the other is missing-required.
  const version = makeVersion([
    makeSlider("Q_ANSWERED", { sortOrder: 1 }),
    makeSlider("Q_MISSING", { sortOrder: 2 }),
  ]) as ScoringVersion;
  const answers: ScoringAnswers = [{ stableKey: "Q_ANSWERED", value: 5 }];

  it("throws MISSING_REQUIRED_KEY when called with NO options", () => {
    expect(() => scoreSubmission(version, answers)).toThrow(
      ScoringValidationError
    );
    try {
      scoreSubmission(version, answers);
    } catch (e) {
      const err = e as ScoringValidationError;
      expect(err.code).toBe("MISSING_REQUIRED_KEY");
      expect(err.details).toMatchObject({ stableKeys: ["Q_MISSING"] });
    }
  });

  it("throws MISSING_REQUIRED_KEY when called with { allowMissingRequired: false }", () => {
    expect(() =>
      scoreSubmission(version, answers, { allowMissingRequired: false })
    ).toThrow(ScoringValidationError);
    try {
      scoreSubmission(version, answers, { allowMissingRequired: false });
    } catch (e) {
      const err = e as ScoringValidationError;
      expect(err.code).toBe("MISSING_REQUIRED_KEY");
    }
  });
});

// ─── 2. allowMissingRequired: true — no throw; missing key in unansweredKeys ─

describe("allowMissingRequired: true — missing required key is tolerated", () => {
  const version = makeVersion([
    makeSlider("Q_ANSWERED", { sortOrder: 1 }),
    makeSlider("Q_MISSING", { sortOrder: 2 }),
  ]) as ScoringVersion;
  const answers: ScoringAnswers = [{ stableKey: "Q_ANSWERED", value: 5 }];

  it("does NOT throw and returns a ScoreResult", () => {
    expect(() =>
      scoreSubmission(version, answers, { allowMissingRequired: true })
    ).not.toThrow();

    const result = scoreSubmission(version, answers, {
      allowMissingRequired: true,
    });
    // Shape spot-checks — it's a real ScoreResult computed over what WAS answered.
    expect(Array.isArray(result.perQuestion)).toBe(true);
    expect(Array.isArray(result.perSection)).toBe(true);
    expect(typeof result.overallAverage).toBe("number");
  });

  it("routes the missing required key into result.unansweredKeys (deduped)", () => {
    const result = scoreSubmission(version, answers, {
      allowMissingRequired: true,
    });
    expect(result.unansweredKeys).toContain("Q_MISSING");
    // Deduped — appears exactly once.
    const occurrences = result.unansweredKeys.filter(
      (k) => k === "Q_MISSING"
    ).length;
    expect(occurrences).toBe(1);
    // The answered key is not "unanswered".
    expect(result.unansweredKeys).not.toContain("Q_ANSWERED");
  });

  it("appends missing-required AFTER existing optional-unanswered keys (order)", () => {
    // Q_OPTIONAL is optional + unanswered → lands in unansweredKeys first.
    // Q_MISSING is required + unanswered → appended after under tolerant mode.
    const v = makeVersion([
      makeSlider("Q_ANSWERED", { sortOrder: 1 }),
      makeSlider("Q_OPTIONAL", { sortOrder: 2, isRequired: false }),
      makeSlider("Q_MISSING", { sortOrder: 3 }),
    ]) as ScoringVersion;
    const a: ScoringAnswers = [{ stableKey: "Q_ANSWERED", value: 5 }];

    const result = scoreSubmission(v, a, { allowMissingRequired: true });
    const iOpt = result.unansweredKeys.indexOf("Q_OPTIONAL");
    const iMiss = result.unansweredKeys.indexOf("Q_MISSING");
    expect(iOpt).toBeGreaterThanOrEqual(0);
    expect(iMiss).toBeGreaterThanOrEqual(0);
    expect(iMiss).toBeGreaterThan(iOpt);
  });
});

// ─── 3. Non-required validations still fire under allowMissingRequired: true ─

describe("allowMissingRequired: true — other validations still enforced", () => {
  it("OUT_OF_RANGE still throws for an over-range slider value", () => {
    const version = makeVersion([
      makeSlider("Q_ANSWERED", { sortOrder: 1 }),
      makeSlider("Q_MISSING", { sortOrder: 2 }),
    ]) as ScoringVersion;
    // Q_ANSWERED is out of the 1-7 range; Q_MISSING is missing-required.
    const answers: ScoringAnswers = [{ stableKey: "Q_ANSWERED", value: 99 }];

    expect(() =>
      scoreSubmission(version, answers, { allowMissingRequired: true })
    ).toThrow(ScoringValidationError);
    try {
      scoreSubmission(version, answers, { allowMissingRequired: true });
    } catch (e) {
      const err = e as ScoringValidationError;
      expect(err.code).toBe("OUT_OF_RANGE");
    }
  });

  it("EMPTY_ANSWERS still throws when zero answers are submitted", () => {
    const version = makeVersion([
      makeSlider("Q_ANSWERED", { sortOrder: 1 }),
      makeSlider("Q_MISSING", { sortOrder: 2 }),
    ]) as ScoringVersion;
    const answers: ScoringAnswers = [];

    expect(() =>
      scoreSubmission(version, answers, { allowMissingRequired: true })
    ).toThrow(ScoringValidationError);
    try {
      scoreSubmission(version, answers, { allowMissingRequired: true });
    } catch (e) {
      const err = e as ScoringValidationError;
      expect(err.code).toBe("EMPTY_ANSWERS");
    }
  });
});
