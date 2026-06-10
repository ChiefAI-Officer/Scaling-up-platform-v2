/**
 * Content-guard tests for buildFiveDysfunctionsContent() —
 * The Five Dysfunctions of a Team — Team Assessment.
 *
 * Written RED first (TDD). Asserts:
 *   1. Exactly 5 sections, one per fundamental.
 *   2. Domain set = {trust, conflict, commitment, accountability, results}.
 *   3. 38 questions total; per-domain counts: trust 8 / conflict 8 /
 *      commitment 7 / accountability 7 / results 8.
 *   4. Every question is SLIDER_LIKERT with scale.min === 1, scale.max === 5.
 *   5. scoringConfig.domains has exactly 5 entries, each with 3 tiers.
 *   6. tierMetric === "overallAvg"; NO scaleUpScore; NO rollup field.
 *   7. No unresolved placeholder text in question labels or tier messages.
 *   8. Full payload passes TemplateVersionForScoringSchema.
 *   9. Full payload passes TemplateVersionForPublishSchema
 *      (proves tier-tiling, domain-assignment, and section-refs resolve).
 */

import { buildFiveDysfunctionsContent } from "../../../prisma/seed-five-dysfunctions";
import {
  TemplateVersionForScoringSchema,
  TemplateVersionForPublishSchema,
} from "../../lib/assessments/scoring";

// ─── Shared fixture ───────────────────────────────────────────────────────

const content = buildFiveDysfunctionsContent();

// ─── 1. Sections ─────────────────────────────────────────────────────────

describe("buildFiveDysfunctionsContent() — sections", () => {
  it("has exactly 5 sections", () => {
    expect(content.sections).toHaveLength(5);
  });

  it("each section has a domain in {trust, conflict, commitment, accountability, results}", () => {
    const VALID_DOMAINS = new Set([
      "trust",
      "conflict",
      "commitment",
      "accountability",
      "results",
    ]);
    for (const s of content.sections as Array<{
      domain?: string;
      stableKey: string;
    }>) {
      expect(s.domain).toBeDefined();
      expect(VALID_DOMAINS.has(s.domain!)).toBe(true);
    }
  });

  it("domain set is exactly {trust, conflict, commitment, accountability, results}", () => {
    const domains = (content.sections as Array<{ domain?: string }>)
      .map((s) => s.domain)
      .sort();
    expect(domains).toEqual([
      "accountability",
      "commitment",
      "conflict",
      "results",
      "trust",
    ]);
  });

  it("section names are Trust, Conflict, Commitment, Accountability, Results", () => {
    const names = (content.sections as Array<{ name: string }>)
      .map((s) => s.name)
      .sort();
    expect(names).toEqual([
      "Accountability",
      "Commitment",
      "Conflict",
      "Results",
      "Trust",
    ]);
  });
});

// ─── 2. Questions ─────────────────────────────────────────────────────────

describe("buildFiveDysfunctionsContent() — questions", () => {
  it("has exactly 38 questions", () => {
    expect(content.questions).toHaveLength(38);
  });

  it("every question is SLIDER_LIKERT", () => {
    for (const q of content.questions as Array<{
      type: string;
      stableKey: string;
    }>) {
      expect(q.type).toBe("SLIDER_LIKERT");
    }
  });

  it("every question has scale.min === 1 and scale.max === 5", () => {
    for (const q of content.questions as Array<{
      scale: { min: number; max: number };
      stableKey: string;
    }>) {
      expect(q.scale.min).toBe(1);
      expect(q.scale.max).toBe(5);
    }
  });

  it("every question has anchorMin 'Never' and anchorMax 'Always'", () => {
    for (const q of content.questions as Array<{
      scale: { anchorMin: string; anchorMax: string };
      stableKey: string;
    }>) {
      expect(q.scale.anchorMin).toBe("Never");
      expect(q.scale.anchorMax).toBe("Always");
    }
  });

  it("all question stableKeys are unique", () => {
    const stableKeys = (
      content.questions as Array<{ stableKey: string }>
    ).map((q) => q.stableKey);
    const uniqueKeys = new Set(stableKeys);
    expect(uniqueKeys.size).toBe(stableKeys.length);
  });

  // Guards the seed integrity check: sortOrder must be GLOBALLY unique across
  // all questions (not restart per section), else ensureTemplateVersionContent
  // throws "duplicate question sortOrder" at seed time.
  it("all question sortOrders are globally unique (1..38)", () => {
    const sortOrders = (
      content.questions as Array<{ sortOrder: number }>
    ).map((q) => q.sortOrder);
    expect(new Set(sortOrders).size).toBe(sortOrders.length);
    expect([...sortOrders].sort((a, b) => a - b)).toEqual(
      Array.from({ length: 38 }, (_, i) => i + 1),
    );
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
});

// ─── 3. Per-domain question counts ────────────────────────────────────────

describe("buildFiveDysfunctionsContent() — per-domain question counts", () => {
  // Build a map: domain key → question count (via section→domain)
  const sectionDomainMap = new Map<string, string>(
    (content.sections as Array<{ stableKey: string; domain?: string }>).map(
      (s) => [s.stableKey, s.domain ?? ""]
    )
  );
  const domainCounts = new Map<string, number>();
  for (const q of content.questions as Array<{
    sectionStableKey?: string;
  }>) {
    const domain = sectionDomainMap.get(q.sectionStableKey ?? "") ?? "unknown";
    domainCounts.set(domain, (domainCounts.get(domain) ?? 0) + 1);
  }

  it("trust has 8 questions", () => {
    expect(domainCounts.get("trust")).toBe(8);
  });

  it("conflict has 8 questions", () => {
    expect(domainCounts.get("conflict")).toBe(8);
  });

  it("commitment has 7 questions", () => {
    expect(domainCounts.get("commitment")).toBe(7);
  });

  it("accountability has 7 questions", () => {
    expect(domainCounts.get("accountability")).toBe(7);
  });

  it("results has 8 questions", () => {
    expect(domainCounts.get("results")).toBe(8);
  });
});

// ─── 4. ScoringConfig — domains ───────────────────────────────────────────

describe("buildFiveDysfunctionsContent() — scoringConfig.domains", () => {
  it("scoringConfig.domains contains exactly 5 entries", () => {
    const cfg = content.scoringConfig as {
      domains: Array<{ key: string; label: string }>;
    };
    expect(cfg.domains).toHaveLength(5);
  });

  it("domain keys are trust, conflict, commitment, accountability, results", () => {
    const cfg = content.scoringConfig as {
      domains: Array<{ key: string }>;
    };
    const keys = cfg.domains.map((d) => d.key).sort();
    expect(keys).toEqual([
      "accountability",
      "commitment",
      "conflict",
      "results",
      "trust",
    ]);
  });

  it("each domain has exactly 3 tiers (High / Medium / Low)", () => {
    const cfg = content.scoringConfig as {
      domains: Array<{ key: string; tiers: unknown[] }>;
    };
    for (const d of cfg.domains) {
      expect(d.tiers).toHaveLength(3);
    }
  });

  it("tier labels for each domain are Low, Medium, High", () => {
    const cfg = content.scoringConfig as {
      domains: Array<{ key: string; tiers: Array<{ label: string }> }>;
    };
    for (const d of cfg.domains) {
      const labels = d.tiers.map((t) => t.label).sort();
      expect(labels).toEqual(["High", "Low", "Medium"]);
    }
  });

  it("Low tier minMetric === 1 and maxMetric === 3.25 for every domain", () => {
    const cfg = content.scoringConfig as {
      domains: Array<{
        key: string;
        tiers: Array<{ label: string; minMetric: number; maxMetric?: number }>;
      }>;
    };
    for (const d of cfg.domains) {
      const low = d.tiers.find((t) => t.label === "Low");
      expect(low).toBeDefined();
      expect(low!.minMetric).toBe(1);
      expect(low!.maxMetric).toBe(3.25);
    }
  });

  it("Medium tier minMetric === 3.25 and maxMetric === 3.75 for every domain", () => {
    const cfg = content.scoringConfig as {
      domains: Array<{
        key: string;
        tiers: Array<{ label: string; minMetric: number; maxMetric?: number }>;
      }>;
    };
    for (const d of cfg.domains) {
      const medium = d.tiers.find((t) => t.label === "Medium");
      expect(medium).toBeDefined();
      expect(medium!.minMetric).toBe(3.25);
      expect(medium!.maxMetric).toBe(3.75);
    }
  });

  it("High tier minMetric === 3.75 and maxMetric === 5 for every domain", () => {
    const cfg = content.scoringConfig as {
      domains: Array<{
        key: string;
        tiers: Array<{ label: string; minMetric: number; maxMetric?: number }>;
      }>;
    };
    for (const d of cfg.domains) {
      const high = d.tiers.find((t) => t.label === "High");
      expect(high).toBeDefined();
      expect(high!.minMetric).toBe(3.75);
      expect(high!.maxMetric).toBe(5);
    }
  });
});

// ─── 5. ScoringConfig — top-level fields ──────────────────────────────────

describe("buildFiveDysfunctionsContent() — scoringConfig top-level", () => {
  const cfg = content.scoringConfig as Record<string, unknown>;

  it("tierMetric is 'overallAvg'", () => {
    expect(cfg["tierMetric"]).toBe("overallAvg");
  });

  it("passThreshold is 0", () => {
    expect(cfg["passThreshold"]).toBe(0);
  });

  it("scaleUpScore is NOT set (instrument has no 0-100 rollup)", () => {
    expect(cfg["scaleUpScore"]).toBeUndefined();
  });

  it("rollup is NOT set (no meanOfDomains global rollup)", () => {
    expect(cfg["rollup"]).toBeUndefined();
  });

  it("global tiers have exactly 1 entry with label 'Submitted'", () => {
    const tiers = cfg["tiers"] as Array<{ label: string }>;
    expect(tiers).toHaveLength(1);
    expect(tiers[0].label).toBe("Submitted");
  });
});

// ─── 6. No placeholder text ───────────────────────────────────────────────

describe("buildFiveDysfunctionsContent() — no placeholder / TODO text", () => {
  const PLACEHOLDERS = ["TODO", "VERIFY", "PLACEHOLDER", "Lorem", "TBD"];

  it("no question label contains a placeholder sentinel", () => {
    for (const q of content.questions as Array<{
      label: string;
      stableKey: string;
    }>) {
      for (const sentinel of PLACEHOLDERS) {
        expect(q.label).not.toContain(sentinel);
      }
      // Must be non-empty
      expect(q.label.trim().length).toBeGreaterThan(0);
    }
  });

  it("no domain tier message contains a placeholder sentinel", () => {
    const cfg = content.scoringConfig as {
      domains: Array<{
        key: string;
        tiers: Array<{ label: string; message: string }>;
      }>;
    };
    for (const d of cfg.domains) {
      for (const tier of d.tiers) {
        for (const sentinel of PLACEHOLDERS) {
          expect(tier.message).not.toContain(sentinel);
        }
        expect(tier.message.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it("question labels contain verbatim text from the PDF (spot-checks)", () => {
    const labels = (content.questions as Array<{ label: string }>).map(
      (q) => q.label
    );
    // Q1 — Trust
    expect(labels.some((l) => l.includes("admit their mistakes"))).toBe(true);
    // Q9 — Results: "reputation for high performance"
    expect(labels.some((l) => l.includes("reputation for high performance"))).toBe(true);
    // Q24 — Commitment: "clear about its direction and priorities"
    expect(labels.some((l) => l.includes("clear about its direction and priorities"))).toBe(true);
    // Q37 — Results: "titles and status"
    expect(labels.some((l) => l.includes("titles and status"))).toBe(true);
    // Q38 — Commitment: "support group decisions"
    expect(labels.some((l) => l.includes("support group decisions"))).toBe(true);
  });
});

// ─── 7. Schema validation ─────────────────────────────────────────────────

describe("buildFiveDysfunctionsContent() — schema validation", () => {
  it("passes TemplateVersionForScoringSchema", () => {
    const result = TemplateVersionForScoringSchema.safeParse({
      questions: content.questions,
      sections: content.sections,
      scoringConfig: content.scoringConfig,
    });
    if (!result.success) {
      // Surface the first error for easy debugging
      console.error(
        "TemplateVersionForScoringSchema issues:",
        JSON.stringify(result.error.issues, null, 2)
      );
    }
    expect(result.success).toBe(true);
  });

  it("passes TemplateVersionForPublishSchema (tier-tiling + domain assignment)", () => {
    const result = TemplateVersionForPublishSchema.safeParse({
      questions: content.questions,
      sections: content.sections,
      scoringConfig: content.scoringConfig,
    });
    if (!result.success) {
      console.error(
        "TemplateVersionForPublishSchema issues:",
        JSON.stringify(result.error.issues, null, 2)
      );
    }
    expect(result.success).toBe(true);
  });
});
