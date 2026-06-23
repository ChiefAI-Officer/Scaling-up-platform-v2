/**
 * Assessment v7.6 Wave E — QualitativeReport render tests (Task 10).
 *
 * The on-screen / PDF qualitative report renderer (LVA + QSP). Pure
 * presentational: consumes a RespondentReport, builds the qualitative model,
 * and renders per-section blocks (Q&A / metric table / rating / percent bar /
 * choices) — the respondent's OWN answers, NO team "Mean" column anywhere.
 *
 * These tests also exercise the dispatch in BrandedReport: a qualitative alias
 * routes to QualitativeReport; a scored alias keeps the scored anatomy.
 */

import { render, screen } from "@testing-library/react";
import { BrandedReport } from "@/components/assessments/BrandedReport";
import { QualitativeReport } from "@/components/assessments/QualitativeReport";
import type { RespondentReport } from "@/lib/assessments/respondent-report";
import type { ScoreResult } from "@/lib/assessments/scoring";

// ── Fixture builder ──────────────────────────────────────────────────────────

function baseReport(overrides: Partial<RespondentReport> = {}): RespondentReport {
  return {
    respondentName: "John CEOExec",
    jobTitle: "CEO",
    companyName: "Northwind Logistics",
    assessmentName: "Leadership Vision Alignment",
    templateAlias: "leadership-vision-alignment",
    campaignLabel: null,
    submittedAt: new Date("2026-04-30T10:00:00Z"),
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
      templateName: "Leadership Vision Alignment",
    },
    degraded: false,
    ...overrides,
  };
}

/**
 * A rich LVA-shaped report covering every presentation kind:
 *   - metric-table (S1_financials, all NUMBER incl. a real 0)
 *   - qa           (S2_vision, TEXT, one answered + one blank)
 *   - rating       (S3_strengths, SLIDER 1–3 — 16-factor pattern)
 *   - choices      (S5_explained, TEXT explanations of flagged factors)
 *   - percent-bar  (S6_focus, qa section with a rehire-% NUMBER item)
 */
function lvaReport(overrides: Partial<RespondentReport> = {}): RespondentReport {
  return baseReport({
    sections: [
      { stableKey: "S1_financials", name: "The vision on the future", description: "What you aspire the company to be in three years." },
      { stableKey: "S2_vision", name: "Looking ahead three years" },
      { stableKey: "S3_strengths", name: "Organizational strengths & weaknesses" },
      { stableKey: "S5_explained", name: "Obstacles and challenges explained" },
      { stableKey: "S6_focus", name: "Important focus areas" },
    ],
    questionsByKey: {
      // S1 — metric table
      S1_revenue: { type: "NUMBER", label: "Company's revenue in three years (in million)", sectionStableKey: "S1_financials" },
      S1_gross_margin: { type: "NUMBER", label: "Gross margin (in million)", sectionStableKey: "S1_financials" },
      // S2 — Q&A (one answered, one blank)
      S2_products: { type: "TEXT", label: "Our main Products in three years", sectionStableKey: "S2_vision" },
      S2_partners: { type: "TEXT", label: "Our main Partners in three years", sectionStableKey: "S2_vision" },
      // S3 — rating (1–3)
      S3_sales: { type: "SLIDER_LIKERT", label: "Sales", sectionStableKey: "S3_strengths", min: 1, max: 3 },
      S3_culture: { type: "SLIDER_LIKERT", label: "Culture", sectionStableKey: "S3_strengths", min: 1, max: 3 },
      // S5 — choices (TEXT explanations)
      S5_why_sales: { type: "TEXT", label: "Sales", sectionStableKey: "S5_explained" },
      // S6 — qa with a percent NUMBER
      S6_rehire: { type: "NUMBER", label: "Which percentage of the employees would you enthusiastically rehire?", sectionStableKey: "S6_focus", min: 0, max: 100 },
    },
    rawAnswers: [
      { stableKey: "S1_revenue", value: 10 },
      { stableKey: "S1_gross_margin", value: 0 },
      { stableKey: "S2_products", value: "SOFTWARE AND SERVICES" },
      { stableKey: "S2_partners", value: "   " }, // blank → omitted
      { stableKey: "S3_sales", value: 1 },
      { stableKey: "S3_culture", value: 3 },
      { stableKey: "S5_why_sales", value: "not enough sales people" },
      { stableKey: "S6_rehire", value: 100 },
    ],
    ...overrides,
  });
}

/**
 * Wave I (ADR-0014) LVA fixture WITH the obstacle gate present, exercising the
 * conditional-followup filter end-to-end through the screen renderer:
 *   - S4_obstacles holds the MULTI_CHOICE gate answered ["sales"] (NOT "cash")
 *   - S5_explained holds both S5_why_sales (checked → renders) and S5_why_cash
 *     (unchecked → gated out) with distinctive sentinel answer text.
 * A separate helper so the shared lvaReport() used by other tests is unchanged.
 */
function lvaReportWithObstacles(): RespondentReport {
  return baseReport({
    sections: [
      { stableKey: "S4_obstacles", name: "Biggest obstacles to growth" },
      { stableKey: "S5_explained", name: "Obstacles and challenges explained" },
    ],
    questionsByKey: {
      S4_biggest_obstacles: {
        type: "MULTI_CHOICE",
        label: "Pick the three biggest obstacles",
        sectionStableKey: "S4_obstacles",
        options: [
          { key: "sales", label: "Sales" },
          { key: "cash", label: "Cash" },
        ],
      },
      S5_why_sales: { type: "TEXT", label: "Why is Sales a hindrance?", sectionStableKey: "S5_explained" },
      S5_why_cash: { type: "TEXT", label: "Why is Cash a hindrance?", sectionStableKey: "S5_explained" },
    },
    rawAnswers: [
      { stableKey: "S4_biggest_obstacles", value: ["sales"] }, // only sales flagged
      { stableKey: "S5_why_sales", value: "CHECKED_SALES_TEXT" }, // checked → renders
      { stableKey: "S5_why_cash", value: "UNCHECKED_CASH_TEXT" }, // unchecked → gated out
    ],
  });
}

// ════════════════════════════════════════════════════════════════════════════
// Dispatch
// ════════════════════════════════════════════════════════════════════════════

describe("BrandedReport — qualitative dispatch", () => {
  it("routes a qualitative-alias report to the QualitativeReport renderer", () => {
    render(<BrandedReport report={lvaReport()} />);
    expect(screen.getByTestId("qualitative-report")).toBeInTheDocument();
    // The scored anatomy must NOT be present.
    expect(screen.queryByTestId("report-scores-table")).not.toBeInTheDocument();
    expect(screen.queryByTestId("report-overall")).not.toBeInTheDocument();
  });

  it("keeps the scored anatomy for a scored (default) alias", () => {
    const scored = baseReport({
      assessmentName: "Rockefeller Habits Checklist",
      templateAlias: "RockHabits",
      result: {
        perQuestion: [{ stableKey: "q1", value: 3, achieved: true }],
        perSection: [
          { stableKey: "s1", name: "Section A", totalPoints: 3, averagePoints: 3, achievedCount: 1, totalCount: 1 },
        ],
        overallTotal: 3,
        overallAverage: 3,
        countAchieved: 1,
        tier: { label: "OK", message: "" },
        tierMetricValue: 1,
        unansweredKeys: [],
      } as ScoreResult,
      sections: [{ stableKey: "s1", name: "Section A", questions: [{ stableKey: "q1" }] }],
      questionByKey: { q1: "A question" },
      questionsByKey: { q1: { type: "SLIDER_LIKERT", label: "A question", sectionStableKey: "s1" } },
      rawAnswers: [{ stableKey: "q1", value: 3 }],
      scoringConfig: {
        tierMetric: "countAchieved",
        passThreshold: 1,
        tiers: [{ minMetric: 0, label: "OK", message: "" }],
      },
    });
    render(<BrandedReport report={scored} />);
    expect(screen.queryByTestId("qualitative-report")).not.toBeInTheDocument();
    expect(screen.getByTestId("report-overall")).toBeInTheDocument();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Content
// ════════════════════════════════════════════════════════════════════════════

describe("QualitativeReport — content", () => {
  it("renders cover, preface, footer", () => {
    render(<QualitativeReport report={lvaReport()} />);
    const root = screen.getByTestId("qualitative-report");
    expect(root.textContent).toContain("Leadership Vision Alignment");
    expect(root.textContent).toContain("John CEOExec");
    // preface text-only greeting
    expect(root.textContent).toMatch(/Dear John/i);
    // footer credit
    expect(screen.getByTestId("report-footer").textContent).toMatch(
      /Generated by Scaling Up Platform/,
    );
  });

  it("renders an answered TEXT answer's text", () => {
    render(<QualitativeReport report={lvaReport()} />);
    expect(
      screen.getByTestId("qualitative-report").textContent,
    ).toContain("SOFTWARE AND SERVICES");
  });

  it("does NOT render an unanswered (blank) question", () => {
    render(<QualitativeReport report={lvaReport()} />);
    const root = screen.getByTestId("qualitative-report");
    // The answered S2 question label appears; the blank S2 partner question does not.
    expect(root.textContent).toContain("Our main Products in three years");
    expect(root.textContent).not.toContain("Our main Partners in three years");
  });

  it("renders a NUMBER 0 in the metric table (real zero is present)", () => {
    render(<QualitativeReport report={lvaReport()} />);
    const section = screen.getByTestId("qual-section-S1_financials");
    expect(section.textContent).toContain("Gross margin (in million)");
    // The 0 value is rendered.
    expect(section.textContent).toMatch(/\b0\b/);
  });

  it("does NOT render the S3 strengths matrix for LVA (it lives in the group report)", () => {
    render(<QualitativeReport report={lvaReport()} />);
    expect(screen.queryByTestId("qual-section-S3_strengths")).not.toBeInTheDocument();
  });

  it("renders Weak/Average/Strong for an all-slider 1-3 section (non-LVA)", () => {
    const report = baseReport({
      templateAlias: undefined,
      sections: [{ stableKey: "ratings", name: "Ratings" }],
      questionsByKey: { r_sales: { type: "SLIDER_LIKERT", label: "Sales", sectionStableKey: "ratings", min: 1, max: 3 } },
      rawAnswers: [{ stableKey: "r_sales", value: 1 }],
    });
    render(<QualitativeReport report={report} />);
    const section = screen.getByTestId("qual-section-ratings");
    expect(section.textContent).toMatch(/Weak/);
    expect(section.textContent).toMatch(/Strong/);
  });

  it("never shows the word 'Mean' anywhere (per-respondent only)", () => {
    const { container } = render(<QualitativeReport report={lvaReport()} />);
    expect(container.textContent).not.toMatch(/Mean/i);
  });

  // ── C-H1 — MULTI_CHOICE stored KEYS render as option LABELS ───────────────
  it("renders MULTI_CHOICE answers as option labels, not the stored keys", () => {
    const report = baseReport({
      sections: [{ stableKey: "S4_obstacles", name: "Biggest Obstacles" }],
      questionsByKey: {
        S4_biggest_obstacles: {
          type: "MULTI_CHOICE",
          label: "Pick the three biggest obstacles",
          sectionStableKey: "S4_obstacles",
          options: [
            { key: "the_leadership", label: "The Leadership" },
            { key: "culture", label: "Culture" },
            { key: "strategy", label: "Strategy" },
          ],
        },
      },
      // The stored value is the option KEYS (as persisted by scoring.ts).
      rawAnswers: [
        { stableKey: "S4_biggest_obstacles", value: ["the_leadership", "culture", "strategy"] },
      ],
    });
    render(<QualitativeReport report={report} />);
    const section = screen.getByTestId("qual-section-S4_obstacles");
    expect(section.textContent).toContain("The Leadership");
    expect(section.textContent).toContain("Culture");
    expect(section.textContent).toContain("Strategy");
    // The raw keys must not leak into the rendered output.
    expect(section.textContent).not.toContain("the_leadership");
  });

  // ── Wave I (ADR-0014) — conditional follow-up gating end-to-end ───────────
  it("renders only the checked obstacle explanation, not the unchecked one (screen)", () => {
    render(<QualitativeReport report={lvaReportWithObstacles()} />);
    const root = screen.getByTestId("qualitative-report");
    expect(root.textContent).toContain("CHECKED_SALES_TEXT");
    expect(root.textContent).not.toContain("UNCHECKED_CASH_TEXT");
  });
});
