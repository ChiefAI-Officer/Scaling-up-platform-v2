/**
 * Wave ED2 (spec 19ad, Task 6) — Safe-to-Publish parity / anti-drift lock.
 *
 * The live badge's Prevent list is built by evaluatePublishReadiness(), which
 * maps getPublishValidationIssues() — the SAME helper the publish route runs
 * server-side (scoring.ts). This test proves the badge and the route can
 * never drift: they are the same function call, not two implementations
 * that happen to agree today.
 *
 * Fixture shape copied from scoring.wave-v.test.ts / publish-validation-issues.test.ts
 * / publish-readiness.test.ts (global tier-domain tiling fixtures + the
 * `section()` stray-empty-section helper) so this exercises the SAME
 * publish-only failure (the Wave V walk-found non-tiling global tier gap)
 * those suites already cover individually.
 *
 * Note: the C2 dirty/persisted divergence (Ready-to-publish vs
 * Ready-after-save copy) is covered separately in
 * safe-to-publish-badge.test.tsx via the `isDirty` prop — not repeated here.
 */
import { getPublishValidationIssues } from "@/lib/assessments/scoring";
import { evaluatePublishReadiness } from "@/components/admin/template-editor/publish-readiness";

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
 * threw INVALID_SCORING_CONFIG on every submit. Genuinely fails
 * TemplateVersionForPublishSchema (scoring.ts checkGlobalTierTiling).
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

describe("Safe-to-Publish parity (badge Prevent === publish-route validation)", () => {
  it("clean parity: a publishable version has prevent=[] AND getPublishValidationIssues=[]", () => {
    const built = validGlobalTierVersion();
    expect(evaluatePublishReadiness(built).prevent).toEqual([]);
    expect(getPublishValidationIssues(built)).toEqual([]);
  });

  it(
    "failure parity: the badge's Prevent list carries EXACTLY the same issue paths " +
      "the publish route would 422 with (non-tiling global tiers)",
    () => {
      const built = nonTilingGlobalTierVersion();

      const badgePaths = evaluatePublishReadiness(built)
        .prevent.map((i) => i.path.join("."));
      const routePaths = getPublishValidationIssues(built).map((i) => i.path.join("."));

      expect(badgePaths.length).toBeGreaterThan(0);
      expect(badgePaths).toEqual(routePaths);
    },
  );

  it(
    "C4: warnings are independent of prevent — a publish-only failure (non-tiling " +
      "global tiers) PLUS a stray empty section yields BOTH prevent.length>0 and warn.length>0",
    () => {
      const built = withStrayEmptySection(nonTilingGlobalTierVersion());
      const result = evaluatePublishReadiness(built);
      expect(result.prevent.length).toBeGreaterThan(0);
      expect(result.warn.length).toBeGreaterThan(0);
    },
  );
});
