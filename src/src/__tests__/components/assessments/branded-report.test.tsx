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
import { renderToStaticMarkup } from "react-dom/server";
import { BrandedReport } from "@/components/assessments/BrandedReport";
import type { RespondentReport } from "@/lib/assessments/respondent-report";
import type { ScoreResult } from "@/lib/assessments/scoring";
import type { ReportComparisonModel } from "@/lib/assessments/report-comparison-model";
import {
  completeSuFullBenchmarkRows,
  completeSuFullPeerReport,
} from "@/__tests__/fixtures/su-full-peer";
import { buildSuFullPeerPresentationResult } from "@/lib/assessments/su-full-peer-presentation";
import { loadSafeReportHtml } from "@/lib/assessments/report-html";

// ── Fixture builders ───────────────────────────────────────────────────────

function baseReport(overrides: Partial<RespondentReport> = {}): RespondentReport {
  return {
    respondentName: "Sarah Chen",
    respondentEmail: "sarah@example.com",
    jobTitle: "Chief Executive Officer",
    companyName: "Northwind Logistics",
    assessmentName: "Rockefeller Habits Checklist",
    // Required on RespondentReport. "" resolves to DEFAULT_REPORT_CONFIG, which
    // is exactly what omitting it used to do — so these fixtures are unchanged
    // in behaviour. Cases that need a real instrument override it.
    templateAlias: "",
    campaignLabel: null,
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
    reportStyle: overrides.reportStyle ?? "CLASSIC",
  };
}

describe("BrandedReport — respondent identity and next steps", () => {
  it("personalizes report HTML on the Classic fallback path", () => {
    render(
      <BrandedReport
        report={baseReport({
          reportHtml: loadSafeReportHtml({
            reportHtml: {
              schemaVersion: 1,
              introductionHtml: "<p>Dear {{respondentName}} from {{companyName}}</p>",
              conclusionHtml: null,
            },
          }),
        })}
      />,
    );

    expect(screen.getByTestId("report-html-introduction")).toHaveTextContent(
      "Dear Sarah Chen from Northwind Logistics",
    );
    expect(screen.queryByText(/\{\{respondentName\}\}/)).not.toBeInTheDocument();
  });

  it("shows the taker's email and both next-step links", () => {
    render(
      <BrandedReport
        report={rockefellerReport()}
        contactEmail="coach@example.com"
      />,
    );

    expect(screen.getByText(/sarah@example\.com/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /learn more/i })).toHaveAttribute(
      "href",
      "https://scalingup.com",
    );
    expect(
      screen.getByRole("link", { name: /talk to a coach/i }),
    ).toHaveAttribute("href", "mailto:coach%40example.com");
  });

  it("falls back to the certified-coach directory when no verified email exists", () => {
    render(<BrandedReport report={rockefellerReport()} />);

    expect(
      screen.getByRole("link", { name: /talk to a coach/i }),
    ).toHaveAttribute("href", "https://scalingup.com/coaches");
  });

  it("renders the three source actions for a SunHub public result", () => {
    render(
      <BrandedReport
        report={baseReport({
          ...rockefellerReport(),
          templateAlias: "sunhub-quick-quiz",
          publicLeadActions: true,
          reportStyle: "MODERN_DASHBOARD",
        })}
        reportStylesAvailable
      />,
    );

    expect(
      screen.getByRole("link", { name: "Take the 32-question assessment" }),
    ).toHaveAttribute("href", "https://scalinguptoolkit.com/s/ScaleUpQA");
    expect(
      screen.getByRole("link", { name: "Request a complimentary follow-up" }),
    ).toHaveAttribute(
      "href",
      "https://coaches.scalingup.com/coach-match-after-assessment-form",
    );
    expect(screen.getByRole("link", { name: "Buy the books" })).toHaveAttribute(
      "href",
      "https://scalingup.com/book/",
    );
    expect(screen.queryByRole("link", { name: /learn more/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /find a coach/i })).not.toBeInTheDocument();
    expect(screen.queryByTestId("report-sections")).not.toBeInTheDocument();
    expect(screen.queryByTestId("report-scores-table")).not.toBeInTheDocument();
    expect(screen.queryByTestId("modern-dashboard-report")).not.toBeInTheDocument();
    expect(screen.queryByText("Total points")).not.toBeInTheDocument();
    expect(screen.queryByText("Average per item")).not.toBeInTheDocument();
    expect(screen.queryByText("Sections")).not.toBeInTheDocument();
  });
});

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
  it("adds comparison facts to Classic only when a server-authorized model is supplied", () => {
    const comparison: ReportComparisonModel = {
      baseline: {
        submissionId: "previous-submission",
        campaignId: "previous-campaign",
        campaignLabel: "Q1 2025",
        submittedAt: new Date("2025-03-31T12:00:00.000Z"),
        versionId: "version-1",
        versionNumber: 1,
        isImported: false,
      },
      sameVersion: true,
      overall: { current: 72, previous: 64, delta: 8, status: "comparable" },
      domains: { people: { current: 7, previous: 6, delta: 1, status: "comparable" } },
      sections: { s_people: { current: 7, previous: 6, delta: 1, status: "comparable" } },
      questions: { q1: { current: 7, previous: 5, delta: 2, status: "comparable" } },
      coverage: {
        currentQuestionCount: 1,
        matchedQuestionCount: 1,
        unmatchedCurrentCount: 0,
        baselineOnlyCount: 0,
      },
    };

    const { container } = render(<BrandedReport report={suFullReport()} comparison={comparison} />);
    const comparisonContent = screen.getByTestId("report-comparison-content");

    expect(within(screen.getByTestId("report-cover")).getByText("Compared with Q1 2025 · submitted Mar 31, 2025")).toBeInTheDocument();
    expect(comparisonContent).toHaveTextContent("ScaleUp score");
    expect(comparisonContent).toHaveTextContent("Weekly strategic thinking meeting");
    expect(comparisonContent.compareDocumentPosition(screen.getByTestId("report-sections")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(container.querySelector(".su-report-comparison-controls")).not.toBeInTheDocument();
  });

  it("keeps the representative Scaling Up Full Classic DOM unchanged when styles are unavailable", () => {
    expect(
      renderToStaticMarkup(
        <BrandedReport report={suFullReport()} />,
      ),
    ).toMatchSnapshot();
  });

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

  it("cover title shows the instrument name (template.name), not the campaign label", () => {
    const report = rockefellerReport();
    // assessmentName = instrument; campaignLabel = coach's distinct label
    report.campaignLabel = "Acme Corp Q2 2026";
    render(<BrandedReport report={report} />);
    const cover = screen.getByTestId("report-cover");
    expect(cover.textContent).toContain("Rockefeller Habits Checklist");
    // Campaign label appears as subtitle
    expect(screen.getByTestId("report-campaign-label").textContent).toBe(
      "Acme Corp Q2 2026",
    );
  });

  it("campaign-label subtitle is absent when campaignLabel is null", () => {
    const report = rockefellerReport();
    report.campaignLabel = null;
    render(<BrandedReport report={report} />);
    expect(screen.queryByTestId("report-campaign-label")).not.toBeInTheDocument();
  });

  it("campaign-label subtitle is absent when campaignLabel equals assessmentName (no redundant duplicate)", () => {
    const report = rockefellerReport();
    // Same string as assessmentName — should be suppressed
    report.campaignLabel = "Rockefeller Habits Checklist";
    render(<BrandedReport report={report} />);
    expect(screen.queryByTestId("report-campaign-label")).not.toBeInTheDocument();
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
    // section chip present when achievement is meaningful (passThreshold > 0)
    expect(
      breakdown.querySelectorAll(".su-report-card-chip").length,
    ).toBeGreaterThan(0);
  });

  it("neutral (passThreshold===0): shows ratings, NO checkmarks", () => {
    render(<BrandedReport report={neutralReport()} />);
    const breakdown = screen.getByTestId("report-sections");
    expect(breakdown.textContent).toContain("We have a clear top priority");
    expect(within(breakdown).queryAllByTestId("achieved-marker").length).toBe(0);
    // Greptile P1: the section chip (achievedCount/totalCount) is also suppressed
    // for neutral templates — otherwise it shows a meaningless "N / N".
    expect(breakdown.querySelectorAll(".su-report-card-chip").length).toBe(0);
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

  it("keeps non-slider snapshot findings when peer details replace slider recommendations", () => {
    const report = completeSuFullPeerReport();
    const built = buildSuFullPeerPresentationResult({
      report,
      benchmarks: completeSuFullBenchmarkRows(),
    });
    if (built.status !== "ready") throw new Error(built.reason);

    render(
      <BrandedReport
        report={{
          ...report,
          result: {
            ...report.result,
            findings: [
              {
                stableKey: "BACKGROUND_FTE",
                questionType: "NUMBER",
                questionLabel: "Employee count",
                text: "Keep the non-slider finding visible.",
              },
            ],
          } as ScoreResult,
          suFullPeerPresentation: built.presentation,
        }}
        reportFindingsAvailable
      />,
    );

    expect(screen.getByTestId("report-recommendations")).toHaveTextContent(
      "Keep the non-slider finding visible.",
    );
    expect(screen.getAllByText("Esperto feedback Q01")).toHaveLength(1);
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

  it("resolves MULTI_CHOICE option KEYS to labels (Wave T launch-found fix, C-H1 parity)", () => {
    const report = baseReport({
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
      questionByKey: { q1: "Slider question", m1: "Pick your top two obstacles" },
      questionsByKey: {
        q1: { type: "SLIDER_LIKERT", label: "Slider question" },
        m1: {
          type: "MULTI_CHOICE",
          label: "Pick your top two obstacles",
          options: [
            { key: "cash", label: "Cash" },
            { key: "strategy", label: "Strategy" },
            { key: "sales", label: "Sales" },
          ],
        },
      },
      rawAnswers: [
        { stableKey: "q1", value: 3 },
        { stableKey: "m1", value: ["cash", "strategy", "unknown_key"] },
      ],
      scoringConfig: {
        tierMetric: "overallAvg",
        passThreshold: 0,
        tiers: [{ minMetric: 0, label: "Submitted", message: "" }],
      },
    });
    render(<BrandedReport report={report} />);
    const extra = screen.getByTestId("report-additional");
    // Stored keys resolved to labels…
    expect(extra.textContent).toContain("Cash, Strategy");
    // …raw keys never leak…
    expect(extra.textContent).not.toContain("cash,");
    // …and an unmatched key falls back to itself (degraded shapes).
    expect(extra.textContent).toContain("unknown_key");
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Conclusion + footer + provenance
// ════════════════════════════════════════════════════════════════════════════

describe("BrandedReport — conclusion + footer", () => {
  it("renders a coach CTA as text and a clean footer (#25): submission date + credit, no provenance", () => {
    render(<BrandedReport report={rockefellerReport()} />);
    expect(screen.getByTestId("report-conclusion").textContent).toMatch(
      /Talk to a Coach/i,
    );
    const footer = screen.getByTestId("report-footer");
    // #25 — credit line is exactly the platform name; no provenance metadata.
    expect(footer.textContent).toMatch(/Generated by Scaling Up Platform/);
    expect(footer.textContent).not.toContain("sub-123");
    expect(footer.textContent).not.toContain("ver-456");
    expect(footer.textContent).not.toContain("abcdef0");
    expect(footer.textContent).not.toContain("Confidential");
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

// ════════════════════════════════════════════════════════════════════════════
// SU-Full per-respondent tier-band suppression (ADR-0015)
// ════════════════════════════════════════════════════════════════════════════

describe("BrandedReport — SU-Full per-respondent tier suppression (ADR-0015)", () => {
  /**
   * SU Full has no tier band (ADR-0015: Esperto shows none; standing is
   * peer-deviation, not a LOW/GOOD/TOP band). report-config keys this off the
   * alias via `showTier:false`; BrandedReport honors it. The ScaleUp score
   * ring/number and everything else still render — only the band + tier
   * message are suppressed.
   */
  it("hides the tier band + tier message when showTier is false (scaling-up-full)", () => {
    // templateAlias drives reportConfigFor() — "scaling-up-full" selects the
    // showTier:false entry. Without it, the DEFAULT config (showTier:true) would
    // be exercised and the band would render.
    render(
      <BrandedReport report={{ ...suFullReport(), templateAlias: "scaling-up-full" }} />,
    );
    // No tier band, no tier message.
    expect(screen.queryByTestId("overall-band")).toBeNull();
    const overall = screen.getByTestId("report-overall");
    expect(overall.textContent).not.toContain("Scaling");
    expect(overall.textContent).not.toContain("Solid foundation.");
    // But the ScaleUp headline still renders.
    expect(overall.textContent).toContain("72 / 100");
  });

  it("still renders the tier band for a showTier:true template (regression guard)", () => {
    // Rockefeller (DEFAULT config / showTier:true) must keep its band + message.
    render(<BrandedReport report={rockefellerReport()} />);
    expect(screen.queryByTestId("overall-band")).not.toBeNull();
    const overall = screen.getByTestId("report-overall");
    expect(overall.textContent).toContain("Strong — Scaling Well");
    expect(overall.textContent).toContain("Your team is aligned.");
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Wave P (Jeff #5) — conclusion greeting guard: an email name is never greeted
// ════════════════════════════════════════════════════════════════════════════

describe("BrandedReport — conclusion greeting guard (Wave P)", () => {
  it("greets 'Keep Scaling, there.' when respondentName is an email (blank-name fallback)", () => {
    render(
      <BrandedReport
        report={{ ...rockefellerReport(), respondentName: "jane@example.com" }}
      />,
    );
    const conclusion = screen.getByTestId("report-conclusion");
    expect(conclusion.textContent).toContain("Keep Scaling, there.");
    expect(conclusion.textContent).not.toContain("jane@example.com");
  });

  it("still greets by first name for a normal name (regression guard)", () => {
    render(
      <BrandedReport
        report={{ ...rockefellerReport(), respondentName: "Sarah Chen" }}
      />,
    );
    expect(screen.getByTestId("report-conclusion").textContent).toContain(
      "Keep Scaling, Sarah.",
    );
  });
});

// ─── PR #236 round-2 finding #10 — the orphan-separator guard was untested ────
//
// The cover subtitle used to interpolate `{companyName} · {date}` unconditionally,
// so an empty company name rendered a naked leading " · ". Wave OSR added the
// guard but nothing pinned it: reverting either renderer failed no test. The one
// live surface that exercises it is the PUBLIC quiz, which hardcodes
// `companyName: ""` (the invited path always has an org, since
// AssessmentCampaign.organizationId is NOT NULL).
describe("cover subtitle separator (empty companyName)", () => {
  function subtitleText(companyName: string): string {
    const { container } = render(
      <BrandedReport report={baseReport({ companyName })} />,
    );
    return container.querySelector(".su-report-sub")?.textContent ?? "";
  }

  it("emits no leading separator when there is no company name", () => {
    const text = subtitleText("");
    expect(text).not.toMatch(/^\s*·/);
    expect(text).not.toContain("·");
  });

  it("positive control — still separates the company name from the date", () => {
    expect(subtitleText("Northwind Logistics")).toContain("Northwind Logistics ·");
  });
});
