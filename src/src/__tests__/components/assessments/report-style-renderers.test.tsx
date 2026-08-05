import { render, screen, within } from "@testing-library/react";

import { BrandedReport } from "@/components/assessments/BrandedReport";
import { ExecutiveBoardroomReport } from "@/components/assessments/report-styles/ExecutiveBoardroomReport";
import { ModernDashboardReport } from "@/components/assessments/report-styles/ModernDashboardReport";
import { REPORT_STYLE_PREVIEW_FIXTURE } from "@/lib/assessments/report-style-preview-fixture";
import type { RespondentReport } from "@/lib/assessments/respondent-report";
import type { ScoreResult } from "@/lib/assessments/scoring";
import type { ScoredReportViewModel } from "@/lib/assessments/scored-report-view-model";

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
    const completeView: ScoredReportViewModel = {
      ...REPORT_STYLE_PREVIEW_FIXTURE,
      identity: {
        ...REPORT_STYLE_PREVIEW_FIXTURE.identity,
        respondentEmail: "alex@example.com",
      },
      orphanQuestions: [{
        stableKey: "orphan-check",
        label: "Unassigned operating check",
        unmapped: false,
        value: 4,
        maximum: 10,
        scoreLabel: "4 / 10",
        achieved: false,
        achievementMarker: { symbol: "✕", label: "not achieved" },
      }],
      recommendations: [
        ...REPORT_STYLE_PREVIEW_FIXTURE.recommendations,
        { sectionStableKey: "people", label: "People", items: [{ stableKey: "people-finding", text: "Resolve the frozen People finding." }] },
      ],
      coach: { name: "Morgan Coach", logoUrl: "https://cdn.example.test/coach.png" },
      provenance: { submissionId: "sub-complete", versionId: "ver-complete", contentHash: "hash-complete", templateName: "Scaling Up Full", imported: true },
      degraded: true,
    };
    const { container: executive } = render(
      <ExecutiveBoardroomReport view={completeView} />,
    );
    const { container: dashboard } = render(
      <ModernDashboardReport view={completeView} />,
    );

    for (const container of [executive, dashboard]) {
      const report = within(container);
      expect(report.getByRole("heading", { name: "Scaling Up Full" })).toBeInTheDocument();
      expect(report.getByText(/Chief Executive Officer/)).toBeInTheDocument();
      expect(report.getByText("alex@example.com")).toBeInTheDocument();
      expect(report.getAllByText("68 / 100").length).toBeGreaterThan(0);
      const summary = report.getByRole("region", { name: "Report summary" });
      expect(summary).toHaveTextContent("Total points136");
      expect(summary).toHaveTextContent("Answered items20");
      expect(summary).toHaveTextContent("Sections5");
      expect(report.getByTestId("report-style-strength-you")).toHaveTextContent("You: 8");
      expect(report.getByTestId("report-style-priority-cash")).toHaveTextContent("Cash: 5.5");
      expect(report.getByText("Create a weekly cash conversion review with one owner for receivables, inventory, and commitments. Use the first two cycles to identify where decisions wait unnecessarily, then publish a small operating rule that keeps those decisions moving without adding another meeting to every calendar.")).toBeInTheDocument();
      expect(report.getByText("Resolve the frozen People finding.")).toBeInTheDocument();
      const orphan = report.getByTestId("report-style-question-orphan-check");
      expect(orphan).toHaveTextContent("Unassigned operating check");
      expect(orphan).toHaveTextContent("4 / 10");
      expect(orphan).toHaveTextContent(/not achieved/i);
      expect(report.getByText("Coached by Morgan Coach")).toBeInTheDocument();
      expect(report.getByText(/Keep Scaling, Alex/i)).toBeInTheDocument();
      expect(report.getByRole("status")).toHaveTextContent(/could not be fully read/i);
      expect(report.getByText(/sub-complete.*ver-complete.*hash-complete/i)).toBeInTheDocument();
      expect(report.getByText(/What would make the biggest difference this quarter/i)).toBeInTheDocument();
      expect(report.getByText(/A shared rhythm for turning strategic choices/i)).toBeInTheDocument();
      expect(report.getByRole("link", { name: "Talk to a Coach →" })).toHaveAttribute(
        "href",
        "https://scalingup.com/coaches",
      );
      for (const decision of completeView.decisions) {
        const decisionNode = report.getByTestId(`report-style-decision-${decision.stableKey}`);
        expect(decisionNode).toHaveTextContent(`${decision.label}: ${decision.averageAcrossSectionsLabel}`);
        expect(decisionNode).toHaveTextContent(`${decision.totalPointsLabel} total points`);
      }
      for (const section of completeView.sections) {
        const sectionNode = report.getByTestId(`report-style-section-${section.stableKey}`);
        expect(sectionNode).toHaveTextContent(section.label);
        expect(sectionNode).toHaveTextContent(section.totalPointsLabel);
        expect(sectionNode).toHaveTextContent(section.averagePointsLabel);
        expect(sectionNode).toHaveTextContent(`${section.achievedCount} of ${section.totalCount} achieved`);
        for (const question of section.questions) {
          expect(report.getByTestId(`report-style-question-${question.stableKey}`)).toHaveTextContent(`${question.label}${question.scoreLabel}`);
        }
        expect(report.getByTestId(`report-style-scorecard-${section.stableKey}`)).toHaveTextContent(section.totalPointsLabel);
      }
    }
  });

  it("keeps every Classic/fallback decision byte-identical to its absent-prop legacy baseline", () => {
    const html = (report: RespondentReport, props: Record<string, unknown> = {}) => {
      const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
      const { container, unmount } = render(<BrandedReport report={report} {...props} />);
      const value = container.innerHTML;
      unmount();
      warn.mockRestore();
      return value;
    };
    const classic = scalingUpFullReport("CLASSIC");
    expect(html(classic, { reportStylesAvailable: false })).toBe(html(classic));
    expect(html(classic, { reportStylesAvailable: true })).toBe(html(classic));
    const rolloutOff = scalingUpFullReport("EXECUTIVE_BOARDROOM");
    expect(html(rolloutOff, { reportStylesAvailable: false })).toBe(html(rolloutOff));
    const invalid = scalingUpFullReport("NOT_A_STYLE");
    expect(html(invalid, { reportStylesAvailable: true })).toBe(html(invalid));
    const ineligible = { ...scalingUpFullReport("MODERN_DASHBOARD"), templateAlias: "scaling-up-full-v2" };
    expect(html(ineligible, { reportStylesAvailable: true })).toBe(html(ineligible));
    const qualitative = { ...scalingUpFullReport("MODERN_DASHBOARD"), templateAlias: "leadership-vision-alignment" };
    expect(html(qualitative, { reportStylesAvailable: true, reportFindingsAvailable: false })).toBe(html(qualitative));
  });
});
