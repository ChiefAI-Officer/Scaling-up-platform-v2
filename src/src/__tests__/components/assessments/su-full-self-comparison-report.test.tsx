import { render, screen, within } from "@testing-library/react";

import { completeSuFullLandscapePresentation, completeSuFullLandscapeReport } from "@/__tests__/fixtures/su-full-landscape";
import { SuFullLandscapeReport } from "@/components/assessments/su-full-landscape/SuFullLandscapeReport";
import type { ReportComparisonModel } from "@/lib/assessments/report-comparison-model";
import { buildSuFullLandscapeReportModel } from "@/lib/assessments/su-full-landscape-report";
import { buildSuFullSelfComparisonModel } from "@/lib/assessments/su-full-self-comparison";

function fixture() {
  const report = completeSuFullLandscapeReport();
  const model = buildSuFullLandscapeReportModel({ report, presentation: completeSuFullLandscapePresentation(report), resolvedStyle: "CLASSIC" });
  if (!model) throw new Error("landscape fixture must build");
  const comparison: ReportComparisonModel = {
    baseline: {
      submissionId: "earlier-submission", campaignId: "earlier-campaign", campaignLabel: "Earlier 2025",
      submittedAt: new Date("2025-05-01T00:00:00Z"), versionId: "version-5", versionNumber: 5, isImported: false,
    },
    sameVersion: false,
    overall: { current: 55, previous: 47, delta: null, status: "different-version" },
    domains: {},
    sections: Object.fromEntries(model.profileRows.map((row) => [row.stableKey, { current: row.youAverage, previous: 5, delta: null, status: "different-version" as const }])),
    questions: Object.fromEntries(model.chapters.flatMap((chapter) => chapter.questions.map((question) => [question.stableKey, {
      current: question.you, previous: 5, delta: question.you - 5, status: "comparable" as const,
    }]))),
    coverage: { currentQuestionCount: 61, matchedQuestionCount: 61, unmatchedCurrentCount: 0, baselineOnlyCount: 0 },
  };
  const selfComparison = buildSuFullSelfComparisonModel({
    focus: model, comparison, respondentName: "Ari Founder", focusCampaignLabel: "Focus 2026", focusSubmittedAt: report.submittedAt,
  });
  if (!selfComparison) throw new Error("self comparison fixture must build");
  return { report, model, selfComparison };
}

test("renders the approved one-person Focus and Earlier comparison semantics", () => {
  const { report, model, selfComparison } = fixture();
  render(<SuFullLandscapeReport report={report} model={model} selfComparison={selfComparison} />);

  expect(screen.getByRole("heading", { name: "Self Comparison" })).toBeVisible();
  expect(screen.getByText(/Focus 2026/)).toBeVisible();
  expect(screen.getByText(/Earlier 2025/)).toBeVisible();
  const profile = screen.getByRole("table", { name: "Focus and Earlier profile" });
  for (const heading of ["Focus", "Earlier", "Peers", "Dev from Earlier", "Dev from Peers"]) {
    expect(within(profile).getByRole("columnheader", { name: heading })).toBeVisible();
  }
  expect(document.querySelectorAll("[data-self-comparison-question]")).toHaveLength(61);
  expect(screen.getAllByText("Score of Previous").length).toBeGreaterThan(0);
  expect(screen.getAllByText("Score of Peers").length).toBeGreaterThan(0);
  expect(screen.getByRole("heading", { name: "Appendix B: decision comparison" })).toBeVisible();
  expect(screen.getByRole("heading", { name: "Appendix C: question comparison" })).toBeVisible();
  expect(screen.getAllByText("Ari Founder").length).toBeGreaterThan(0);

  const appendixA = screen.getByRole("heading", { name: "Appendix A: chapter comparisons" }).closest("section");
  expect(appendixA).not.toHaveTextContent("Earlier");
});

test("keeps the ordinary landscape labels when no Self Comparison is supplied", () => {
  const { report, model } = fixture();
  render(<SuFullLandscapeReport report={report} model={model} />);

  expect(screen.queryByRole("heading", { name: "Self Comparison" })).not.toBeInTheDocument();
  expect(screen.getByRole("columnheader", { name: "You" })).toBeVisible();
  expect(screen.getByRole("columnheader", { name: "Deviation" })).toBeVisible();
  expect(document.querySelectorAll("[data-self-comparison-question]")).toHaveLength(0);
});
