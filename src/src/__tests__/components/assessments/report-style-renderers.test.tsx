import { render, screen, within } from "@testing-library/react";

import { BrandedReport } from "@/components/assessments/BrandedReport";
import { ExecutiveBoardroomReport } from "@/components/assessments/report-styles/ExecutiveBoardroomReport";
import { ModernDashboardReport } from "@/components/assessments/report-styles/ModernDashboardReport";
import { REPORT_STYLE_PREVIEW_FIXTURE } from "@/lib/assessments/report-style-preview-fixture";
import type { RespondentReport } from "@/lib/assessments/respondent-report";
import type { ScoreResult } from "@/lib/assessments/scoring";

function scalingUpFullReport(
  reportStyle: "CLASSIC" | "EXECUTIVE_BOARDROOM" | "MODERN_DASHBOARD" | string,
): RespondentReport {
  const decisions = REPORT_STYLE_PREVIEW_FIXTURE.decisions;
  return {
    respondentName: "Safe Test Name",
    respondentEmail: "safe@example.test",
    jobTitle: "CEO",
    companyName: "Example Co",
    assessmentName: "Scaling Up Full",
    templateAlias: "scaling-up-full",
    reportStyle,
    campaignLabel: "Planning",
    submittedAt: new Date("2026-01-15T12:00:00.000Z"),
    result: {
      perQuestion: [],
      perSection: [],
      perDomain: decisions.map((decision) => ({
        key: decision.stableKey,
        label: decision.label,
        averagePoints: decision.averageAcrossSections ?? 0,
        answeredSectionCount: 1,
        totalSectionCount: 1,
        tier: null,
      })),
      overallTotal: 136,
      overallAverage: 6.8,
      countAchieved: 0,
      tier: null,
      tierMetricValue: 6.8,
      scaleUpScore: 68,
      unansweredKeys: [],
    } as ScoreResult,
    sections: [],
    questionByKey: {},
    questionsByKey: {},
    rawAnswers: [],
    scoringConfig: {},
    provenance: {
      submissionId: "campaign-safe-id",
      versionId: "version-safe-id",
      contentHash: "hash-safe",
      templateName: "Scaling Up Full",
    },
    degraded: false,
  };
}

describe("curated report renderers", () => {
  it.each([
    ["EXECUTIVE_BOARDROOM", "executive-boardroom-report"],
    ["MODERN_DASHBOARD", "modern-dashboard-report"],
  ] as const)("selects %s only with a server-authoritative availability decision", (reportStyle, renderer) => {
    const { rerender } = render(
      <BrandedReport
        report={scalingUpFullReport(reportStyle)}
        reportStylesAvailable
      />,
    );
    expect(screen.getByTestId(renderer)).toBeInTheDocument();

    rerender(<BrandedReport report={scalingUpFullReport(reportStyle)} />);
    expect(screen.queryByTestId(renderer)).toBeNull();
    expect(screen.getByTestId("report-cover")).toBeInTheDocument();
  });

  it("retains the legacy Classic renderer for Classic, unavailable, and invalid selections", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const { rerender } = render(
      <BrandedReport
        report={scalingUpFullReport("CLASSIC")}
        reportStylesAvailable
      />,
    );
    expect(screen.getByTestId("report-cover")).toBeInTheDocument();

    rerender(
      <BrandedReport
        report={scalingUpFullReport("NOT_A_STYLE")}
        reportStylesAvailable
      />,
    );
    expect(screen.getByTestId("report-cover")).toBeInTheDocument();
    expect(warn).toHaveBeenCalledWith(
      "assessment.report_style.invalid",
      expect.objectContaining({
        provenanceId: "campaign-safe-id",
        templateAlias: "scaling-up-full",
        invalidStyle: "NOT_A_STYLE",
      }),
    );
    expect(JSON.stringify(warn.mock.calls)).not.toContain("Safe Test Name");
    expect(JSON.stringify(warn.mock.calls)).not.toContain("safe@example.test");
    warn.mockRestore();
  });

  it("keeps canonical report facts aligned across the two curated compositions", () => {
    const { container: executive } = render(
      <ExecutiveBoardroomReport view={REPORT_STYLE_PREVIEW_FIXTURE} />,
    );
    const { container: dashboard } = render(
      <ModernDashboardReport view={REPORT_STYLE_PREVIEW_FIXTURE} />,
    );

    for (const container of [executive, dashboard]) {
      const report = within(container);
      expect(report.getByRole("heading", { name: "Scaling Up Full" })).toBeInTheDocument();
      expect(report.getByText("68 / 100")).toBeInTheDocument();
      expect(report.getByText("Create a weekly cash conversion review with one owner for receivables, inventory, and commitments. Use the first two cycles to identify where decisions wait unnecessarily, then publish a small operating rule that keeps those decisions moving without adding another meeting to every calendar.")).toBeInTheDocument();
      expect(report.getByRole("link", { name: "Talk to a Coach →" })).toHaveAttribute(
        "href",
        "https://scalingup.com/coaches",
      );
      for (const decision of REPORT_STYLE_PREVIEW_FIXTURE.decisions) {
        expect(report.getByTestId(`report-style-decision-${decision.stableKey}`)).toHaveTextContent(
          `${decision.label}: ${decision.averageAcrossSectionsLabel}`,
        );
      }
    }
  });
});
