/**
 * TDD — server-side answer validation for ALL question types.
 *
 * Task: required-presence check extended to TEXT/NUMBER/MULTI_CHOICE, and
 * value-shape validation added for all four question types.
 *
 * These tests drive the implementation in scoring.ts and the route-level
 * payload-size cap. All tests are pure / mocked — no DB.
 */

import {
  scoreSubmission,
  ScoringValidationError,
  validateAnswerValues,
} from "@/lib/assessments/scoring";

// ─── Shared fixtures ──────────────────────────────────────────────────────

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

function makeText(stableKey: string, overrides: Record<string, unknown> = {}) {
  return {
    stableKey,
    sortOrder: 2,
    type: "TEXT" as const,
    label: "Text Q",
    isRequired: false,
    sectionStableKey: "S1",
    ...overrides,
  };
}

function makeNumber(stableKey: string, overrides: Record<string, unknown> = {}) {
  return {
    stableKey,
    sortOrder: 3,
    type: "NUMBER" as const,
    label: "Number Q",
    isRequired: false,
    sectionStableKey: "S1",
    ...overrides,
  };
}

function makeMultiChoice(
  stableKey: string,
  overrides: Record<string, unknown> = {}
) {
  return {
    stableKey,
    sortOrder: 4,
    type: "MULTI_CHOICE" as const,
    label: "Multi Q",
    isRequired: false,
    sectionStableKey: "S1",
    options: [
      { key: "OPT_A", label: "Option A" },
      { key: "OPT_B", label: "Option B" },
      { key: "OPT_C", label: "Option C" },
    ],
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

// ─── Helper: cast to scoring input type ───────────────────────────────────

type ScoringVersion = Parameters<typeof scoreSubmission>[0];
type ScoringAnswers = Parameters<typeof scoreSubmission>[1];

// ─── 1. Required-presence — TEXT ─────────────────────────────────────────

describe("required TEXT — missing key throws MISSING_REQUIRED_KEY", () => {
  it("throws when a required TEXT question has no answer", () => {
    const version = makeVersion([
      makeSlider("Q_SLIDER"),
      makeText("Q_TEXT", { isRequired: true }),
    ]) as ScoringVersion;

    // Provide only the SLIDER answer; omit the required TEXT answer.
    const answers: ScoringAnswers = [{ stableKey: "Q_SLIDER", value: 5 }];

    expect(() => scoreSubmission(version, answers)).toThrow(ScoringValidationError);
    try {
      scoreSubmission(version, answers);
    } catch (e) {
      const err = e as ScoringValidationError;
      expect(err.code).toBe("MISSING_REQUIRED_KEY");
      expect(err.details.stableKeys).toContain("Q_TEXT");
    }
  });

  it("does NOT throw when a non-required TEXT question has no answer", () => {
    const version = makeVersion([
      makeSlider("Q_SLIDER"),
      makeText("Q_TEXT", { isRequired: false }),
    ]) as ScoringVersion;

    const answers: ScoringAnswers = [{ stableKey: "Q_SLIDER", value: 5 }];
    expect(() => scoreSubmission(version, answers)).not.toThrow();
  });
});

// ─── 2. Required-presence — NUMBER ───────────────────────────────────────

describe("required NUMBER — missing key throws MISSING_REQUIRED_KEY", () => {
  it("throws when a required NUMBER question has no answer", () => {
    const version = makeVersion([
      makeSlider("Q_SLIDER"),
      makeNumber("Q_NUM", { isRequired: true }),
    ]) as ScoringVersion;

    const answers: ScoringAnswers = [{ stableKey: "Q_SLIDER", value: 5 }];

    expect(() => scoreSubmission(version, answers)).toThrow(ScoringValidationError);
    try {
      scoreSubmission(version, answers);
    } catch (e) {
      const err = e as ScoringValidationError;
      expect(err.code).toBe("MISSING_REQUIRED_KEY");
      expect(err.details.stableKeys).toContain("Q_NUM");
    }
  });
});

// ─── 3. Required-presence — MULTI_CHOICE ─────────────────────────────────

describe("required MULTI_CHOICE — missing key throws MISSING_REQUIRED_KEY", () => {
  it("throws when a required MULTI_CHOICE question has no answer", () => {
    const version = makeVersion([
      makeSlider("Q_SLIDER"),
      makeMultiChoice("Q_MC", { isRequired: true }),
    ]) as ScoringVersion;

    const answers: ScoringAnswers = [{ stableKey: "Q_SLIDER", value: 5 }];

    expect(() => scoreSubmission(version, answers)).toThrow(ScoringValidationError);
    try {
      scoreSubmission(version, answers);
    } catch (e) {
      const err = e as ScoringValidationError;
      expect(err.code).toBe("MISSING_REQUIRED_KEY");
      expect(err.details.stableKeys).toContain("Q_MC");
    }
  });

  it("considers empty-array as absent for required MULTI_CHOICE", () => {
    const version = makeVersion([
      makeSlider("Q_SLIDER"),
      makeMultiChoice("Q_MC", { isRequired: true }),
    ]) as ScoringVersion;

    const answers: ScoringAnswers = [
      { stableKey: "Q_SLIDER", value: 5 },
      { stableKey: "Q_MC", value: [] }, // empty array = no selection
    ];

    expect(() => scoreSubmission(version, answers)).toThrow(ScoringValidationError);
    try {
      scoreSubmission(version, answers);
    } catch (e) {
      const err = e as ScoringValidationError;
      expect(err.code).toBe("MISSING_REQUIRED_KEY");
      expect(err.details.stableKeys).toContain("Q_MC");
    }
  });
});

// ─── 4. Required-presence — multiple qualitative types together ───────────

describe("required qualitative missing — reports all stableKeys in one error", () => {
  it("collects all missing required TEXT + NUMBER + MULTI_CHOICE keys", () => {
    const version = makeVersion([
      makeSlider("Q_SLIDER"),
      makeText("Q_T", { isRequired: true }),
      makeNumber("Q_N", { isRequired: true }),
      makeMultiChoice("Q_MC", { isRequired: true }),
    ]) as ScoringVersion;

    const answers: ScoringAnswers = [{ stableKey: "Q_SLIDER", value: 5 }];

    try {
      scoreSubmission(version, answers);
      fail("expected ScoringValidationError");
    } catch (e) {
      const err = e as ScoringValidationError;
      expect(err.code).toBe("MISSING_REQUIRED_KEY");
      const keys = err.details.stableKeys as string[];
      expect(keys).toContain("Q_T");
      expect(keys).toContain("Q_N");
      expect(keys).toContain("Q_MC");
    }
  });
});

// ─── 4b. Semantic-empty required TEXT (empty string treated as absent) ───

describe("required TEXT — empty string treated as absent", () => {
  it("throws MISSING_REQUIRED_KEY when a required TEXT answer is an empty string", () => {
    const version = makeVersion([
      makeSlider("Q_SLIDER"),
      makeText("Q_TEXT", { isRequired: true }),
    ]) as ScoringVersion;

    const answers: ScoringAnswers = [
      { stableKey: "Q_SLIDER", value: 5 },
      { stableKey: "Q_TEXT", value: "" }, // present-but-empty
    ];

    expect(() => scoreSubmission(version, answers)).toThrow(ScoringValidationError);
    try {
      scoreSubmission(version, answers);
    } catch (e) {
      const err = e as ScoringValidationError;
      expect(err.code).toBe("MISSING_REQUIRED_KEY");
      expect(err.details.stableKeys).toContain("Q_TEXT");
    }
  });

  it("does NOT throw when a non-required TEXT answer is an empty string", () => {
    const version = makeVersion([
      makeSlider("Q_SLIDER"),
      makeText("Q_TEXT", { isRequired: false }),
    ]) as ScoringVersion;

    const answers: ScoringAnswers = [
      { stableKey: "Q_SLIDER", value: 5 },
      { stableKey: "Q_TEXT", value: "" },
    ];
    expect(() => scoreSubmission(version, answers)).not.toThrow();
  });
});

// ─── 5. TEXT value-shape validation ──────────────────────────────────────

describe("TEXT value shape", () => {
  it("accepts a valid string answer", () => {
    const version = makeVersion([
      makeSlider("Q_SLIDER"),
      makeText("Q_T"),
    ]) as ScoringVersion;

    const answers: ScoringAnswers = [
      { stableKey: "Q_SLIDER", value: 5 },
      { stableKey: "Q_T", value: "My answer." },
    ];
    expect(() => scoreSubmission(version, answers)).not.toThrow();
  });

  it("rejects an object where a string is expected — INVALID_TYPE", () => {
    const version = makeVersion([
      makeSlider("Q_SLIDER"),
      makeText("Q_T"),
    ]) as ScoringVersion;

    const answers: ScoringAnswers = [
      { stableKey: "Q_SLIDER", value: 5 },
      { stableKey: "Q_T", value: { foo: "bar" } },
    ];

    try {
      scoreSubmission(version, answers);
      fail("expected ScoringValidationError");
    } catch (e) {
      const err = e as ScoringValidationError;
      expect(err.code).toBe("INVALID_TYPE");
      expect(err.details.stableKey).toBe("Q_T");
    }
  });

  it("rejects an array where a string is expected — INVALID_TYPE", () => {
    const version = makeVersion([
      makeSlider("Q_SLIDER"),
      makeText("Q_T"),
    ]) as ScoringVersion;

    const answers: ScoringAnswers = [
      { stableKey: "Q_SLIDER", value: 5 },
      { stableKey: "Q_T", value: ["a", "b"] },
    ];

    try {
      scoreSubmission(version, answers);
      fail("expected ScoringValidationError");
    } catch (e) {
      const err = e as ScoringValidationError;
      expect(err.code).toBe("INVALID_TYPE");
    }
  });

  it("rejects a text answer exceeding 10 000 chars — ANSWER_TOO_LONG", () => {
    const version = makeVersion([
      makeSlider("Q_SLIDER"),
      makeText("Q_T"),
    ]) as ScoringVersion;

    const answers: ScoringAnswers = [
      { stableKey: "Q_SLIDER", value: 5 },
      { stableKey: "Q_T", value: "x".repeat(10_001) },
    ];

    try {
      scoreSubmission(version, answers);
      fail("expected ScoringValidationError");
    } catch (e) {
      const err = e as ScoringValidationError;
      expect(err.code).toBe("ANSWER_TOO_LONG");
      expect(err.details.stableKey).toBe("Q_T");
    }
  });

  it("accepts a text answer of exactly 10 000 chars", () => {
    const version = makeVersion([
      makeSlider("Q_SLIDER"),
      makeText("Q_T"),
    ]) as ScoringVersion;

    const answers: ScoringAnswers = [
      { stableKey: "Q_SLIDER", value: 5 },
      { stableKey: "Q_T", value: "x".repeat(10_000) },
    ];
    expect(() => scoreSubmission(version, answers)).not.toThrow();
  });
});

// ─── 6. NUMBER value-shape validation ────────────────────────────────────

describe("NUMBER value shape", () => {
  it("accepts a valid finite integer", () => {
    const version = makeVersion([
      makeSlider("Q_SLIDER"),
      makeNumber("Q_N"),
    ]) as ScoringVersion;

    expect(() =>
      scoreSubmission(version, [
        { stableKey: "Q_SLIDER", value: 5 },
        { stableKey: "Q_N", value: 42 },
      ])
    ).not.toThrow();
  });

  it("accepts a valid finite float", () => {
    const version = makeVersion([
      makeSlider("Q_SLIDER"),
      makeNumber("Q_N"),
    ]) as ScoringVersion;

    expect(() =>
      scoreSubmission(version, [
        { stableKey: "Q_SLIDER", value: 5 },
        { stableKey: "Q_N", value: 3.14 },
      ])
    ).not.toThrow();
  });

  it("rejects NaN — INVALID_TYPE", () => {
    const version = makeVersion([
      makeSlider("Q_SLIDER"),
      makeNumber("Q_N"),
    ]) as ScoringVersion;

    try {
      scoreSubmission(version, [
        { stableKey: "Q_SLIDER", value: 5 },
        { stableKey: "Q_N", value: NaN },
      ]);
      fail("expected ScoringValidationError");
    } catch (e) {
      const err = e as ScoringValidationError;
      expect(err.code).toBe("INVALID_TYPE");
      expect(err.details.stableKey).toBe("Q_N");
    }
  });

  it("rejects Infinity — INVALID_TYPE", () => {
    const version = makeVersion([
      makeSlider("Q_SLIDER"),
      makeNumber("Q_N"),
    ]) as ScoringVersion;

    try {
      scoreSubmission(version, [
        { stableKey: "Q_SLIDER", value: 5 },
        { stableKey: "Q_N", value: Infinity },
      ]);
      fail("expected ScoringValidationError");
    } catch (e) {
      const err = e as ScoringValidationError;
      expect(err.code).toBe("INVALID_TYPE");
    }
  });

  it("rejects string value — INVALID_TYPE", () => {
    const version = makeVersion([
      makeSlider("Q_SLIDER"),
      makeNumber("Q_N"),
    ]) as ScoringVersion;

    try {
      scoreSubmission(version, [
        { stableKey: "Q_SLIDER", value: 5 },
        { stableKey: "Q_N", value: "42" },
      ]);
      fail("expected ScoringValidationError");
    } catch (e) {
      const err = e as ScoringValidationError;
      expect(err.code).toBe("INVALID_TYPE");
    }
  });
});

// ─── 7. MULTI_CHOICE value-shape validation ───────────────────────────────

describe("MULTI_CHOICE value shape", () => {
  it("accepts a valid array of known option keys", () => {
    const version = makeVersion([
      makeSlider("Q_SLIDER"),
      makeMultiChoice("Q_MC"),
    ]) as ScoringVersion;

    expect(() =>
      scoreSubmission(version, [
        { stableKey: "Q_SLIDER", value: 5 },
        { stableKey: "Q_MC", value: ["OPT_A", "OPT_B"] },
      ])
    ).not.toThrow();
  });

  it("accepts a single-element array", () => {
    const version = makeVersion([
      makeSlider("Q_SLIDER"),
      makeMultiChoice("Q_MC"),
    ]) as ScoringVersion;

    expect(() =>
      scoreSubmission(version, [
        { stableKey: "Q_SLIDER", value: 5 },
        { stableKey: "Q_MC", value: ["OPT_C"] },
      ])
    ).not.toThrow();
  });

  it("rejects a non-array value (object) — INVALID_TYPE", () => {
    const version = makeVersion([
      makeSlider("Q_SLIDER"),
      makeMultiChoice("Q_MC"),
    ]) as ScoringVersion;

    try {
      scoreSubmission(version, [
        { stableKey: "Q_SLIDER", value: 5 },
        { stableKey: "Q_MC", value: { key: "OPT_A" } },
      ]);
      fail("expected ScoringValidationError");
    } catch (e) {
      const err = e as ScoringValidationError;
      expect(err.code).toBe("INVALID_TYPE");
      expect(err.details.stableKey).toBe("Q_MC");
    }
  });

  it("rejects a string (not array) — INVALID_TYPE", () => {
    const version = makeVersion([
      makeSlider("Q_SLIDER"),
      makeMultiChoice("Q_MC"),
    ]) as ScoringVersion;

    try {
      scoreSubmission(version, [
        { stableKey: "Q_SLIDER", value: 5 },
        { stableKey: "Q_MC", value: "OPT_A" },
      ]);
      fail("expected ScoringValidationError");
    } catch (e) {
      const err = e as ScoringValidationError;
      expect(err.code).toBe("INVALID_TYPE");
    }
  });

  it("rejects an array with an unknown option key — INVALID_OPTION_KEY", () => {
    const version = makeVersion([
      makeSlider("Q_SLIDER"),
      makeMultiChoice("Q_MC"),
    ]) as ScoringVersion;

    try {
      scoreSubmission(version, [
        { stableKey: "Q_SLIDER", value: 5 },
        { stableKey: "Q_MC", value: ["OPT_A", "OPT_UNKNOWN"] },
      ]);
      fail("expected ScoringValidationError");
    } catch (e) {
      const err = e as ScoringValidationError;
      expect(err.code).toBe("INVALID_OPTION_KEY");
      expect(err.details.stableKey).toBe("Q_MC");
      expect(err.details.invalidKeys).toContain("OPT_UNKNOWN");
    }
  });

  it("rejects duplicate option keys in a MULTI_CHOICE answer — DUPLICATE_OPTION_KEY", () => {
    const version = makeVersion([
      makeSlider("Q_SLIDER"),
      makeMultiChoice("Q_MC"),
    ]) as ScoringVersion;

    try {
      scoreSubmission(version, [
        { stableKey: "Q_SLIDER", value: 5 },
        { stableKey: "Q_MC", value: ["OPT_A", "OPT_A"] },
      ]);
      fail("expected ScoringValidationError");
    } catch (e) {
      const err = e as ScoringValidationError;
      expect(err.code).toBe("DUPLICATE_OPTION_KEY");
      expect(err.details.stableKey).toBe("Q_MC");
    }
  });

  it("rejects selection count exceeding maxChoices — TOO_MANY_CHOICES", () => {
    const version = makeVersion([
      makeSlider("Q_SLIDER"),
      makeMultiChoice("Q_MC", { maxChoices: 1 }),
    ]) as ScoringVersion;

    try {
      scoreSubmission(version, [
        { stableKey: "Q_SLIDER", value: 5 },
        { stableKey: "Q_MC", value: ["OPT_A", "OPT_B"] }, // 2 > maxChoices 1
      ]);
      fail("expected ScoringValidationError");
    } catch (e) {
      const err = e as ScoringValidationError;
      expect(err.code).toBe("TOO_MANY_CHOICES");
      expect(err.details.stableKey).toBe("Q_MC");
      expect(err.details.maxChoices).toBe(1);
      expect(err.details.got).toBe(2);
    }
  });

  it("accepts selection count equal to maxChoices", () => {
    const version = makeVersion([
      makeSlider("Q_SLIDER"),
      makeMultiChoice("Q_MC", { maxChoices: 2 }),
    ]) as ScoringVersion;

    expect(() =>
      scoreSubmission(version, [
        { stableKey: "Q_SLIDER", value: 5 },
        { stableKey: "Q_MC", value: ["OPT_A", "OPT_B"] },
      ])
    ).not.toThrow();
  });
});

// ─── 8. SLIDER_LIKERT — existing validation still works ──────────────────

describe("SLIDER_LIKERT — existing validation regression", () => {
  it("accepts a valid integer within scale range", () => {
    const version = makeVersion([makeSlider("Q_S")]) as ScoringVersion;
    expect(() =>
      scoreSubmission(version, [{ stableKey: "Q_S", value: 4 }])
    ).not.toThrow();
  });

  it("rejects a value out of range — OUT_OF_RANGE", () => {
    const version = makeVersion([makeSlider("Q_S")]) as ScoringVersion;
    try {
      scoreSubmission(version, [{ stableKey: "Q_S", value: 99 }]);
      fail("expected ScoringValidationError");
    } catch (e) {
      const err = e as ScoringValidationError;
      expect(err.code).toBe("OUT_OF_RANGE");
    }
  });

  it("rejects a non-integer value — NON_INTEGER", () => {
    const version = makeVersion([makeSlider("Q_S")]) as ScoringVersion;
    try {
      scoreSubmission(version, [{ stableKey: "Q_S", value: 3.5 }]);
      fail("expected ScoringValidationError");
    } catch (e) {
      const err = e as ScoringValidationError;
      expect(err.code).toBe("NON_INTEGER");
    }
  });

  it("rejects a string value — INVALID_TYPE", () => {
    const version = makeVersion([makeSlider("Q_S")]) as ScoringVersion;
    try {
      scoreSubmission(version, [{ stableKey: "Q_S", value: "4" }]);
      fail("expected ScoringValidationError");
    } catch (e) {
      const err = e as ScoringValidationError;
      expect(err.code).toBe("INVALID_TYPE");
    }
  });
});

// ─── 9. Valid mixed-type submission succeeds ──────────────────────────────

describe("valid mixed-type submission — regression green path", () => {
  it("succeeds with SLIDER + TEXT + NUMBER + MULTI_CHOICE answers", () => {
    const version = makeVersion([
      makeSlider("Q_SLIDER", { isRequired: true }),
      makeText("Q_T", { isRequired: true }),
      makeNumber("Q_N", { isRequired: true }),
      makeMultiChoice("Q_MC", { isRequired: true }),
    ]) as ScoringVersion;

    const answers: ScoringAnswers = [
      { stableKey: "Q_SLIDER", value: 5 },
      { stableKey: "Q_T", value: "Some text answer" },
      { stableKey: "Q_N", value: 100 },
      { stableKey: "Q_MC", value: ["OPT_A"] },
    ];

    let result: ReturnType<typeof scoreSubmission> | undefined;
    expect(() => {
      result = scoreSubmission(version, answers);
    }).not.toThrow();
    // Only the SLIDER answer participates in scoring output
    expect(result!.perQuestion).toHaveLength(1);
    expect(result!.perQuestion[0].stableKey).toBe("Q_SLIDER");
  });
});

// ─── 10. validateAnswerValues — standalone validator export ──────────────

describe("validateAnswerValues — exported shared validator", () => {
  it("is a function", () => {
    expect(typeof validateAnswerValues).toBe("function");
  });

  it("returns null for a valid TEXT answer", () => {
    const q = makeText("Q_T") as Parameters<typeof validateAnswerValues>[0];
    const err = validateAnswerValues(q, "hello");
    expect(err).toBeNull();
  });

  it("returns INVALID_TYPE error for a number where TEXT is expected", () => {
    const q = makeText("Q_T") as Parameters<typeof validateAnswerValues>[0];
    const err = validateAnswerValues(q, 42);
    expect(err).not.toBeNull();
    expect(err!.code).toBe("INVALID_TYPE");
  });

  it("returns ANSWER_TOO_LONG for oversized TEXT", () => {
    const q = makeText("Q_T") as Parameters<typeof validateAnswerValues>[0];
    const err = validateAnswerValues(q, "x".repeat(10_001));
    expect(err).not.toBeNull();
    expect(err!.code).toBe("ANSWER_TOO_LONG");
  });

  it("returns INVALID_TYPE for NaN on a NUMBER question", () => {
    const q = makeNumber("Q_N") as Parameters<typeof validateAnswerValues>[0];
    const err = validateAnswerValues(q, NaN);
    expect(err!.code).toBe("INVALID_TYPE");
  });

  it("returns null for a valid NUMBER value", () => {
    const q = makeNumber("Q_N") as Parameters<typeof validateAnswerValues>[0];
    const err = validateAnswerValues(q, 3.14);
    expect(err).toBeNull();
  });

  it("returns INVALID_OPTION_KEY for unknown MULTI_CHOICE option", () => {
    const q = makeMultiChoice("Q_MC") as Parameters<typeof validateAnswerValues>[0];
    const err = validateAnswerValues(q, ["OPT_A", "BOGUS"]);
    expect(err!.code).toBe("INVALID_OPTION_KEY");
  });

  it("returns TOO_MANY_CHOICES when maxChoices exceeded", () => {
    const q = makeMultiChoice("Q_MC", { maxChoices: 1 }) as Parameters<
      typeof validateAnswerValues
    >[0];
    const err = validateAnswerValues(q, ["OPT_A", "OPT_B"]);
    expect(err!.code).toBe("TOO_MANY_CHOICES");
  });
});
