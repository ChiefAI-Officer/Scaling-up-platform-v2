/**
 * Wave ED2 (spec 19ad C1) — getPublishValidationIssues is the ONE publish-
 * validation entry point shared by the publish route AND the editor's live
 * Safe-to-Publish badge. Fixtures reuse the shape from
 * scoring.wave-v.test.ts (global tier-domain tiling): a slider version whose
 * tiers DO tile the metric domain (publishable) vs one whose tiers do NOT
 * (rejected — the walk-found gap from Wave V).
 */
import { getPublishValidationIssues } from "@/lib/assessments/scoring";

// ── Fixtures (shape copied from scoring.wave-v.test.ts) ──────────────────

const section = (stableKey: string, name: string, sortOrder = 1) => ({
  stableKey,
  sortOrder,
  name,
});

const slider = (
  stableKey: string,
  opts: { min?: number; max?: number; step?: number; section?: string } = {},
) => ({
  stableKey,
  sortOrder: 1,
  type: "SLIDER_LIKERT" as const,
  label: stableKey,
  sectionStableKey: opts.section ?? "S1",
  isRequired: true,
  scale: {
    min: opts.min ?? 0,
    max: opts.max ?? 3,
    step: opts.step ?? 1,
    anchorMin: "low",
    anchorMax: "high",
  },
});

const text = (stableKey: string) => ({
  stableKey,
  sortOrder: 2,
  type: "TEXT" as const,
  label: stableKey,
  sectionStableKey: "S1",
  isRequired: false,
});

const tier = (minMetric: number, maxMetric: number | undefined, label: string) => ({
  minMetric,
  ...(maxMetric === undefined ? {} : { maxMetric }),
  label,
  message: `${label} message`,
});

/** 2 sliders (0-3), countAchieved → integer domain [0, 2]. Tiers tile it fully. */
const validGlobalTierVersion = () => ({
  sections: [section("S1", "One")],
  questions: [slider("Q1"), slider("Q2", { section: "S1" }), text("T1")].map((q, i) => ({
    ...q,
    sortOrder: i + 1,
  })),
  scoringConfig: {
    tierMetric: "countAchieved" as const,
    passThreshold: 2,
    tiers: [tier(0, 1, "Low"), tier(2, 2, "High")],
  },
});

/**
 * Same shape, but the tiers stop at 1 instead of tiling the full [0,2]
 * domain — the Wave V walk-found gap: this used to publish fine, then
 * threw INVALID_SCORING_CONFIG on every submit.
 */
const nonTilingGlobalTierVersion = () => {
  const v = validGlobalTierVersion();
  v.scoringConfig.tiers = [tier(0, 1, "Only")];
  return v;
};

describe("getPublishValidationIssues", () => {
  it("returns [] for a publishable version", () => {
    expect(getPublishValidationIssues(validGlobalTierVersion())).toEqual([]);
  });

  it("returns issues rooted at scoringConfig.tiers for non-tiling global tiers", () => {
    const issues = getPublishValidationIssues(nonTilingGlobalTierVersion());
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.some((i) => i.path.join(".").startsWith("scoringConfig.tiers"))).toBe(true);
  });

  it("never throws, even on a degenerate/empty input", () => {
    expect(() =>
      getPublishValidationIssues({ questions: [], sections: [], scoringConfig: {} }),
    ).not.toThrow();
    const issues = getPublishValidationIssues({
      questions: [],
      sections: [],
      scoringConfig: {},
    });
    expect(Array.isArray(issues)).toBe(true);
  });
});
