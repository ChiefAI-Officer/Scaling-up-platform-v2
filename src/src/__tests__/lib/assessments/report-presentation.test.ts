/**
 * Assessment v7.6 — report-presentation pure helper tests (Task 2).
 *
 * Unit coverage for the three pure presentation helpers that drive the
 * adaptive BrandedReport:
 *   - isNeutralTier  (H11 predicate)
 *   - domainColor    (H12 domain → color map)
 *   - headlineForTierMetric (G2 overall-banner adaptation)
 */

import {
  isNeutralTier,
  domainColor,
  headlineForTierMetric,
} from "@/lib/assessments/report-presentation";
import type { ScoreResult } from "@/lib/assessments/scoring";

// ── isNeutralTier (H11) ───────────────────────────────────────────────────

describe("isNeutralTier", () => {
  it("true for QSP/LVA shape: 1 tier, passThreshold 0, tierMetric overallAvg", () => {
    expect(
      isNeutralTier({
        tiers: [{ minMetric: 0, label: "Submitted", message: "" }],
        passThreshold: 0,
        tierMetric: "overallAvg",
      }),
    ).toBe(true);
  });

  it("false when there is more than one tier", () => {
    expect(
      isNeutralTier({
        tiers: [
          { minMetric: 0, label: "Low", message: "" },
          { minMetric: 3, label: "High", message: "" },
        ],
        passThreshold: 0,
        tierMetric: "overallAvg",
      }),
    ).toBe(false);
  });

  it("false when passThreshold is non-zero (Rockefeller)", () => {
    expect(
      isNeutralTier({
        tiers: [{ minMetric: 0, label: "Submitted", message: "" }],
        passThreshold: 2,
        tierMetric: "overallAvg",
      }),
    ).toBe(false);
  });

  it("false when tierMetric is not overallAvg", () => {
    expect(
      isNeutralTier({
        tiers: [{ minMetric: 0, label: "Submitted", message: "" }],
        passThreshold: 0,
        tierMetric: "countAchieved",
      }),
    ).toBe(false);
  });

  it("false / never throws on missing or malformed config", () => {
    expect(isNeutralTier(null)).toBe(false);
    expect(isNeutralTier(undefined)).toBe(false);
    expect(isNeutralTier({})).toBe(false);
    expect(isNeutralTier("nope")).toBe(false);
    expect(isNeutralTier({ tiers: "x" })).toBe(false);
  });
});

// ── domainColor (H12) ──────────────────────────────────────────────────────

describe("domainColor", () => {
  it("maps the five SU Full domains to their brand colors", () => {
    expect(domainColor("people")).toBe("#f7a600");
    expect(domainColor("strategy")).toBe("#008bd2");
    expect(domainColor("execution")).toBe("#946b36");
    expect(domainColor("cash")).toBe("#95c11f");
    expect(domainColor("you")).toBe("#522583");
  });

  it("normalizes case + surrounding whitespace", () => {
    expect(domainColor("PEOPLE")).toBe("#f7a600");
    expect(domainColor("  You  ")).toBe("#522583");
    expect(domainColor("Strategy")).toBe("#008bd2");
  });

  it("falls back to neutral grey for unknown domains", () => {
    expect(domainColor("widgets")).toBe("#6b6480");
    expect(domainColor("")).toBe("#6b6480");
  });
});

// ── headlineForTierMetric (G2) ─────────────────────────────────────────────

function baseResult(overrides: Partial<ScoreResult> = {}): ScoreResult {
  return {
    perQuestion: [],
    perSection: [],
    overallTotal: 0,
    overallAverage: 0,
    countAchieved: 0,
    tier: null,
    tierMetricValue: 0,
    unansweredKeys: [],
    ...overrides,
  };
}

describe("headlineForTierMetric", () => {
  it("countAchieved → 'N / M' + tier label (Rockefeller)", () => {
    const result = baseResult({
      countAchieved: 28,
      perQuestion: new Array(40).fill(0).map((_, i) => ({
        stableKey: `q${i}`,
        value: 2,
        achieved: i < 28,
      })),
      tier: { label: "Strong — Scaling Well", message: "Great work" },
    });
    const h = headlineForTierMetric(result, {
      tierMetric: "countAchieved",
      passThreshold: 2,
      tiers: [],
    });
    expect(h.primary).toBe("28 / 40");
    expect(h.label).toBe("Strong — Scaling Well");
  });

  it("overallAvg → 'Avg X' + 'Submitted' label (neutral)", () => {
    const result = baseResult({ overallAverage: 3.2 });
    const h = headlineForTierMetric(result, {
      tierMetric: "overallAvg",
      passThreshold: 0,
      tiers: [{ minMetric: 0, label: "Submitted", message: "" }],
    });
    expect(h.primary).toBe("Avg 3.2");
    expect(h.label).toBe("Submitted");
  });

  it("scaleUpScore present → 'S / 100' + tier label (SU Full)", () => {
    const result = baseResult({
      scaleUpScore: 72,
      tier: { label: "Scaling", message: "" },
    });
    const h = headlineForTierMetric(result, {
      tierMetric: "overallAvg",
      passThreshold: 0,
      tiers: [],
      scaleUpScore: true,
    });
    expect(h.primary).toBe("72 / 100");
    expect(h.label).toBe("Scaling");
  });

  it("scaleUpScore present but no tier → label 'ScaleUp'", () => {
    const result = baseResult({ scaleUpScore: 50, tier: null });
    const h = headlineForTierMetric(result, {
      tierMetric: "overallAvg",
      passThreshold: 0,
      tiers: [],
      scaleUpScore: true,
    });
    expect(h.primary).toBe("50 / 100");
    expect(h.label).toBe("ScaleUp");
  });

  it("is total-tolerant of missing fields (no throw, sane defaults)", () => {
    const h = headlineForTierMetric(baseResult(), null);
    expect(typeof h.primary).toBe("string");
    expect(typeof h.label).toBe("string");
  });
});
