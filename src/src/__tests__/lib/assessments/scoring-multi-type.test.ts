/**
 * Phase B — Multi-type question discriminated union tests.
 *
 * These tests verify that:
 * 1. TemplateVersionForPublishSchema accepts TEXT/NUMBER/MULTI_CHOICE questions
 * 2. SLIDER_LIKERT still requires a scale field
 * 3. scoreSubmission ignores non-SLIDER answers and only scores SLIDER_LIKERT
 * 4. Existing scoring tests remain unaffected (run via the separate suites)
 */

import {
  TemplateVersionForPublishSchema,
  TemplateVersionForScoringSchema,
  scoreSubmission,
} from "@/lib/assessments/scoring";

// ─── Shared fixture helpers ───────────────────────────────────────────────

function makeSliderQuestion(overrides: Record<string, unknown> = {}) {
  return {
    stableKey: "Q_SLIDER",
    sortOrder: 1,
    type: "SLIDER_LIKERT" as const,
    label: "How effective is our strategy?",
    isRequired: true,
    sectionStableKey: "S1",
    scale: { min: 1, max: 7, step: 1, anchorMin: "Not at all", anchorMax: "Extremely" },
    ...overrides,
  };
}

function makeTextQuestion(overrides: Record<string, unknown> = {}) {
  return {
    stableKey: "Q_TEXT",
    sortOrder: 2,
    type: "TEXT" as const,
    label: "Describe your biggest challenge.",
    isRequired: false,
    sectionStableKey: "S1",
    ...overrides,
  };
}

function makeNumberQuestion(overrides: Record<string, unknown> = {}) {
  return {
    stableKey: "Q_NUMBER",
    sortOrder: 3,
    type: "NUMBER" as const,
    label: "How many employees do you have?",
    isRequired: false,
    sectionStableKey: "S1",
    ...overrides,
  };
}

function makeMultiChoiceQuestion(overrides: Record<string, unknown> = {}) {
  return {
    stableKey: "Q_MULTI",
    sortOrder: 4,
    type: "MULTI_CHOICE" as const,
    label: "Which of these apply?",
    isRequired: false,
    sectionStableKey: "S1",
    options: [
      { key: "A", label: "Option A" },
      { key: "B", label: "Option B" },
    ],
    ...overrides,
  };
}

function makeSection(overrides: Record<string, unknown> = {}) {
  return {
    stableKey: "S1",
    sortOrder: 1,
    name: "General",
    ...overrides,
  };
}

/** A minimal scoring config: overallAvg on a 1-7 scale with one tier. */
function makeSimpleScoringConfig() {
  return {
    tierMetric: "overallAvg" as const,
    passThreshold: 4,
    tiers: [{ minMetric: 1, label: "Developing", message: "Keep growing." }],
  };
}

// ─── Test 1: Publish schema accepts mixed question types ──────────────────

describe("TemplateVersionForPublishSchema — multi-type questions", () => {
  it("accepts a version containing SLIDER_LIKERT + TEXT + NUMBER + MULTI_CHOICE questions", () => {
    const version = {
      questions: [
        makeSliderQuestion({ stableKey: "Q1" }),
        makeSliderQuestion({ stableKey: "Q2", sortOrder: 2 }),
        makeTextQuestion({ stableKey: "Q3", sortOrder: 3 }),
        makeNumberQuestion({ stableKey: "Q4", sortOrder: 4 }),
        makeMultiChoiceQuestion({ stableKey: "Q5", sortOrder: 5 }),
      ],
      sections: [makeSection()],
      scoringConfig: makeSimpleScoringConfig(),
    };

    const result = TemplateVersionForPublishSchema.safeParse(version);
    if (!result.success) {
      // Provide detailed error output for debugging
      console.error("Unexpected parse failure:", JSON.stringify(result.error.issues, null, 2));
    }
    expect(result.success).toBe(true);
  });

  it("still rejects a SLIDER_LIKERT question that is missing the scale field", () => {
    const questionWithoutScale = {
      stableKey: "Q_NO_SCALE",
      sortOrder: 1,
      type: "SLIDER_LIKERT",
      label: "Missing scale",
      isRequired: true,
      // scale intentionally omitted
    };

    const version = {
      questions: [questionWithoutScale],
      sections: [makeSection()],
      scoringConfig: makeSimpleScoringConfig(),
    };

    const result = TemplateVersionForPublishSchema.safeParse(version);
    expect(result.success).toBe(false);
  });
});

// ─── Test 3: scoreSubmission ignores non-SLIDER answers ──────────────────

describe("scoreSubmission — multi-type question filtering", () => {
  it("does not throw and scores only SLIDER_LIKERT answers when TEXT/NUMBER/MULTI_CHOICE questions are present", () => {
    const version = {
      questions: [
        makeSliderQuestion({ stableKey: "Q_S1", sortOrder: 1 }),
        makeSliderQuestion({ stableKey: "Q_S2", sortOrder: 2 }),
        makeTextQuestion({ stableKey: "Q_T1", sortOrder: 3, isRequired: false }),
      ],
      sections: [makeSection()],
      scoringConfig: makeSimpleScoringConfig(),
    };

    const answers = [
      { stableKey: "Q_S1", value: 5 },
      { stableKey: "Q_S2", value: 6 },
      // No answer for Q_T1 — TEXT answers are not scored and should be silently ignored
    ];

    let result: ReturnType<typeof scoreSubmission> | undefined;
    expect(() => {
      result = scoreSubmission(version as Parameters<typeof scoreSubmission>[0], answers);
    }).not.toThrow();

    // Only the 2 SLIDER answers should appear in perQuestion
    expect(result).toBeDefined();
    expect(result!.perQuestion).toHaveLength(2);
    expect(result!.perQuestion.map((q) => q.stableKey)).toEqual(
      expect.arrayContaining(["Q_S1", "Q_S2"])
    );

    // Tier should be resolved (both answers are 5 and 6; avg = 5.5 ≥ 1 so tier matches)
    expect(result!.tier).not.toBeNull();
    expect(result!.tier?.label).toBe("Developing");
  });

  it("correctly computes overallAverage from SLIDER_LIKERT answers only (TEXT ignored)", () => {
    const version = {
      questions: [
        makeSliderQuestion({ stableKey: "Q_S1", sortOrder: 1, isRequired: true }),
        makeTextQuestion({ stableKey: "Q_T1", sortOrder: 2, isRequired: false }),
      ],
      sections: [makeSection()],
      scoringConfig: makeSimpleScoringConfig(),
    };

    const answers = [
      { stableKey: "Q_S1", value: 4 },
      // Q_T1 has no numeric answer — omitted (not required)
    ];

    const result = scoreSubmission(version as Parameters<typeof scoreSubmission>[0], answers);

    // overallAverage should be 4 / 1 = 4 (only 1 SLIDER question answered)
    expect(result.overallAverage).toBe(4);
    expect(result.overallTotal).toBe(4);
  });
});

// ─── Test 4: TemplateVersionForScoringSchema (runtime) also accepts mixed types ──

describe("TemplateVersionForScoringSchema — multi-type questions (runtime permissive)", () => {
  it("accepts TEXT, NUMBER, MULTI_CHOICE questions without scale fields", () => {
    const version = {
      questions: [
        makeSliderQuestion(),
        makeTextQuestion(),
        makeNumberQuestion(),
        makeMultiChoiceQuestion(),
      ],
      sections: [makeSection()],
      scoringConfig: makeSimpleScoringConfig(),
    };

    const result = TemplateVersionForScoringSchema.safeParse(version);
    if (!result.success) {
      console.error("Runtime schema unexpected failure:", JSON.stringify(result.error.issues, null, 2));
    }
    expect(result.success).toBe(true);
  });
});
