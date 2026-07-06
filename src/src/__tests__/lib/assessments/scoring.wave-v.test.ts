/**
 * Wave V (V-1) — global tier-domain publish gate.
 *
 * Walk-found gap (Wave U launch): TemplateVersionForPublishSchema ran only
 * the per-domain tier check; the GLOBAL scoringConfig.tiers-tile-the-metric-
 * domain check lived only in scoreSubmission step 2. A version whose global
 * tiers don't tile its metric domain PUBLISHED fine, then threw
 * INVALID_SCORING_CONFIG (HTTP 400) on every submit.
 *
 * Contract under test: publish now rejects exactly what step 2 rejects
 * (shared computeGlobalTierDomain helper — SLIDER_LIKERT-only filter,
 * rollup vs legacy branches), so publish-pass ⇒ scoreSubmission-step-2-pass.
 */
import {
  TemplateVersionForPublishSchema,
  scoreSubmission,
  ScoringValidationError,
  type Answer,
} from "@/lib/assessments/scoring";

// ── Fixtures ─────────────────────────────────────────────────────────────

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

/** 2 sliders (0-3), countAchieved → integer domain [0, 2]. */
const legacyBase = () => ({
  sections: [section("S1", "One")],
  questions: [slider("Q1"), slider("Q2", { sortOrder: 2 } as never), text("T1")].map(
    (q, i) => ({ ...q, sortOrder: i + 1 }),
  ),
  scoringConfig: {
    tierMetric: "countAchieved" as const,
    passThreshold: 2,
    tiers: [tier(0, 1, "Low"), tier(2, 2, "High")],
  },
});

/** 2 sliders sharing a 0-10 scale, rollup → fractional domain [0, 10]. */
const rollupBase = () => ({
  sections: [section("S1", "One")],
  questions: [
    { ...slider("Q1", { min: 0, max: 10 }), sortOrder: 1 },
    { ...slider("Q2", { min: 0, max: 10 }), sortOrder: 2 },
  ],
  scoringConfig: {
    tierMetric: "overallAvg" as const,
    passThreshold: 5,
    rollup: { overall: "meanOfQuestions" as const },
    tiers: [tier(0, 5, "Low"), tier(5, 10, "High")],
  },
});

const globalTierIssues = (res: ReturnType<typeof TemplateVersionForPublishSchema.safeParse>) =>
  res.success
    ? []
    : res.error.issues.filter((i) => i.path[0] === "scoringConfig" && i.path[1] === "tiers");

// ── Publish rejects non-tiling global tiers ──────────────────────────────

describe("checkGlobalTierTiling — publish rejects what step 2 rejects", () => {
  it("rejects the walk scenario: last tier ends below the domain max (legacy countAchieved)", () => {
    const v = legacyBase();
    // domain [0,2]; tiers stop at 1 → previously published fine, 400'd on submit
    v.scoringConfig.tiers = [tier(0, 1, "Only")];
    const res = TemplateVersionForPublishSchema.safeParse(v);
    expect(res.success).toBe(false);
    expect(globalTierIssues(res).length).toBeGreaterThan(0);
    expect(globalTierIssues(res)[0].message).toMatch(/max/i);
  });

  it("rejects a gap between tiers (legacy overallTotal)", () => {
    const v = legacyBase();
    v.scoringConfig.tierMetric = "overallTotal" as never;
    // domain [0,6] integer; gap: 0-2 then 4-6 (3 uncovered)
    v.scoringConfig.tiers = [tier(0, 2, "Low"), tier(4, 6, "High")];
    const res = TemplateVersionForPublishSchema.safeParse(v);
    expect(res.success).toBe(false);
    expect(globalTierIssues(res).some((i) => /gap/i.test(i.message))).toBe(true);
  });

  it("rejects overlapping tiers (rollup branch, fractional semantics)", () => {
    const v = rollupBase();
    // fractional domain [0,10]; 0-6 and 5-10 overlap
    v.scoringConfig.tiers = [tier(0, 6, "Low"), tier(5, 10, "High")];
    const res = TemplateVersionForPublishSchema.safeParse(v);
    expect(res.success).toBe(false);
    expect(globalTierIssues(res).some((i) => /overlap/i.test(i.message))).toBe(true);
  });

  it("rejects a first tier that starts above the domain min (rollup branch)", () => {
    const v = rollupBase();
    v.scoringConfig.tiers = [tier(2, 10, "High")];
    const res = TemplateVersionForPublishSchema.safeParse(v);
    expect(res.success).toBe(false);
    expect(globalTierIssues(res).some((i) => /domain min/i.test(i.message))).toBe(true);
  });

  it("routes issues under scoringConfig.tiers with the offending tier index", () => {
    const v = legacyBase();
    v.scoringConfig.tiers = [tier(0, 1, "Only")];
    const res = TemplateVersionForPublishSchema.safeParse(v);
    expect(res.success).toBe(false);
    const issue = globalTierIssues(res)[0];
    // path: ["scoringConfig", "tiers", <tierIdx>, <field>]
    expect(issue.path.length).toBeGreaterThanOrEqual(3);
    expect(typeof issue.path[2]).toBe("number");
  });
});

// ── Ambiguous-domain configs become publish issues, not exceptions ───────

describe("checkGlobalTierTiling — ambiguous domains reject at publish, never throw", () => {
  it("rejects overallAvg with mixed question scales (previously publishable, 400'd on submit)", () => {
    const v = legacyBase();
    v.scoringConfig.tierMetric = "overallAvg" as never;
    v.questions = [
      { ...slider("Q1", { min: 0, max: 3 }), sortOrder: 1 },
      { ...slider("Q2", { min: 0, max: 10 }), sortOrder: 2 },
    ];
    v.scoringConfig.tiers = [tier(0, 10, "All")];
    let res: ReturnType<typeof TemplateVersionForPublishSchema.safeParse>;
    expect(() => {
      res = TemplateVersionForPublishSchema.safeParse(v);
    }).not.toThrow();
    expect(res!.success).toBe(false);
    expect(globalTierIssues(res!).some((i) => /mixed|different scales/i.test(i.message))).toBe(
      true,
    );
  });

  it("rejects rollup with zero slider questions (TEXT-only template opting into rollup)", () => {
    const v = rollupBase();
    v.questions = [text("T1")] as never;
    let res: ReturnType<typeof TemplateVersionForPublishSchema.safeParse>;
    expect(() => {
      res = TemplateVersionForPublishSchema.safeParse(v);
    }).not.toThrow();
    expect(res!.success).toBe(false);
    expect(globalTierIssues(res!).some((i) => /zero questions|at least one/i.test(i.message))).toBe(
      true,
    );
  });
});

// ── Correct configs still publish (parity guards) ────────────────────────

describe("checkGlobalTierTiling — tiling configs still publish", () => {
  it("accepts exact integer tiling (legacy countAchieved, +1 adjacency)", () => {
    const res = TemplateVersionForPublishSchema.safeParse(legacyBase());
    expect(res.success).toBe(true);
  });

  it("accepts exact fractional tiling incl. an open-ended top tier (rollup)", () => {
    const v = rollupBase();
    v.scoringConfig.tiers = [tier(0, 5, "Low"), tier(5, undefined, "High")];
    const res = TemplateVersionForPublishSchema.safeParse(v);
    expect(res.success).toBe(true);
  });

  it("ignores non-slider questions when computing the domain (parity with step 2)", () => {
    // countAchieved domain = [0, #sliders] = [0,2] even with a TEXT question present
    const res = TemplateVersionForPublishSchema.safeParse(legacyBase());
    expect(res.success).toBe(true);
  });

  it("accepts a qualitative-shape config: single neutral tier spanning the whole domain", () => {
    const v = legacyBase();
    // LVA/QSP pattern: one tier covering everything (neutral tier, ADR-0002)
    v.scoringConfig.tiers = [tier(0, 2, "Neutral")];
    const res = TemplateVersionForPublishSchema.safeParse(v);
    expect(res.success).toBe(true);
  });

  it("leaves the per-domain tier check intact (bad domain tiers still rejected)", () => {
    const v = rollupBase();
    (v.scoringConfig as Record<string, unknown>).domains = [
      {
        key: "D1",
        label: "Domain One",
        tiers: [tier(0, 4, "Partial")], // domain [0,10] → gap at top
      },
    ];
    v.sections = [{ ...section("S1", "One"), domain: "D1" } as never];
    const res = TemplateVersionForPublishSchema.safeParse(v);
    expect(res.success).toBe(false);
  });
});

// ── Divergence-proofing: publish-pass ⇒ step-2-pass ──────────────────────

describe("publish/runtime parity", () => {
  const answersFor = (v: { questions: Array<{ stableKey: string; type: string }> }): Answer[] =>
    v.questions
      .filter((q) => q.type === "SLIDER_LIKERT")
      .map((q) => ({ stableKey: q.stableKey, value: 1 }));

  it("every fixture that passes publish also scores without INVALID_SCORING_CONFIG", () => {
    const fixtures = [legacyBase(), rollupBase()];
    for (const v of fixtures) {
      const publish = TemplateVersionForPublishSchema.safeParse(v);
      expect(publish.success).toBe(true);
      expect(() => scoreSubmission(v as never, answersFor(v))).not.toThrow(
        ScoringValidationError,
      );
    }
  });

  it("the walk fixture fails BOTH publish and step 2", () => {
    const v = legacyBase();
    v.scoringConfig.tiers = [tier(0, 1, "Only")];
    expect(TemplateVersionForPublishSchema.safeParse(v).success).toBe(false);
    expect(() => scoreSubmission(v as never, answersFor(v))).toThrow(ScoringValidationError);
  });
});
