import type { RespondentReport } from "@/lib/assessments/respondent-report";
import {
  applyScoredReportContactEmailOverride,
  applyScoredReportFindingsPolicy,
  buildScoredReportViewModel,
} from "@/lib/assessments/scored-report-view-model";

function makeReport(overrides: Partial<RespondentReport> = {}): RespondentReport {
  return {
    respondentName: "Morgan Lee",
    respondentEmail: "morgan@example.test",
    jobTitle: "Chief Executive Officer",
    companyName: "Northstar Labs",
    assessmentName: "Scaling Up Full",
    templateAlias: "scaling-up-full",
    reportStyle: "EXECUTIVE_BOARDROOM",
    campaignLabel: "FY26 leadership reset",
    submittedAt: new Date("2026-01-15T12:00:00.000Z"),
    result: {
      perQuestion: [
        { stableKey: "people-2", value: 9, achieved: true, recommendation: "Keep hiring deliberately." },
        { stableKey: "people-1", value: 5, achieved: false, recommendation: "Clarify accountability." },
        { stableKey: "strategy-1", value: 8, achieved: true },
        { stableKey: "orphan", value: 3, achieved: false, recommendation: "Make the owner explicit." },
      ],
      perSection: [
        { stableKey: "people-low", name: "People low", totalPoints: 5, averagePoints: 5, achievedCount: 0, totalCount: 1 },
        { stableKey: "people-high", name: "People high", totalPoints: 9, averagePoints: 9, achievedCount: 1, totalCount: 1 },
        { stableKey: "strategy", name: "Strategy", totalPoints: 11, averagePoints: 5.5, achievedCount: 1, totalCount: 2 },
      ],
      perDomain: [
        { key: "people", label: "People", averagePoints: 7, answeredSectionCount: 2, totalSectionCount: 2, tier: null },
        { key: "strategy", label: "Strategy", averagePoints: 5.5, answeredSectionCount: 1, totalSectionCount: 1, tier: null },
      ],
      overallTotal: 25,
      overallAverage: 6.25,
      countAchieved: 2,
      scaleUpScore: 63,
      tier: { label: "Scaling", message: "Keep the focus on execution." },
      tierMetricValue: 6.25,
      unansweredKeys: [],
      findings: [
        { stableKey: "strategy-answer", questionType: "TEXT", sectionStableKey: "strategy", questionLabel: "What must change?", text: "Turn the strategy into a weekly cadence." },
      ],
    },
    sections: [
      { stableKey: "people-low", name: "People: accountability", domain: "people", questions: [{ stableKey: "people-1" }] },
      { stableKey: "people-high", name: "People: talent", domain: "people", questions: [{ stableKey: "people-2" }] },
      { stableKey: "strategy", name: "Strategy", domain: "strategy", questions: [{ stableKey: "strategy-1" }] },
    ],
    questionByKey: {
      "people-1": "Accountability is clear",
      "people-2": "We hire A players",
      "strategy-1": "Our strategy is differentiated",
      "strategy-answer": "What must change?",
    },
    questionsByKey: {
      "people-1": { type: "SLIDER_LIKERT", label: "Accountability is clear", sectionStableKey: "people-low", max: 10 },
      "people-2": { type: "SLIDER_LIKERT", label: "We hire A players", sectionStableKey: "people-high", max: 10 },
      "strategy-1": { type: "SLIDER_LIKERT", label: "Our strategy is differentiated", sectionStableKey: "strategy", max: 10 },
      "strategy-answer": { type: "TEXT", label: "What must change?", sectionStableKey: "strategy" },
      choices: { type: "MULTI_CHOICE", label: "Which habits matter?", options: [{ key: "cadence", label: "Weekly meeting" }] },
    },
    rawAnswers: [
      { stableKey: "strategy-answer", value: "A detailed answer that belongs in the report." },
      { stableKey: "choices", value: ["cadence"] },
      { stableKey: "people-1", value: 5 },
    ],
    scoringConfig: { tierMetric: "overallAvg", passThreshold: 0, tiers: [], scaleUpScore: true },
    provenance: { submissionId: "submission-test", versionId: "version-test", contentHash: "content-test", templateName: "Scaling Up Full" },
    degraded: false,
    referringCoachEmail: "coach@example.test",
    coachLogoUrl: "https://assets.example.test/logo.png",
    coachName: "Casey Coach",
    isImported: true,
    ...overrides,
  };
}

describe("buildScoredReportViewModel", () => {
  it("keeps weighted overall average distinct from decision averages across sections", () => {
    const view = buildScoredReportViewModel(makeReport());

    expect(view.summary.overallAverage).toBe(6.25);
    expect(view.decisions).toEqual([
      expect.objectContaining({ stableKey: "people", label: "People", averageAcrossSections: 7 }),
      expect.objectContaining({ stableKey: "strategy", label: "Strategy", averageAcrossSections: 5.5 }),
    ]);
    expect(view.insights.strengths.map((decision) => decision.stableKey)).toEqual(["people"]);
    expect(view.insights.priorities.map((decision) => decision.stableKey)).toEqual(["strategy"]);
  });

  it("preserves canonical section, question, scorecard, legacy recommendation, response, CTA, branding, and provenance semantics", () => {
    const view = buildScoredReportViewModel(makeReport());

    expect(view.identity).toMatchObject({
      assessmentName: "Scaling Up Full",
      campaignLabel: "FY26 leadership reset",
      respondentName: "Morgan Lee",
      companyName: "Northstar Labs",
      jobTitle: "Chief Executive Officer",
      respondentEmail: "morgan@example.test",
    });
    expect(view.sections.map((section) => section.stableKey)).toEqual(["people-low", "people-high", "strategy"]);
    expect(view.sections[0].questions.map((question) => question.stableKey)).toEqual(["people-1"]);
    expect(view.sections[0].questions[0]).toMatchObject({ label: "Accountability is clear", value: 5, maximum: 10, achieved: false });
    expect(view.orphanQuestions).toEqual([expect.objectContaining({ stableKey: "orphan", label: "orphan", unmapped: true })]);
    expect(view.scorecard.rows.map((row) => row.stableKey)).toEqual(["people-low", "people-high", "strategy"]);
    expect(view.recommendations).toEqual([
      expect.objectContaining({ sectionStableKey: "people-low", label: "People: accountability", items: [expect.objectContaining({ text: "Clarify accountability." })] }),
      expect.objectContaining({ sectionStableKey: "people-high", label: "People: talent", items: [expect.objectContaining({ text: "Keep hiring deliberately." })] }),
      expect.objectContaining({ sectionStableKey: null, label: "Recommendations", items: [expect.objectContaining({ text: "Make the owner explicit." })] }),
    ]);
    expect(view.findingRecommendations).toEqual([
      expect.objectContaining({ sectionStableKey: "strategy", label: "Strategy", items: [expect.objectContaining({ text: "Turn the strategy into a weekly cadence." })] }),
    ]);
    expect(view.additionalResponses).toEqual([
      { stableKey: "strategy-answer", label: "What must change?", answer: "A detailed answer that belongs in the report." },
      { stableKey: "choices", label: "Which habits matter?", answer: "Weekly meeting" },
    ]);
    expect(view.cta).toEqual({
      eligible: true,
      contactEmail: "coach@example.test",
      label: "Talk to a Coach →",
      href: "mailto:coach%40example.test",
      learnMoreHref: "https://scalingup.com",
    });
    expect(view.coach).toEqual({ name: "Casey Coach", logoUrl: "https://assets.example.test/logo.png" });
    expect(view.provenance).toEqual({ submissionId: "submission-test", versionId: "version-test", contentHash: "content-test", templateName: "Scaling Up Full", imported: true });
  });

  it.each([
    ["off", false, false],
    ["kill-equivalent off", false, false],
    ["on", true, true],
  ])("applies the frozen findings recommendations only when the outer renderer policy is %s", (_case, findingsEnabled, includesFindings) => {
    const base = buildScoredReportViewModel(makeReport());
    const selected = applyScoredReportFindingsPolicy(base, findingsEnabled);
    const text = selected.recommendations.flatMap((group) => group.items.map((item) => item.text));

    expect(text.includes("Turn the strategy into a weekly cadence.")).toBe(includesFindings);
    expect(base.recommendations.flatMap((group) => group.items.map((item) => item.text)))
      .not.toContain("Turn the strategy into a weekly cadence.");
    expect(selected).not.toBe(base);
  });

  it("lets the public contact-email override win while null or empty overrides retain the referral CTA", () => {
    const base = buildScoredReportViewModel(makeReport());
    const overridden = applyScoredReportContactEmailOverride(base, "  override@example.test  ");
    const nullOverride = applyScoredReportContactEmailOverride(base, null);
    const emptyOverride = applyScoredReportContactEmailOverride(base, "  ");

    expect(overridden.cta).toEqual(expect.objectContaining({
      eligible: true,
      label: "Talk to a Coach →",
      contactEmail: "override@example.test",
      href: "mailto:override%40example.test",
    }));
    expect(nullOverride.cta.href).toBe("mailto:coach%40example.test");
    expect(emptyOverride.cta.href).toBe("mailto:coach%40example.test");
    expect(base.cta.href).toBe("mailto:coach%40example.test");
    expect(overridden).not.toBe(base);
  });

  it("uses Jeff's Talk-to-a-Coach form when no referring coach exists", () => {
    const withoutReferringCoach = buildScoredReportViewModel(
      makeReport({ referringCoachEmail: null }),
    );

    expect(withoutReferringCoach.cta.href).toBe(
      "https://coaches.scalingup.com/find-a-coach-contact-form",
    );
    expect(buildScoredReportViewModel(makeReport({ referringCoachEmail: "coach@example.com" })).cta.href).toBe(
      "mailto:coach%40example.com",
    );
  });

  it("provides the exact legacy display labels for subtitles, metrics, and achievement markers", () => {
    const standard = buildScoredReportViewModel(makeReport());
    const duplicateSubtitle = buildScoredReportViewModel(makeReport({ campaignLabel: "Scaling Up Full" }));
    const thresholded = buildScoredReportViewModel(makeReport({
      scoringConfig: { tierMetric: "overallAvg", passThreshold: 2, tiers: [] },
    }));

    expect(standard.identity.campaignSubtitle).toBe("FY26 leadership reset");
    expect(duplicateSubtitle.identity.campaignSubtitle).toBeNull();
    expect(standard.summary).toMatchObject({
      overallTotalLabel: "25",
      overallAverageLabel: "6.25",
      achievementMarkersVisible: false,
    });
    expect(standard.sections[2]).toMatchObject({ totalPointsLabel: "11", averagePointsLabel: "5.5" });
    expect(standard.decisions[1]).toMatchObject({ averageAcrossSectionsLabel: "5.5", totalPointsLabel: "11" });
    expect(standard.sections[0].questions[0].achievementMarker).toBeNull();
    expect(thresholded.summary.achievementMarkersVisible).toBe(true);
    expect(thresholded.sections[0].questions[0].achievementMarker).toEqual({ symbol: "✕", label: "not achieved" });
  });

  it.each([
    ["partial", { result: { ...makeReport().result, perQuestion: [{ stableKey: "people-1", value: 5, achieved: false }], unansweredKeys: ["people-2"] } }, false],
    ["degraded", { result: null as unknown as RespondentReport["result"], sections: "malformed", rawAnswers: "malformed", degraded: true }, true],
  ])("returns a total, renderer-ready model for a %s report", (_case, overrides, expectedDegraded) => {
    const view = buildScoredReportViewModel(makeReport(overrides));

    expect(view.degraded).toBe(expectedDegraded);
    expect(view.summary).toEqual(expect.objectContaining({ answeredItems: expect.any(Number), sectionCount: expect.any(Number) }));
    expect(Array.isArray(view.sections)).toBe(true);
    expect(Array.isArray(view.recommendations)).toBe(true);
  });

  it("retains long text without truncation and respects a template that disables the coach CTA", () => {
    const longText = "A deliberately long recommendation ".repeat(30);
    const view = buildScoredReportViewModel(makeReport({
      templateAlias: "five-dysfunctions",
      result: { ...makeReport().result, perQuestion: [{ stableKey: "people-1", value: 1, achieved: false, recommendation: longText }] },
    }));

    expect(view.recommendations[0].items[0].text).toBe(longText);
    expect(view.cta).toEqual(expect.objectContaining({
      eligible: false,
      contactEmail: "coach@example.test",
      label: "Talk to a Coach →",
      href: "mailto:coach%40example.test",
    }));
  });
});
