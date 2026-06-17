/**
 * Assessment v7.6 — AssessmentResultView render tests (Task F).
 */

import { render, screen, fireEvent } from "@testing-library/react";
import { AssessmentResultView } from "@/components/assessments/AssessmentResultView";
import type { ScoreResult } from "@/lib/assessments/scoring";

function buildVersion() {
  return {
    sections: [
      { stableKey: "S1", name: "Strategy", sortOrder: 1 },
      { stableKey: "S2", name: "People", sortOrder: 2 },
    ],
    scoringConfig: {
      tierMetric: "countAchieved" as const,
      passThreshold: 4,
      tiers: [
        { minMetric: 0, maxMetric: 16, label: "Low", message: "Needs work" },
        { minMetric: 17, maxMetric: 32, label: "OK", message: "On track" },
        { minMetric: 33, maxMetric: 40, label: "Great", message: "Excellent" },
      ],
    },
  };
}

function buildResult(overrides: Partial<ScoreResult> = {}): ScoreResult {
  return {
    perQuestion: [
      { stableKey: "q1", value: 5, achieved: true },
      { stableKey: "q2", value: 2, achieved: false },
    ],
    perSection: [
      {
        stableKey: "S1",
        name: "Strategy",
        totalPoints: 18,
        averagePoints: 4.5,
        achievedCount: 3,
        totalCount: 4,
      },
      {
        stableKey: "S2",
        name: "People",
        totalPoints: 22,
        averagePoints: 5.5,
        achievedCount: 4,
        totalCount: 4,
      },
    ],
    overallTotal: 100,
    overallAverage: 2.5,
    countAchieved: 25,
    tier: { label: "OK", message: "On track — keep going" },
    tierMetricValue: 25,
    unansweredKeys: [],
    ...overrides,
  };
}

describe("AssessmentResultView", () => {
  it("renders tier banner — Low", () => {
    const result = buildResult({
      tier: { label: "Low", message: "Below threshold" },
      tierMetricValue: 8,
      countAchieved: 8,
    });
    render(
      <AssessmentResultView result={result} version={buildVersion()} />,
    );
    const banner = screen.getByTestId("tier-banner");
    expect(banner).toBeInTheDocument();
    expect(banner.textContent).toContain("Low");
    expect(banner.textContent).toContain("Below threshold");
    // Destructive tone token applied
    expect(banner.className).toMatch(/destructive/);
  });

  it("renders tier banner — OK", () => {
    const result = buildResult({
      tier: { label: "OK", message: "On track" },
      tierMetricValue: 25,
    });
    render(
      <AssessmentResultView result={result} version={buildVersion()} />,
    );
    const banner = screen.getByTestId("tier-banner");
    expect(banner.textContent).toContain("OK");
    expect(banner.className).toMatch(/warning/);
  });

  it("renders tier banner — Great", () => {
    const result = buildResult({
      tier: { label: "Great", message: "Excellent" },
      tierMetricValue: 38,
      countAchieved: 38,
    });
    render(
      <AssessmentResultView result={result} version={buildVersion()} />,
    );
    const banner = screen.getByTestId("tier-banner");
    expect(banner.textContent).toContain("Great");
    expect(banner.className).toMatch(/success/);
  });

  it("renders stats row with countAchieved, overallTotal, overallAverage", () => {
    const result = buildResult();
    render(
      <AssessmentResultView result={result} version={buildVersion()} />,
    );
    const stats = screen.getByTestId("result-stats-row");
    expect(stats.textContent).toContain("25"); // countAchieved
    expect(stats.textContent).toContain("100"); // overallTotal
    expect(stats.textContent).toContain("2.50"); // overallAverage (formatted)
  });

  it("renders per-section table with names + numbers", () => {
    const result = buildResult();
    render(
      <AssessmentResultView result={result} version={buildVersion()} />,
    );
    const table = screen.getByTestId("per-section-table");
    expect(table.textContent).toContain("Strategy");
    expect(table.textContent).toContain("People");
    expect(table.textContent).toContain("18"); // S1 total
    expect(table.textContent).toContain("22"); // S2 total
    expect(table.textContent).toContain("3 / 4"); // S1 achieved
    expect(table.textContent).toContain("4 / 4"); // S2 achieved
  });

  it("falls back to version section name when result section name differs", () => {
    const result = buildResult({
      perSection: [
        {
          stableKey: "S1",
          name: "DIFFERENT", // result has stale/different name
          totalPoints: 18,
          averagePoints: 4.5,
          achievedCount: 3,
          totalCount: 4,
        },
      ],
    });
    render(
      <AssessmentResultView result={result} version={buildVersion()} />,
    );
    const table = screen.getByTestId("per-section-table");
    // Version name wins
    expect(table.textContent).toContain("Strategy");
  });

  it("per-question detail is collapsible (default closed)", () => {
    const result = buildResult();
    render(
      <AssessmentResultView result={result} version={buildVersion()} />,
    );
    expect(
      screen.queryByTestId("per-question-detail"),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("per-question-toggle"));
    expect(screen.getByTestId("per-question-detail")).toBeInTheDocument();
    expect(
      screen.getByTestId("per-question-detail").textContent,
    ).toContain("q1");
  });

  it("shows question text (not bare code) when questionByKey is provided (#21)", () => {
    const result = buildResult({
      perQuestion: [{ stableKey: "q1_1", value: 5, achieved: true }],
    });
    render(
      <AssessmentResultView
        result={result}
        version={buildVersion()}
        questionByKey={{ q1_1: "How ready are you?" }}
      />,
    );
    fireEvent.click(screen.getByTestId("per-question-toggle"));
    const detail = screen.getByTestId("per-question-detail");
    // The human-readable label is the primary display.
    expect(detail.textContent).toContain("How ready are you?");
    // The bare code is no longer the primary label — it must not appear in a
    // primary (non-muted) span. The label heading carries it instead.
    const primaryLabel = detail.querySelector(
      '[data-testid="per-question-label-q1_1"]',
    );
    expect(primaryLabel?.textContent).toBe("How ready are you?");
  });

  it("falls back to the stableKey code when no label is mapped (#21)", () => {
    const result = buildResult({
      perQuestion: [{ stableKey: "q9_9", value: 3, achieved: false }],
    });
    render(
      <AssessmentResultView
        result={result}
        version={buildVersion()}
        questionByKey={{ q1_1: "How ready are you?" }}
      />,
    );
    fireEvent.click(screen.getByTestId("per-question-toggle"));
    const detail = screen.getByTestId("per-question-detail");
    expect(detail.textContent).toContain("q9_9");
  });

  it("renders empty section message when no sections present", () => {
    const result = buildResult({ perSection: [] });
    render(
      <AssessmentResultView result={result} version={buildVersion()} />,
    );
    const table = screen.getByTestId("per-section-table");
    expect(table.textContent).toContain("No sectioned questions");
  });

  it("handles null tier gracefully", () => {
    const result = buildResult({ tier: null });
    render(
      <AssessmentResultView result={result} version={buildVersion()} />,
    );
    const banner = screen.getByTestId("tier-banner");
    expect(banner.textContent).toContain("—");
    expect(banner.textContent).toContain("No tier resolved");
  });
});
