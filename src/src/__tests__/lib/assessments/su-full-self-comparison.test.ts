import { completeSuFullLandscapePresentation, completeSuFullLandscapeReport } from "@/__tests__/fixtures/su-full-landscape";
import type { ReportComparisonModel } from "@/lib/assessments/report-comparison-model";
import { buildSuFullLandscapeReportModel } from "@/lib/assessments/su-full-landscape-report";
import { buildSuFullSelfComparisonModel } from "@/lib/assessments/su-full-self-comparison";

function fixture() {
  const report = completeSuFullLandscapeReport();
  const focus = buildSuFullLandscapeReportModel({
    report,
    presentation: completeSuFullLandscapePresentation(report),
    resolvedStyle: "CLASSIC",
  });
  if (!focus) throw new Error("landscape fixture must build");
  const questions = Object.fromEntries(focus.chapters.flatMap((chapter) =>
    chapter.questions.map((question, index) => [question.stableKey, {
      current: question.you,
      previous: (index + chapter.questions.length) % 11,
      delta: question.you - ((index + chapter.questions.length) % 11),
      status: "comparable" as const,
    }]),
  ));
  const sectionKeys = focus.profileRows.map((row) => row.stableKey);
  const comparison: ReportComparisonModel = {
    baseline: {
      submissionId: "earlier-submission",
      campaignId: "earlier-campaign",
      campaignLabel: "Annual assessment 2025",
      submittedAt: new Date("2025-05-01T00:00:00Z"),
      versionId: "earlier-version",
      versionNumber: 5,
      isImported: false,
    },
    sameVersion: false,
    overall: { current: 55, previous: 47, delta: null, status: "different-version" },
    domains: {},
    sections: Object.fromEntries(sectionKeys.map((key) => [key, {
      current: 5,
      previous: 4,
      delta: null,
      status: "different-version" as const,
    }])),
    questions,
    coverage: { currentQuestionCount: 61, matchedQuestionCount: 61, unmatchedCurrentCount: 0, baselineOnlyCount: 0 },
  };
  return { focus, comparison };
}

describe("buildSuFullSelfComparisonModel", () => {
  it("projects one person's Focus and Earlier reports into all report appendices", () => {
    const { focus, comparison } = fixture();
    const model = buildSuFullSelfComparisonModel({
      focus,
      comparison,
      respondentName: "John Adams",
      focusCampaignLabel: "Annual assessment 2026",
      focusSubmittedAt: new Date("2026-05-01T00:00:00Z"),
    });

    expect(model?.questions).toHaveLength(61);
    expect(model?.profileRows).toHaveLength(10);
    expect(model?.chapters).toHaveLength(5);
    expect(model?.questions.every((row) => row.delta === row.focus - row.earlier)).toBe(true);
    expect(model?.appendixB.rows.map((row) => row.label)).toEqual(["Focus", "John Adams"]);
    expect(model?.appendixB.rows.every((row) => row.decisions.length === 4)).toBe(true);
    expect(model?.appendixC).toHaveLength(51);
    expect(model?.appendixC.map((row) => row.stableKey)).not.toContain("Q46");
    expect(model?.appendixC.every((row) => row.average === (row.focus + row.earlier) / 2)).toBe(true);
    expect(Object.isFrozen(model)).toBe(true);
  });

  it.each([
    ["a missing question", (comparison: ReportComparisonModel) => { delete comparison.questions.Q61; }],
    ["an unmatched question", (comparison: ReportComparisonModel) => { comparison.questions.Q01 = { ...comparison.questions.Q01, status: "unmatched" }; }],
    ["a mismatched Focus value", (comparison: ReportComparisonModel) => { comparison.questions.Q01 = { ...comparison.questions.Q01, current: 9 }; }],
    ["a missing canonical section", (comparison: ReportComparisonModel) => { delete comparison.sections.S_CASH; }],
    ["an Earlier report missing a canonical section value", (comparison: ReportComparisonModel) => {
      comparison.sections.S_CASH = {
        current: 5,
        previous: null,
        delta: null,
        status: "unmatched",
      };
    }],
    ["a non-finite Earlier value", (comparison: ReportComparisonModel) => { comparison.questions.Q02 = { ...comparison.questions.Q02, previous: Number.NaN }; }],
  ])("fails closed for %s", (_case, mutate) => {
    const { focus, comparison } = fixture();
    mutate(comparison);
    expect(buildSuFullSelfComparisonModel({
      focus,
      comparison,
      respondentName: "John Adams",
      focusCampaignLabel: "Annual assessment 2026",
      focusSubmittedAt: new Date("2026-05-01T00:00:00Z"),
    })).toBeNull();
  });
});
