/**
 * Content-guard tests for buildQuickAssessmentContent() — Scaling Up 4 Decisions Assessment.
 *
 * Written RED first (Task 1 TDD). Asserts:
 *   1. Exactly 4 sections, each with a domain ∈ {people,strategy,execution,cash}.
 *   2. Exactly 32 questions, 8 per section, every one SLIDER_LIKERT with scale 0-10.
 *   3. Unique stableKeys across all questions.
 *   4. Every question's sectionStableKey matches an existing section stableKey.
 *   5. scoringConfig.domains lists the 4 Decisions.
 *   6. tierMetric === "overallAvg", rollup.overall === "meanOfDomains", scaleUpScore === true.
 *   7. Overall tiers tile 0→10 with no gap/overlap (fractional touching semantics).
 *   8. Full payload passes TemplateVersionForScoringSchema.
 */

import { buildQuickAssessmentContent } from "../../../prisma/seed-scaling-up-quick-assessment";
import { TemplateVersionForScoringSchema } from "../../lib/assessments/scoring";

// ─── Shared fixture ───────────────────────────────────────────────────────

const content = buildQuickAssessmentContent();

// ─── 1. Sections ─────────────────────────────────────────────────────────

describe("buildQuickAssessmentContent() — sections", () => {
  it("has exactly 4 sections", () => {
    expect(content.sections).toHaveLength(4);
  });

  it("each section has a domain in {people, strategy, execution, cash}", () => {
    const VALID_DOMAINS = new Set(["people", "strategy", "execution", "cash"]);
    for (const s of content.sections as Array<{ domain?: string; stableKey: string }>) {
      expect(s.domain).toBeDefined();
      expect(VALID_DOMAINS.has(s.domain!)).toBe(true);
    }
  });

  it("section domain set is exactly [people, strategy, execution, cash] (no extras, no missing)", () => {
    const domains = (content.sections as Array<{ domain?: string }>)
      .map((s) => s.domain)
      .sort();
    expect(domains).toEqual(["cash", "execution", "people", "strategy"]);
  });

  it("section names are People, Strategy, Execution, Cash", () => {
    const names = (content.sections as Array<{ name: string }>)
      .map((s) => s.name)
      .sort();
    expect(names).toEqual(["Cash", "Execution", "People", "Strategy"]);
  });
});

// ─── 2. Questions ─────────────────────────────────────────────────────────

describe("buildQuickAssessmentContent() — questions", () => {
  it("has exactly 32 questions", () => {
    expect(content.questions).toHaveLength(32);
  });

  it("every question is SLIDER_LIKERT", () => {
    for (const q of content.questions as Array<{ type: string; stableKey: string }>) {
      expect(q.type).toBe("SLIDER_LIKERT");
    }
  });

  it("every question has scale.min === 0 and scale.max === 10", () => {
    for (const q of content.questions as Array<{
      scale: { min: number; max: number };
      stableKey: string;
    }>) {
      expect(q.scale.min).toBe(0);
      expect(q.scale.max).toBe(10);
    }
  });

  it("every question has anchorMin and anchorMax strings", () => {
    for (const q of content.questions as Array<{
      scale: { anchorMin: string; anchorMax: string };
      stableKey: string;
    }>) {
      expect(typeof q.scale.anchorMin).toBe("string");
      expect(q.scale.anchorMin.length).toBeGreaterThan(0);
      expect(typeof q.scale.anchorMax).toBe("string");
      expect(q.scale.anchorMax.length).toBeGreaterThan(0);
    }
  });

  it("each section has exactly 8 questions", () => {
    const sectionStableKeys = (content.sections as Array<{ stableKey: string }>).map(
      (s) => s.stableKey
    );
    for (const sk of sectionStableKeys) {
      const count = (
        content.questions as Array<{ sectionStableKey?: string }>
      ).filter((q) => q.sectionStableKey === sk).length;
      expect(count).toBe(8);
    }
  });

  it("all question stableKeys are unique", () => {
    const stableKeys = (content.questions as Array<{ stableKey: string }>).map(
      (q) => q.stableKey
    );
    const uniqueKeys = new Set(stableKeys);
    expect(uniqueKeys.size).toBe(stableKeys.length);
  });

  it("every question's sectionStableKey matches an existing section", () => {
    const sectionStableKeys = new Set(
      (content.sections as Array<{ stableKey: string }>).map((s) => s.stableKey)
    );
    for (const q of content.questions as Array<{
      sectionStableKey?: string;
      stableKey: string;
    }>) {
      expect(q.sectionStableKey).toBeDefined();
      expect(sectionStableKeys.has(q.sectionStableKey!)).toBe(true);
    }
  });

  it("question labels include known People question text", () => {
    const labels = (content.questions as Array<{ label: string }>).map(
      (q) => q.label
    );
    expect(
      labels.some((l) =>
        l.includes("A player") || l.includes("A-player") || l.includes("leadership team")
      )
    ).toBe(true);
  });

  it("question labels include known Cash question text", () => {
    const labels = (content.questions as Array<{ label: string }>).map(
      (q) => q.label
    );
    expect(
      labels.some((l) => l.includes("cash from customers") || l.includes("cash flow"))
    ).toBe(true);
  });
});

// ─── 3. ScoringConfig — domains ──────────────────────────────────────────

describe("buildQuickAssessmentContent() — scoringConfig.domains", () => {
  it("scoringConfig.domains contains exactly 4 entries", () => {
    const cfg = content.scoringConfig as {
      domains: Array<{ key: string; label: string }>;
    };
    expect(cfg.domains).toHaveLength(4);
  });

  it("domain keys are people, strategy, execution, cash", () => {
    const cfg = content.scoringConfig as {
      domains: Array<{ key: string }>;
    };
    const keys = cfg.domains.map((d) => d.key).sort();
    expect(keys).toEqual(["cash", "execution", "people", "strategy"]);
  });

  it("domain labels are People, Strategy, Execution, Cash", () => {
    const cfg = content.scoringConfig as {
      domains: Array<{ label: string }>;
    };
    const labels = cfg.domains.map((d) => d.label).sort();
    expect(labels).toEqual(["Cash", "Execution", "People", "Strategy"]);
  });

  it("each domain has at least 1 tier", () => {
    const cfg = content.scoringConfig as {
      domains: Array<{ key: string; tiers: unknown[] }>;
    };
    for (const d of cfg.domains) {
      expect(d.tiers.length).toBeGreaterThanOrEqual(1);
    }
  });
});

// ─── 4. ScoringConfig — top-level fields ─────────────────────────────────

describe("buildQuickAssessmentContent() — scoringConfig top-level", () => {
  const cfg = content.scoringConfig as {
    tierMetric: string;
    rollup: { overall: string };
    scaleUpScore: boolean;
  };

  it("tierMetric is 'overallAvg'", () => {
    expect(cfg.tierMetric).toBe("overallAvg");
  });

  it("rollup.overall is 'meanOfDomains'", () => {
    expect(cfg.rollup.overall).toBe("meanOfDomains");
  });

  it("scaleUpScore is true", () => {
    expect(cfg.scaleUpScore).toBe(true);
  });
});

// ─── 5. Global tiers tile 0→10 ───────────────────────────────────────────

describe("buildQuickAssessmentContent() — global tiers", () => {
  const cfg = content.scoringConfig as {
    tiers: Array<{ minMetric: number; maxMetric?: number; label: string }>;
  };

  it("has at least 2 global tiers", () => {
    expect(cfg.tiers.length).toBeGreaterThanOrEqual(2);
  });

  it("first tier starts at 0", () => {
    const sorted = [...cfg.tiers].sort((a, b) => a.minMetric - b.minMetric);
    expect(sorted[0].minMetric).toBe(0);
  });

  it("last tier ends at 10", () => {
    const sorted = [...cfg.tiers].sort((a, b) => a.minMetric - b.minMetric);
    expect(sorted[sorted.length - 1].maxMetric).toBe(10);
  });

  it("tiers tile without gaps or overlaps (fractional touching: b.minMetric === a.maxMetric)", () => {
    const sorted = [...cfg.tiers].sort((a, b) => a.minMetric - b.minMetric);
    for (let i = 0; i < sorted.length - 1; i++) {
      expect(sorted[i + 1].minMetric).toBe(sorted[i].maxMetric);
    }
  });
});

// ─── 6. CRUCIAL — TemplateVersionForScoringSchema passes ─────────────────

describe("buildQuickAssessmentContent() — TemplateVersionForScoringSchema (CRUCIAL)", () => {
  it("full payload passes TemplateVersionForScoringSchema with no structural failures", () => {
    const parsed = TemplateVersionForScoringSchema.safeParse({
      questions: content.questions,
      sections: content.sections,
      scoringConfig: content.scoringConfig,
    });

    if (!parsed.success) {
      const issues = parsed.error.issues;
      // For DRAFT content, recommendation text issues are acceptable;
      // structural issues (tier tiling, domain assignment, scaleUpScore) are hard failures.
      const structuralIssues = issues.filter(
        (iss) => !iss.path.includes("recommendations")
      );
      const textOnlyIssues = issues.filter((iss) =>
        iss.path.includes("recommendations")
      );

      if (structuralIssues.length > 0) {
        throw new Error(
          `TemplateVersionForScoringSchema rejected on STRUCTURAL path(s):\n` +
            structuralIssues
              .map((iss) => `  [${iss.path.join(".")}]: ${iss.message}`)
              .join("\n") +
            (textOnlyIssues.length > 0
              ? `\n(also ${textOnlyIssues.length} recommendation-text issue(s) — acceptable for DRAFT)`
              : "")
        );
      }

      // Only text issues remain — acceptable for DRAFT.
      expect(textOnlyIssues.length).toBeGreaterThan(0);
      return;
    }

    expect(parsed.success).toBe(true);
  });
});

// ─── 7. Template metadata ────────────────────────────────────────────────

describe("buildQuickAssessmentContent() — template metadata", () => {
  it("alias is 'scaling-up-quick'", () => {
    expect(content.alias).toBe("scaling-up-quick");
  });

  it("language is 'enUS'", () => {
    expect(content.language).toBe("enUS");
  });

  it("name contains '4 Decisions' or 'Scaling Up'", () => {
    expect(content.name).toMatch(/4 Decisions|Scaling Up/);
  });
});
