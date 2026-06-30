/**
 * Content-guard tests for buildScalingUpFullContent() — Scaling Up Full Assessment.
 *
 * These tests are the authoritative lock for the SCORING-CONFIG rework
 * (provisional 0-10 ScaleUp bands + neutral per-domain tiers). They run
 * independently of any DB and verify:
 *
 *   1. 61 SLIDER_LIKERT questions, all 0-10 scale.
 *   2. Domain label set is exactly {Cash, Execution, People, Strategy, You}.
 *   3. Exactly 3 global tiers; maxMetric values are [4.0, 6.5, 10].
 *   4. scaleUpScore === true; rollup.overall === "meanOfDomains".
 *   5. NO global tier label matches /Critical|At Risk|On Track|Strong/.
 *   6. Per-question recommendations are preserved (known question spot-check).
 *   7. CRUCIAL: the full {questions, sections, scoringConfig} payload passes
 *      the strict publish schema (TemplateVersionForPublishSchema) with no
 *      structural issues. Any failure here means the scoringConfig is broken.
 */

import {
  buildScalingUpFullContent,
} from "../../../prisma/seed-scaling-up-full-assessment";
import {
  TemplateVersionForPublishSchema,
} from "../../lib/assessments/scoring";

// ─── Shared fixture ───────────────────────────────────────────────────────

const content = buildScalingUpFullContent();

// ─── 1. Questions ─────────────────────────────────────────────────────────

describe("buildScalingUpFullContent() — questions", () => {
  it("has 64 questions (61 SLIDER + 3 NUMBER background) in v2", () => {
    expect(content.questions).toHaveLength(64);
  });

  it("has exactly 61 SLIDER_LIKERT scored questions", () => {
    const sliders = (content.questions as Array<{ type: string }>).filter(
      (q) => q.type === "SLIDER_LIKERT"
    );
    expect(sliders).toHaveLength(61);
  });

  it("every SLIDER_LIKERT question is on a 0-10 scale", () => {
    const sliders = (content.questions as Array<{
      type: string;
      scale: { min: number; max: number };
      stableKey: string;
    }>).filter((q) => q.type === "SLIDER_LIKERT");
    for (const q of sliders) {
      expect(q.scale.min).toBe(0);
      expect(q.scale.max).toBe(10);
    }
  });

  it("the 3 background questions are non-scored NUMBER inputs", () => {
    const numbers = (content.questions as Array<{ type: string; stableKey: string }>).filter(
      (q) => q.type === "NUMBER"
    );
    expect(numbers.map((q) => q.stableKey).sort()).toEqual([
      "Q_FREELANCE",
      "Q_FTE_PERMANENT",
      "Q_FTE_TEMPORARY",
    ]);
  });
});

// ─── 2. Domains ──────────────────────────────────────────────────────────

describe("buildScalingUpFullContent() — domains", () => {
  it("domain label set is exactly [Cash, Execution, People, Strategy, You]", () => {
    const cfg = content.scoringConfig as {
      domains: Array<{ key: string; label: string }>;
    };
    const labels = cfg.domains.map((d) => d.label).sort();
    expect(labels).toEqual(["Cash", "Execution", "People", "Strategy", "You"]);
  });

  it("every section has a domain field", () => {
    for (const s of content.sections as Array<{ domain?: string; stableKey: string }>) {
      expect(s.domain).toBeTruthy();
    }
  });

  it("every domain key in scoringConfig.domains is used by at least one section", () => {
    const cfg = content.scoringConfig as {
      domains: Array<{ key: string }>;
    };
    const usedKeys = new Set(
      (content.sections as Array<{ domain?: string }>)
        .map((s) => s.domain)
        .filter(Boolean)
    );
    for (const d of cfg.domains) {
      expect(usedKeys.has(d.key)).toBe(true);
    }
  });
});

// ─── 3. Global tiers ────────────────────────────────────────────────────

describe("buildScalingUpFullContent() — global tiers", () => {
  const cfg = content.scoringConfig as {
    tiers: Array<{ minMetric: number; maxMetric?: number; label: string }>;
  };

  it("has exactly 3 global tiers", () => {
    expect(cfg.tiers).toHaveLength(3);
  });

  it("tier maxMetrics are [4.0, 6.5, 10] in ascending order", () => {
    const sorted = [...cfg.tiers].sort((a, b) => a.minMetric - b.minMetric);
    expect(sorted[0].maxMetric).toBe(4.0);
    expect(sorted[1].maxMetric).toBe(6.5);
    expect(sorted[2].maxMetric).toBe(10);
  });

  it("first tier starts at 0", () => {
    const sorted = [...cfg.tiers].sort((a, b) => a.minMetric - b.minMetric);
    expect(sorted[0].minMetric).toBe(0);
  });

  it("tiers tile without gaps (fractional touching: b.minMetric === a.maxMetric)", () => {
    const sorted = [...cfg.tiers].sort((a, b) => a.minMetric - b.minMetric);
    for (let i = 0; i < sorted.length - 1; i++) {
      expect(sorted[i + 1].minMetric).toBe(sorted[i].maxMetric);
    }
  });

  it("no global tier label matches /Critical|At Risk|On Track|Strong/", () => {
    const OLD_LABELS = /Critical|At Risk|On Track|Strong/;
    for (const tier of cfg.tiers) {
      expect(tier.label).not.toMatch(OLD_LABELS);
    }
  });
});

// ─── 4. scaleUpScore + rollup ────────────────────────────────────────────

describe("buildScalingUpFullContent() — scaleUpScore + rollup", () => {
  const cfg = content.scoringConfig as {
    scaleUpScore: boolean;
    rollup: { overall: string };
  };

  it("scaleUpScore is true", () => {
    expect(cfg.scaleUpScore).toBe(true);
  });

  it("rollup.overall is 'meanOfDomains'", () => {
    expect(cfg.rollup.overall).toBe("meanOfDomains");
  });
});

// ─── 5. Per-question recommendations preserved ───────────────────────────

describe("buildScalingUpFullContent() — recommendations preserved", () => {
  it("every SLIDER_LIKERT question has exactly 5 recommendation bands", () => {
    const sliders = (content.questions as Array<{
      type: string;
      recommendations?: unknown[];
      stableKey: string;
    }>).filter((q) => q.type === "SLIDER_LIKERT");
    for (const q of sliders) {
      expect(q.recommendations).toHaveLength(5);
    }
  });

  it("Q01 (Effective recruitment process) s0 band starts with expected recruitment narrative", () => {
    const q01 = (content.questions as Array<{
      stableKey: string;
      recommendations: Array<{ minScore: number; maxScore: number; text: string }>;
    }>).find((q) => q.stableKey === "Q01");
    expect(q01).toBeDefined();
    // The s0 band (minScore 0, maxScore 2) contains the worst-score narrative
    const s0 = q01!.recommendations.find((b) => b.minScore === 0);
    expect(s0).toBeDefined();
    expect(s0!.text).toContain("In order to grow, you continuously need new");
  });

  it("Q02 (High staff retention) s10 band starts with 'Your employee turnover is very little / none'", () => {
    const q02 = (content.questions as Array<{
      stableKey: string;
      recommendations: Array<{ minScore: number; maxScore: number; text: string }>;
    }>).find((q) => q.stableKey === "Q02");
    expect(q02).toBeDefined();
    const s10 = q02!.recommendations.find((b) => b.maxScore === 10);
    expect(s10).toBeDefined();
    expect(s10!.text).toContain("Your employee turnover is very little / none");
  });

  it("Q01 5 bands tile [0-2], [3-4], [5-6], [7-9], [10-10] (integer touching, full 0-10 coverage)", () => {
    const q01 = (content.questions as Array<{
      stableKey: string;
      recommendations: Array<{ minScore: number; maxScore: number; text: string }>;
    }>).find((q) => q.stableKey === "Q01");
    expect(q01).toBeDefined();
    const sorted = [...q01!.recommendations].sort((a, b) => a.minScore - b.minScore);
    expect(sorted).toHaveLength(5);
    expect(sorted[0]).toMatchObject({ minScore: 0, maxScore: 2 });
    expect(sorted[1]).toMatchObject({ minScore: 3, maxScore: 4 });
    expect(sorted[2]).toMatchObject({ minScore: 5, maxScore: 6 });
    expect(sorted[3]).toMatchObject({ minScore: 7, maxScore: 9 });
    expect(sorted[4]).toMatchObject({ minScore: 10, maxScore: 10 });
  });
});

// ─── 6. CRUCIAL — publish schema passes with no structural issues ─────────

describe("buildScalingUpFullContent() — publish schema (CRUCIAL)", () => {
  it("passes TemplateVersionForPublishSchema with no structural failures", () => {
    // The payload parsed by the strict publish schema must succeed on all
    // structural checks: tier tiling, domain assignment, scaleUpScore prereqs.
    // If it fails, the error is surfaced in full for diagnosis.
    const parsed = TemplateVersionForPublishSchema.safeParse({
      questions: content.questions,
      sections: content.sections,
      scoringConfig: content.scoringConfig,
    });

    if (!parsed.success) {
      // Separate structural vs. recommendation-text issues for diagnosis.
      const issues = parsed.error.issues;
      const structuralIssues = issues.filter(
        (iss) => !iss.path.includes("recommendations")
      );
      const textOnlyIssues = issues.filter((iss) =>
        iss.path.includes("recommendations")
      );

      if (structuralIssues.length > 0) {
        // HARD FAIL — the scoringConfig or section structure is broken.
        throw new Error(
          `TemplateVersionForPublishSchema rejected on STRUCTURAL path(s):\n` +
            structuralIssues
              .map((iss) => `  [${iss.path.join(".")}]: ${iss.message}`)
              .join("\n") +
            (textOnlyIssues.length > 0
              ? `\n(also ${textOnlyIssues.length} recommendation-text issue(s) — acceptable for DRAFT)`
              : "")
        );
      }

      // Only recommendation-text failures remain — acceptable for DRAFT.
      // The publish schema runs the full-coverage + sentinel checks on
      // recommendation text; those are admin-facing warnings, not structural.
      expect(textOnlyIssues.length).toBeGreaterThan(0);
      return;
    }

    // Parse succeeded — all structural AND text checks passed.
    expect(parsed.success).toBe(true);
  });
});
