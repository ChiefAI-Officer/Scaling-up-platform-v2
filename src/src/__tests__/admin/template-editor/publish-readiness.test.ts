/**
 * Wave ED2 (spec 19ad) — publish-readiness.ts unit tests.
 *
 * Fixture shape copied from scoring.wave-v.test.ts / publish-validation-issues.test.ts
 * (global tier-domain tiling fixtures) so the C1/C4 integration tests exercise the
 * SAME publish-only failure the badge must mirror.
 */
import {
  evaluatePublishReadiness,
  computeWarnings,
} from "@/components/admin/template-editor/publish-readiness";

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

const text = (stableKey: string, sectionKey = "S1") => ({
  stableKey,
  sortOrder: 2,
  type: "TEXT" as const,
  label: stableKey,
  sectionStableKey: sectionKey,
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

/** Appends a section referenced by no question — the "empty section" warning trigger. */
const withStrayEmptySection = <T extends { sections: unknown[] }>(v: T): T => ({
  ...v,
  sections: [...v.sections, section("sX", "Extra", 2)],
});

// ── computeWarnings ───────────────────────────────────────────────────────

describe("computeWarnings", () => {
  it("flags an empty section — a section referenced by zero questions", () => {
    const built = {
      sections: [section("s1", "Section One"), { stableKey: "s2", name: "Section Two" }],
      questions: [text("q1", "s1")],
      scoringConfig: {},
    };
    const warnings = computeWarnings(built);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].path).toEqual(["sections", 1]);
  });

  it("flags an unassigned question — blank sectionStableKey (the Other bucket)", () => {
    const built = {
      sections: [section("s1", "Section One")],
      questions: [{ ...text("q1", "s1"), sectionStableKey: "" }],
      scoringConfig: {},
    };
    const warnings = computeWarnings(built);
    expect(warnings.some((w) => w.path.join(".") === "questions.0.sectionStableKey")).toBe(true);
  });

  it("returns [] when fully-assigned with no empty sections", () => {
    const built = {
      sections: [section("s1", "Section One")],
      questions: [text("q1", "s1")],
      scoringConfig: {},
    };
    expect(computeWarnings(built)).toEqual([]);
  });

  it("is defensive against malformed shapes — never throws, returns []", () => {
    expect(() =>
      computeWarnings({ questions: null, sections: 42, scoringConfig: {} } as never),
    ).not.toThrow();
    expect(
      computeWarnings({ questions: null, sections: 42, scoringConfig: {} } as never),
    ).toEqual([]);
  });
});

// ── evaluatePublishReadiness ──────────────────────────────────────────────

describe("evaluatePublishReadiness", () => {
  it("C4: warnings are computed independently of Prevent — a publish-only failure " +
    "(non-tiling global tiers) PLUS a stray empty section yields BOTH prevent and warn", () => {
    const built = withStrayEmptySection(nonTilingGlobalTierVersion());
    const result = evaluatePublishReadiness(built);
    expect(result.prevent.length).toBeGreaterThan(0);
    expect(result.warn.length).toBeGreaterThan(0);
  });

  it("publish-legal: a valid version with a stray empty section has prevent=[] and warn.length===1", () => {
    const built = withStrayEmptySection(validGlobalTierVersion());
    const result = evaluatePublishReadiness(built);
    expect(result.prevent).toEqual([]);
    expect(result.warn).toHaveLength(1);
    expect(result.warn[0].path).toEqual(["sections", 1]);
  });
});
