/**
 * Assessment v7.6 — BrandedReport render tests (Task 2).
 *
 * The adaptive, brand-scoped per-respondent results report. Pure
 * presentational (props in → JSX out). These tests build RespondentReport
 * fixtures matching the four live scoring shapes (Rockefeller / QSP-LVA
 * neutral / SU Full domains+ScaleUp) plus the robustness edges
 * (non-slider answers H9, missing labels H10, degraded result).
 */

import { render, screen, within } from "@testing-library/react";
import { BrandedReport } from "@/components/assessments/BrandedReport";
import type { RespondentReport } from "@/lib/assessments/respondent-report";
import type { ScoreResult } from "@/lib/assessments/scoring";

// ── Fixture builders ───────────────────────────────────────────────────────

function baseReport(overrides: Partial<RespondentReport> = {}): RespondentReport {
  return {
    respondentName: "Sarah Chen",
    jobTitle: "Chief Executive Officer",
    companyName: "Northwind Logistics",
    assessmentName: "Rockefeller Habits Checklist",
    submittedAt: new Date("2026-06-05T10:00:00Z"),
    result: {} as ScoreResult,
    sections: [],
    questionByKey: {},
    questionsByKey: {},
    rawAnswers: [],
    scoringConfig: {},
    provenance: {
      submissionId: "sub-123",
      versionId: "ver-456",
      contentHash: "abcdef0123456789",
      templateName: "Rockefeller Habits Checklist",
    },
    degraded: false,
    ...overrides,
  };
}

// ── Rockefeller — countAchieved + real tiers + checkmarks, no domains/recs ──

function rockefellerReport(): RespondentReport {
  const result: ScoreResult = {
    perQuestion: [
      { stableKey: "q1", value: 3, achieved: true },
      { stableKey: "q2", value: 1, achieved: false },
      { stableKey: "q3", value: 2, achieved: true },
    ],
    perSection: [
      {
        stableKey: "s1",
        name: "The executive team is healthy",
        totalPoints: 6,
        averagePoints: 2,
        achievedCount: 2,
        totalCount: 3,
      },
    ],
    overallTotal: 6,
    overallAverage: 2,
    countAchieved: 2,
    tier: { label: "Strong — Scaling Well", message: "Your team is aligned." },
    tierMetricValue: 2,
    unansweredKeys: [],
  };
  return baseReport({
    assessmentName: "Rockefeller Habits Checklist",
    result,
    sections: [
      {
        stableKey: "s1",
        name: "The executive team is healthy",
        questions: [
          { stableKey: "q1" },
          { stableKey: "q2" },
          { stableKey: "q3" },
        ],
      },
    ],
    questionByKey: {
      q1: "Members understand each other's styles",
      q2: "Insights shared at weekly exec meeting",
      q3: "All employees collect customer data",
    },
    questionsByKey: {
      q1: { type: "SLIDER_LIKERT", label: "Members understand each other's styles", sectionStableKey: "s1", min: 0, max: 3 },
      q2: { type: "SLIDER_LIKERT", label: "Insights shared at weekly exec meeting", sectionStableKey: "s1", min: 0, max: 3 },
      q3: { type: "SLIDER_LIKERT", label: "All employees collect customer data", sectionStableKey: "s1", min: 0, max: 3 },
    },
    rawAnswers: [
      { stableKey: "q1", value: 3 },
      { stableKey: "q2", value: 1 },
      { stableKey: "q3", value: 2 },
    ],
    scoringConfig: {
      tierMetric: "countAchieved",
      passThreshold: 2,
      tiers: [
        { minMetric: 0, maxMetric: 1, label: "Low", message: "Needs work" },
        { minMetric: 2, maxMetric: 2, label: "OK", message: "On track" },
        { minMetric: 3, label: "Strong — Scaling Well", message: "Great" },
      ],
    },
  });
}

// ── QSP / LVA neutral — overallAvg, single tier, passThreshold 0 ────────────

function neutralReport(): RespondentReport {
  const result: ScoreResult = {
    perQuestion: [
      { stableKey: "q1", value: 4, achieved: true },
      { stableKey: "q2", value: 2, achieved: true },
    ],
    perSection: [
      {
        stableKey: "s1",
        name: "Priorities",
        totalPoints: 6,
        averagePoints: 3,
        achievedCount: 2,
        totalCount: 2,
      },
    ],
    overallTotal: 6,
    overallAverage: 3.2,
    countAchieved: 2,
    tier: { label: "Submitted", message: "Thank you for completing." },
    tierMetricValue: 3.2,
    unansweredKeys: [],
  };
  return baseReport({
    assessmentName: "Quarterly Strategy Pulse",
    result,
    sections: [
      {
        stableKey: "s1",
        name: "Priorities",
        questions: [{ stableKey: "q1" }, { stableKey: "q2" }],
      },
    ],
    questionByKey: {
      q1: "We have a clear top priority",
      q2: "Everyone knows the metric",
    },
    questionsByKey: {
      q1: { type: "SLIDER_LIKERT", label: "We have a clear top priority" },
      q2: { type: "SLIDER_LIKERT", label: "Everyone knows the metric" },
    },
    rawAnswers: [
      { stableKey: "q1", value: 4 },
      { stableKey: "q2", value: 2 },
    ],
    scoringConfig: {
      tierMetric: "overallAvg",
      passThreshold: 0,
      tiers: [{ minMetric: 0, label: "Submitted", message: "" }],
    },
  });
}

// ── SU Full — perDomain (incl. "you" purple) + scaleUpScore + recs ──────────

function suFullReport(): RespondentReport {
  const result: ScoreResult = {
    perQuestion: [
      {
        stableKey: "q1",
        value: 7,
        achieved: true,
        recommendation: "Tighten your weekly meeting rhythm.",
      },
      { stableKey: "q2", value: 5, achieved: true },
    ],
    perSection: [
      {
        stableKey: "s_people",
        name: "Team Health",
        totalPoints: 7,
        averagePoints: 7,
        achievedCount: 1,
        totalCount: 1,
      },
      {
        stableKey: "s_you",
        name: "Personal Leadership",
        totalPoints: 5,
        averagePoints: 5,
        achievedCount: 1,
        totalCount: 1,
      },
    ],
    perDomain: [
      {
        key: "people",
        label: "People",
        averagePoints: 7,
        answeredSectionCount: 1,
        totalSectionCount: 1,
        tier: null,
      },
      {
        key: "you",
        label: "You",
        averagePoints: 5,
        answeredSectionCount: 1,
        totalSectionCount: 1,
        tier: null,
      },
    ],
    overallTotal: 12,
    overallAverage: 6,
    countAchieved: 2,
    tier: { label: "Scaling", message: "Solid foundation." },
    tierMetricValue: 6,
    scaleUpScore: 72,
    unansweredKeys: [],
  };
  return baseReport({
    assessmentName: "Scaling Up Full",
    result,
    sections: [
      {
        stableKey: "s_people",
        name: "Team Health",
        domain: "people",
        questions: [{ stableKey: "q1" }],
      },
      {
        stableKey: "s_you",
        name: "Personal Leadership",
        domain: "you",
        questions: [{ stableKey: "q2" }],
      },
    ],
    questionByKey: {
      q1: "Weekly strategic thinking meeting",
      q2: "I make time for personal renewal",
    },
    questionsByKey: {
      q1: { type: "SLIDER_LIKERT", label: "Weekly strategic thinking meeting" },
      q2: { type: "SLIDER_LIKERT", label: "I make time for personal renewal" },
    },
    rawAnswers: [
      { stableKey: "q1", value: 7 },
      { stableKey: "q2", value: 5 },
    ],
    scoringConfig: {
      tierMetric: "overallAvg",
      passThreshold: 0,
      scaleUpScore: true,
      tiers: [{ minMetric: 0, label: "Scaling", message: "" }],
      domains: [
        { key: "people", label: "People", tiers: [] },
        { key: "you", label: "You", tiers: [] },
      ],
    },
  });
}

// ════════════════════════════════════════════════════════════════════════════
// Cover
// ════════════════════════════════════════════════════════════════════════════

describe("BrandedReport — cover", () => {
  it("renders respondent, company, assessment name, submitted date, and the white logo", () => {
    render(<BrandedReport report={rockefellerReport()} />);
    const cover = screen.getByTestId("report-cover");
    expect(cover.textContent).toContain("Sarah Chen");
    expect(cover.textContent).toContain("Chief Executive Officer");
    expect(cover.textContent).toContain("Northwind Logistics");
    expect(cover.textContent).toContain("Rockefeller Habits Checklist");
    // formatted submittedAt (year present at minimum)
    expect(cover.textContent).toContain("2026");
    const logo = within(cover).getByAltText("Scaling Up");
    expect(logo).toHaveAttribute("src", "/brand/su-logo-white.svg");
  });

  it("prefers the assessmentName prop override over report.assessmentName", () => {
    render(
      <BrandedReport report={rockefellerReport()} assessmentName="Override Name" />,
    );
    expect(screen.getByTestId("report-cover").textContent).toContain(
      "Override Name",
    );
  });

  it("wraps the whole report in the scoped brand classes", () => {
    const { container } = render(<BrandedReport report={rockefellerReport()} />);
    const root = container.querySelector(".su-public-brand.su-report");
    expect(root).toBeInTheDocument();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Overall (G2) — adapts to tierMetric
// ════════════════════════════════════════════════════════════════════════════

describe("BrandedReport — overall (Rockefeller countAchieved)", () => {
  it("shows 'N / M' + the tier band + message", () => {
    render(<BrandedReport report={rockefellerReport()} />);
    const overall = screen.getByTestId("report-overall");
    expect(overall.textContent).toContain("2 / 3");
    expect(overall.textContent).toContain("Strong — Scaling Well");
    expect(overall.textContent).toContain("Your team is aligned.");
  });
});

describe("BrandedReport — overall (QSP/LVA neutral)", () => {
  it("shows 'Avg X' + 'Submitted', no fabricated band coloring/message-as-score", () => {
    render(<BrandedReport report={neutralReport()} />);
    const overall = screen.getByTestId("report-overall");
    expect(overall.textContent).toContain("Avg 3.2");
    expect(overall.textContent).toContain("Submitted");
    // neutral suppresses the band message-as-headline
    expect(overall.textContent).not.toContain("Thank you for completing.");
    // no band-tone marker on a neutral report
    expect(screen.queryByTestId("overall-band")).not.toBeInTheDocument();
  });
});

describe("BrandedReport — overall (SU Full ScaleUp)", () => {
  it("shows a ScaleUp '/ 100' headline + the tier label", () => {
    render(<BrandedReport report={suFullReport()} />);
    const overall = screen.getByTestId("report-overall");
    expect(overall.textContent).toContain("72 / 100");
    expect(overall.textContent).toContain("Scaling");
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Section breakdown (G2 checkmarks + H12 domain colors)
// ════════════════════════════════════════════════════════════════════════════

describe("BrandedReport — section breakdown", () => {
  it("Rockefeller (passThreshold>0): shows ratings AND green-check achieved markers", () => {
    render(<BrandedReport report={rockefellerReport()} />);
    const breakdown = screen.getByTestId("report-sections");
    // question labels present
    expect(breakdown.textContent).toContain(
      "Members understand each other's styles",
    );
    // achieved markers present (one per question)
    const achievedMarks = within(breakdown).getAllByTestId("achieved-marker");
    expect(achievedMarks.length).toBe(3);
    // rating always shown
    expect(breakdown.textContent).toContain("3");
  });

  it("neutral (passThreshold===0): shows ratings, NO checkmarks", () => {
    render(<BrandedReport report={neutralReport()} />);
    const breakdown = screen.getByTestId("report-sections");
    expect(breakdown.textContent).toContain("We have a clear top priority");
    expect(within(breakdown).queryAllByTestId("achieved-marker").length).toBe(0);
  });

  it("Rockefeller has NO domain-colored card headers (no perDomain)", () => {
    render(<BrandedReport report={rockefellerReport()} />);
    const breakdown = screen.getByTestId("report-sections");
    expect(within(breakdown).queryAllByTestId("domain-colored-head").length).toBe(
      0,
    );
  });

  it("SU Full: domain-colored card headers — the 'You' card uses purple #522583", () => {
    render(<BrandedReport report={suFullReport()} />);
    const breakdown = screen.getByTestId("report-sections");
    const coloredHeads = within(breakdown).getAllByTestId("domain-colored-head");
    expect(coloredHeads.length).toBe(2);
    // The "you" section card head must use purple.
    const youHead = within(breakdown).getByTestId("section-head-s_you");
    expect(youHead).toHaveStyle({ backgroundColor: "#522583" });
    const peopleHead = within(breakdown).getByTestId("section-head-s_people");
    expect(peopleHead).toHaveStyle({ backgroundColor: "#f7a600" });
  });
});

// ════════════════════════════════════════════════════════════════════════════
// value / max rendering + sectionStableKey-based grouping
// ════════════════════════════════════════════════════════════════════════════

describe("BrandedReport — value/max + sectionStableKey grouping", () => {
  it("renders 'value / max' when questionsByKey carries a max (e.g. 2 / 3)", () => {
    render(<BrandedReport report={rockefellerReport()} />);
    const breakdown = screen.getByTestId("report-sections");
    // q1=3, q2=1, q3=2 with max=3 each → "3 / 3", "1 / 3", "2 / 3"
    expect(breakdown.textContent).toContain("3 / 3");
    expect(breakdown.textContent).toContain("1 / 3");
    expect(breakdown.textContent).toContain("2 / 3");
  });

  it("renders plain value (no 'value / max') in per-question cells when questionsByKey has no max", () => {
    const report = rockefellerReport();
    // Strip max from all entries
    report.questionsByKey = {
      q1: { type: "SLIDER_LIKERT", label: "Members understand each other's styles", sectionStableKey: "s1" },
      q2: { type: "SLIDER_LIKERT", label: "Insights shared at weekly exec meeting", sectionStableKey: "s1" },
      q3: { type: "SLIDER_LIKERT", label: "All employees collect customer data", sectionStableKey: "s1" },
    };
    render(<BrandedReport report={report} />);
    // Check that per-question rating cells show plain numbers without a denominator.
    // We look for the rate spans specifically — q1=3, q2=1, q3=2.
    // The section chip "achievedCount / totalCount" is expected; we only care
    // that the rate cells themselves don't have "3 / 3" etc.
    const rateSpans = document.querySelectorAll(".su-report-q-rate");
    for (const span of rateSpans) {
      expect(span.textContent).not.toMatch(/\/ \d+/);
    }
    // Numeric values still appear in rate spans
    const rateTexts = Array.from(rateSpans).map((s) => s.textContent);
    expect(rateTexts).toContain("3");
    expect(rateTexts).toContain("1");
    expect(rateTexts).toContain("2");
  });

  it("groups questions under their section card via sectionStableKey (no sections[].questions needed)", () => {
    // Build a report where sections[] has NO embedded questions arrays,
    // but questionsByKey has sectionStableKey set — grouping must still work.
    const result: ScoreResult = {
      perQuestion: [
        { stableKey: "q1", value: 2, achieved: true },
        { stableKey: "q2", value: 1, achieved: false },
      ],
      perSection: [
        {
          stableKey: "sec_a",
          name: "Section A",
          totalPoints: 3,
          averagePoints: 1.5,
          achievedCount: 1,
          totalCount: 2,
        },
      ],
      overallTotal: 3,
      overallAverage: 1.5,
      countAchieved: 1,
      tier: { label: "OK", message: "" },
      tierMetricValue: 1.5,
      unansweredKeys: [],
    };
    const report = baseReport({
      result,
      // sections has NO questions array — grouping must use sectionStableKey
      sections: [{ stableKey: "sec_a", name: "Section A" }],
      questionByKey: {
        q1: "Alpha question",
        q2: "Beta question",
      },
      questionsByKey: {
        q1: { type: "SLIDER_LIKERT", label: "Alpha question", sectionStableKey: "sec_a", min: 0, max: 5 },
        q2: { type: "SLIDER_LIKERT", label: "Beta question", sectionStableKey: "sec_a", min: 0, max: 5 },
      },
      rawAnswers: [
        { stableKey: "q1", value: 2 },
        { stableKey: "q2", value: 1 },
      ],
      scoringConfig: { tierMetric: "overallAvg", passThreshold: 0, tiers: [{ minMetric: 0, label: "OK", message: "" }] },
    });
    render(<BrandedReport report={report} />);
    const breakdown = screen.getByTestId("report-sections");
    // Both questions should appear grouped under section "sec_a"
    expect(breakdown.textContent).toContain("Alpha question");
    expect(breakdown.textContent).toContain("Beta question");
    // Ratings rendered as value/max
    expect(breakdown.textContent).toContain("2 / 5");
    expect(breakdown.textContent).toContain("1 / 5");
    // Orphan list should be empty (no questions outside a section)
    expect(breakdown.querySelector(".su-report-orphan-list")).toBeNull();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Scores table (G3 — no team average)
// ════════════════════════════════════════════════════════════════════════════

describe("BrandedReport — scores table", () => {
  it("renders a section / your-score / your-average table", () => {
    render(<BrandedReport report={rockefellerReport()} />);
    const table = screen.getByTestId("report-scores-table");
    expect(table.textContent).toContain("The executive team is healthy");
    expect(table.textContent).toContain("6"); // totalPoints
    expect(table.textContent).toContain("2"); // averagePoints
    // headers
    expect(table.textContent?.toLowerCase()).toContain("your score");
    expect(table.textContent?.toLowerCase()).toContain("your average");
  });

  it("has NO team / cohort average column (G3)", () => {
    render(<BrandedReport report={rockefellerReport()} />);
    const table = screen.getByTestId("report-scores-table");
    const lower = (table.textContent ?? "").toLowerCase();
    expect(lower).not.toContain("team avg");
    expect(lower).not.toContain("team average");
    expect(lower).not.toContain("cohort");
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Recommendations
// ════════════════════════════════════════════════════════════════════════════

describe("BrandedReport — recommendations", () => {
  it("SU Full: renders a recommendations section grouped by section", () => {
    render(<BrandedReport report={suFullReport()} />);
    const recs = screen.getByTestId("report-recommendations");
    expect(recs.textContent).toContain("Tighten your weekly meeting rhythm.");
  });

  it("Rockefeller: no recommendations → no recommendations section", () => {
    render(<BrandedReport report={rockefellerReport()} />);
    expect(
      screen.queryByTestId("report-recommendations"),
    ).not.toBeInTheDocument();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Additional (non-slider) responses (H9)
// ════════════════════════════════════════════════════════════════════════════

describe("BrandedReport — additional responses (H9)", () => {
  it("renders TEXT / NUMBER / MULTI_CHOICE answers from rawAnswers", () => {
    const report = baseReport({
      assessmentName: "Leadership Vision Alignment",
      result: {
        perQuestion: [{ stableKey: "q1", value: 3, achieved: true }],
        perSection: [
          {
            stableKey: "s1",
            name: "Vision",
            totalPoints: 3,
            averagePoints: 3,
            achievedCount: 1,
            totalCount: 1,
          },
        ],
        overallTotal: 3,
        overallAverage: 3,
        countAchieved: 1,
        tier: { label: "Submitted", message: "" },
        tierMetricValue: 3,
        unansweredKeys: [],
      },
      sections: [
        { stableKey: "s1", name: "Vision", questions: [{ stableKey: "q1" }] },
      ],
      questionByKey: {
        q1: "Slider question",
        t1: "What is your biggest goal?",
        n1: "Years in role",
        m1: "Which apply?",
      },
      questionsByKey: {
        q1: { type: "SLIDER_LIKERT", label: "Slider question" },
        t1: { type: "TEXT", label: "What is your biggest goal?" },
        n1: { type: "NUMBER", label: "Years in role" },
        m1: { type: "MULTI_CHOICE", label: "Which apply?" },
      },
      rawAnswers: [
        { stableKey: "q1", value: 3 },
        { stableKey: "t1", value: "Grow to $10M" },
        { stableKey: "n1", value: 7 },
        { stableKey: "m1", value: ["Sales", "Ops"] },
      ],
      scoringConfig: {
        tierMetric: "overallAvg",
        passThreshold: 0,
        tiers: [{ minMetric: 0, label: "Submitted", message: "" }],
      },
    });
    render(<BrandedReport report={report} />);
    const extra = screen.getByTestId("report-additional");
    expect(extra.textContent).toContain("What is your biggest goal?");
    expect(extra.textContent).toContain("Grow to $10M");
    expect(extra.textContent).toContain("Years in role");
    expect(extra.textContent).toContain("7");
    expect(extra.textContent).toContain("Which apply?");
    // array stringified
    expect(extra.textContent).toContain("Sales");
    expect(extra.textContent).toContain("Ops");
    // the slider answer must NOT appear in additional responses
    expect(extra.textContent).not.toContain("Slider question");
  });

  it("absent when there are no non-slider answers", () => {
    render(<BrandedReport report={rockefellerReport()} />);
    expect(screen.queryByTestId("report-additional")).not.toBeInTheDocument();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Conclusion + footer + provenance
// ════════════════════════════════════════════════════════════════════════════

describe("BrandedReport — conclusion + footer", () => {
  it("renders a coach CTA as text and a footer with provenance + confidential note", () => {
    render(<BrandedReport report={rockefellerReport()} />);
    expect(screen.getByTestId("report-conclusion").textContent).toMatch(
      /Scaling Up Certified Coach/i,
    );
    const footer = screen.getByTestId("report-footer");
    expect(footer.textContent).toContain("sub-123");
    expect(footer.textContent).toContain("ver-456");
    // short content hash
    expect(footer.textContent).toContain("abcdef0");
    expect(footer.textContent).toContain("Confidential");
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Robustness (H10)
// ════════════════════════════════════════════════════════════════════════════

describe("BrandedReport — robustness (H10)", () => {
  it("missing question label → renders the stableKey + '(unmapped)', no crash", () => {
    const report = rockefellerReport();
    // q3 present in perQuestion but absent from questionByKey
    report.questionByKey = {
      q1: "Members understand each other's styles",
      q2: "Insights shared at weekly exec meeting",
    };
    report.questionsByKey = {
      q1: { type: "SLIDER_LIKERT", label: "Members understand each other's styles" },
      q2: { type: "SLIDER_LIKERT", label: "Insights shared at weekly exec meeting" },
    };
    render(<BrandedReport report={report} />);
    const breakdown = screen.getByTestId("report-sections");
    expect(breakdown.textContent).toContain("q3");
    expect(breakdown.textContent).toContain("(unmapped)");
  });

  it("degraded report → renders a non-blocking notice but still renders the cover", () => {
    const report = baseReport({ degraded: true, result: rockefellerReport().result });
    render(<BrandedReport report={report} />);
    expect(screen.getByTestId("report-degraded-notice")).toBeInTheDocument();
    expect(screen.getByTestId("report-cover")).toBeInTheDocument();
  });
});
