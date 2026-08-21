import { render, screen } from "@testing-library/react";
import { BrandedReport } from "@/components/assessments/BrandedReport";
import { QualitativeReport } from "@/components/assessments/QualitativeReport";
import type { RespondentReport } from "@/lib/assessments/respondent-report";
import type { ScoreResult } from "@/lib/assessments/scoring";

function report(
  overrides: Partial<RespondentReport> = {},
): RespondentReport {
  const result: ScoreResult = {
    perQuestion: [{ stableKey: "q1", value: 3, achieved: true }],
    perSection: [{
      stableKey: "s1",
      name: "Generated detail",
      totalPoints: 3,
      averagePoints: 3,
      achievedCount: 1,
      totalCount: 1,
    }],
    overallTotal: 3,
    overallAverage: 3,
    countAchieved: 1,
    tier: { label: "Strong", message: "Generated result" },
    tierMetricValue: 1,
    unansweredKeys: [],
  };
  return {
    respondentName: "Alex Doe",
    respondentEmail: "alex@example.com",
    jobTitle: null,
    companyName: "Acme",
    assessmentName: "Rockefeller Habits Checklist",
    templateAlias: "RockHabits",
    reportStyle: "CLASSIC",
    campaignLabel: null,
    submittedAt: new Date("2026-08-20T00:00:00Z"),
    result,
    sections: [{ stableKey: "s1", name: "Generated detail" }],
    questionByKey: { q1: "Generated question" },
    questionsByKey: {
      q1: {
        type: "SLIDER_LIKERT",
        label: "Generated question",
        sectionStableKey: "s1",
        min: 0,
        max: 3,
      },
    },
    rawAnswers: [{ stableKey: "q1", value: 3 }],
    scoringConfig: {},
    provenance: {
      submissionId: "sub-1",
      versionId: "version-1",
      contentHash: "hash-1",
      templateName: "Rockefeller Habits Checklist",
    },
    degraded: false,
    ...overrides,
  };
}

describe("classic scored report HTML regions", () => {
  it("inserts the introduction after the cover and replaces the conclusion", () => {
    render(<BrandedReport report={report({
      reportHtml: {
        introductionHtml: "<div><h2>Custom introduction</h2></div>",
        conclusionHtml: '<div><a href="https://scalingup.com">Custom CTA</a></div>',
      },
    })} />);

    expect(screen.getByText("Custom introduction")).toBeInTheDocument();
    expect(screen.getByText("Custom CTA")).toBeInTheDocument();
    expect(screen.queryByText(/Keep Scaling/)).not.toBeInTheDocument();
    expect(screen.getByTestId("report-footer")).toBeInTheDocument();

    const cover = screen.getByTestId("report-cover");
    const intro = screen.getByTestId("report-html-introduction");
    const overall = screen.getByTestId("report-overall");
    expect(cover.compareDocumentPosition(intro) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(intro.compareDocumentPosition(overall) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("preserves defaults for null fragments and replaces each region independently", () => {
    const { rerender } = render(<BrandedReport report={report({
      reportHtml: { introductionHtml: null, conclusionHtml: null },
    })} />);
    expect(screen.getByText(/Keep Scaling/)).toBeInTheDocument();
    expect(screen.queryByTestId("report-html-introduction")).not.toBeInTheDocument();

    rerender(<BrandedReport report={report({
      reportHtml: {
        introductionHtml: "<p>Intro only</p>",
        conclusionHtml: null,
      },
    })} />);
    expect(screen.getByText("Intro only")).toBeInTheDocument();
    expect(screen.getByText(/Keep Scaling/)).toBeInTheDocument();
  });
});

describe("qualitative report HTML regions", () => {
  const qualitative = (reportHtml: RespondentReport["reportHtml"]) => report({
    assessmentName: "Leadership Vision Alignment",
    templateAlias: "leadership-vision-alignment",
    sections: [],
    questionsByKey: {},
    rawAnswers: [],
    reportHtml,
  });

  it("replaces the preface and conclusion while keeping the footer", () => {
    render(<QualitativeReport report={qualitative({
      introductionHtml: "<p>Qualitative introduction</p>",
      conclusionHtml: "<p>Qualitative CTA</p>",
    })} />);

    expect(screen.getByText("Qualitative introduction")).toBeInTheDocument();
    expect(screen.getByText("Qualitative CTA")).toBeInTheDocument();
    expect(screen.queryByTestId("qual-preface")).not.toBeInTheDocument();
    expect(screen.queryByTestId("report-conclusion")).not.toBeInTheDocument();
    expect(screen.getByTestId("report-footer")).toBeInTheDocument();
  });

  it("preserves both defaults when fragments are null", () => {
    render(<QualitativeReport report={qualitative({
      introductionHtml: null,
      conclusionHtml: null,
    })} />);

    expect(screen.getByTestId("qual-preface")).toBeInTheDocument();
    expect(screen.getByTestId("report-conclusion")).toBeInTheDocument();
  });
});
