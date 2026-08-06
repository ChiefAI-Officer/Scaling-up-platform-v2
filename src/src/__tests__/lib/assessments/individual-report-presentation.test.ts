import type { RespondentReport } from "@/lib/assessments/respondent-report";
import {
  buildIndividualReportPresentation,
  type IndividualReportBlock,
} from "@/lib/assessments/individual-report-presentation";
import {
  applyScoredReportContactEmailOverride,
  applyScoredReportFindingsPolicy,
  buildScoredReportViewModel,
} from "@/lib/assessments/scored-report-view-model";
import { buildQualitativeModel } from "@/lib/assessments/qualitative-report-model";

function scoredReport(overrides: Partial<RespondentReport> = {}): RespondentReport {
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
        {
          stableKey: "people-1",
          value: 5.125,
          achieved: false,
          recommendation: "Clarify accountability.",
        },
        { stableKey: "strategy-1", value: 8, achieved: true },
      ],
      perSection: [
        {
          stableKey: "people",
          name: "People",
          totalPoints: 5.125,
          averagePoints: 5.125,
          achievedCount: 0,
          totalCount: 1,
        },
        {
          stableKey: "strategy",
          name: "Strategy",
          totalPoints: 8,
          averagePoints: 8,
          achievedCount: 1,
          totalCount: 1,
        },
      ],
      perDomain: [
        {
          key: "people",
          label: "People",
          averagePoints: 5.125,
          answeredSectionCount: 1,
          totalSectionCount: 1,
          tier: null,
        },
        {
          key: "strategy",
          label: "Strategy",
          averagePoints: 8,
          answeredSectionCount: 1,
          totalSectionCount: 1,
          tier: null,
        },
      ],
      overallTotal: 13.125,
      overallAverage: 6.5625,
      countAchieved: 1,
      scaleUpScore: 66,
      tier: { label: "Scaling", message: "Keep the focus on execution." },
      tierMetricValue: 6.5625,
      unansweredKeys: [],
      findings: [
        {
          stableKey: "strategy-answer",
          questionType: "TEXT",
          sectionStableKey: "strategy",
          questionLabel: "What must change?",
          text: "Turn the strategy into a weekly cadence.",
        },
      ],
    },
    sections: [
      {
        stableKey: "people",
        name: "People",
        domain: "people",
        questions: [{ stableKey: "people-1" }],
      },
      {
        stableKey: "strategy",
        name: "Strategy",
        domain: "strategy",
        questions: [{ stableKey: "strategy-1" }],
      },
    ],
    questionByKey: {
      "people-1": "Accountability is clear",
      "strategy-1": "Our strategy is differentiated",
      "strategy-answer": "What must change?",
    },
    questionsByKey: {
      "people-1": {
        type: "SLIDER_LIKERT",
        label: "Accountability is clear",
        sectionStableKey: "people",
        max: 10,
      },
      "strategy-1": {
        type: "SLIDER_LIKERT",
        label: "Our strategy is differentiated",
        sectionStableKey: "strategy",
        max: 10,
      },
      "strategy-answer": {
        type: "TEXT",
        label: "What must change?",
        sectionStableKey: "strategy",
      },
    },
    rawAnswers: [
      {
        stableKey: "strategy-answer",
        value: "A detailed answer that belongs in the report.",
      },
    ],
    scoringConfig: {
      tierMetric: "overallAvg",
      passThreshold: 0,
      tiers: [],
      scaleUpScore: true,
    },
    provenance: {
      submissionId: "submission-test",
      versionId: "version-test",
      contentHash: "content-test",
      templateName: "Scaling Up Full",
    },
    degraded: false,
    referringCoachEmail: "coach@example.test",
    coachLogoUrl: "https://assets.example.test/logo.png",
    coachName: "Casey Coach",
    isImported: true,
    ...overrides,
  };
}

function qualitativeReport(
  overrides: Partial<RespondentReport> = {},
): RespondentReport {
  return {
    respondentName: "Avery Chen",
    respondentEmail: "avery@example.test",
    jobTitle: "Founder",
    companyName: "Harbor Works",
    assessmentName: "Quarterly Reflection",
    templateAlias: "walk-qual-presentation",
    reportStyle: "MODERN_DASHBOARD",
    campaignLabel: "Q2 review",
    submittedAt: new Date("2026-06-30T08:00:00.000Z"),
    result: {
      perQuestion: [],
      perSection: [],
      overallTotal: 0,
      overallAverage: 0,
      countAchieved: 0,
      tier: null,
      tierMetricValue: 0,
      unansweredKeys: [],
      findings: [
        {
          stableKey: "reflection",
          questionType: "TEXT",
          sectionStableKey: "reflection",
          questionLabel: "What changed?",
          text: "Protect the weekly planning rhythm.",
        },
      ],
    },
    sections: [
      { stableKey: "metrics", name: "Operating facts" },
      { stableKey: "scale", name: "Confidence", description: "Choose the closest fit." },
      { stableKey: "themes", name: "Themes" },
      { stableKey: "reflection", name: "Reflection" },
    ],
    questionByKey: {
      revenue: "Revenue",
      confidence: "I can explain the strategy",
      priorities: "Which themes matter?",
      reflection: "What changed?",
    },
    questionsByKey: {
      revenue: {
        type: "NUMBER",
        label: "Revenue",
        sectionStableKey: "metrics",
      },
      confidence: {
        type: "SLIDER_LIKERT",
        label: "I can explain the strategy",
        sectionStableKey: "scale",
        min: 1,
        max: 3,
      },
      priorities: {
        type: "MULTI_CHOICE",
        label: "Which themes matter?",
        sectionStableKey: "themes",
        options: [
          { key: "cash", label: "Cash" },
          { key: "people", label: "People" },
        ],
      },
      reflection: {
        type: "TEXT",
        label: "What changed?",
        sectionStableKey: "reflection",
      },
    },
    rawAnswers: [
      { stableKey: "revenue", value: 0 },
      { stableKey: "confidence", value: 2 },
      { stableKey: "priorities", value: ["cash", "people"] },
      { stableKey: "reflection", value: "We protected focus time." },
    ],
    scoringConfig: {},
    provenance: {
      submissionId: "qual-submission",
      versionId: "qual-version",
      contentHash: "qual-hash",
      templateName: "Quarterly Reflection",
    },
    degraded: false,
    isImported: false,
    ...overrides,
  };
}

function blocksOfKind<K extends IndividualReportBlock["kind"]>(
  blocks: readonly IndividualReportBlock[],
  kind: K,
): Array<Extract<IndividualReportBlock, { kind: K }>> {
  return blocks.filter(
    (block): block is Extract<IndividualReportBlock, { kind: K }> =>
      block.kind === kind,
  );
}

describe("buildIndividualReportPresentation", () => {
  it("adapts every scored canonical fact without changing labels, values, precision, or provenance", () => {
    const report = scoredReport();
    const canonical = applyScoredReportContactEmailOverride(
      applyScoredReportFindingsPolicy(buildScoredReportViewModel(report), true),
      "board@example.test",
    );
    const presentation = buildIndividualReportPresentation(report, {
      findingsEnabled: true,
      contactEmail: "board@example.test",
    });

    expect(presentation.identity).toEqual(canonical.identity);
    expect(presentation.provenance).toEqual(canonical.provenance);
    expect(blocksOfKind(presentation.blocks, "score-summary")).toEqual([
      {
        kind: "score-summary",
        ...canonical.summary,
      },
    ]);

    const metrics = blocksOfKind(presentation.blocks, "metric-group");
    expect(metrics.map((block) => block.label)).toEqual([
      ...canonical.decisions.map((decision) => decision.label),
      ...canonical.sections.map((section) => section.label),
    ]);
    expect(metrics.slice(0, canonical.decisions.length).map((block) => block.summary))
      .toEqual(canonical.decisions.map((decision) => ({
        average: decision.averageAcrossSections,
        averageLabel: decision.averageAcrossSectionsLabel,
        total: decision.totalPoints,
        totalLabel: decision.totalPointsLabel,
      })));
    expect(
      metrics
        .slice(canonical.decisions.length)
        .flatMap((block) => block.metrics),
    ).toEqual(canonical.sections.flatMap((section) =>
      section.questions.map((question) => ({
        stableKey: question.stableKey,
        label: question.label,
        value: question.value,
        valueLabel: question.scoreLabel,
        maximum: question.maximum,
        achieved: question.achieved,
        achievementMarker: question.achievementMarker,
        unmapped: question.unmapped,
      })),
    ));

    expect(
      blocksOfKind(presentation.blocks, "recommendation").flatMap(
        (block) => block.groups,
      ),
    ).toEqual(canonical.recommendations);
    expect(
      blocksOfKind(presentation.blocks, "additional-response").flatMap(
        (block) => block.responses,
      ),
    ).toEqual(canonical.additionalResponses);
    expect(blocksOfKind(presentation.blocks, "coach-cta")).toEqual([
      { kind: "coach-cta", ...canonical.cta },
    ]);
    expect(blocksOfKind(presentation.blocks, "closing")).toEqual([
      {
        kind: "closing",
        greeting: canonical.closingGreeting,
        coach: canonical.coach,
      },
    ]);
  });

  it("preserves qualitative scales, selected labels, themes, findings, narratives, and provenance without score-only blocks", () => {
    const report = qualitativeReport();
    const canonical = buildQualitativeModel({
      templateAlias: report.templateAlias,
      sections: report.sections,
      questionsByKey: report.questionsByKey,
      rawAnswers: report.rawAnswers,
    });
    const presentation = buildIndividualReportPresentation(report, {
      findingsEnabled: true,
    });

    expect(presentation.provenance).toEqual({
      submissionId: "qual-submission",
      versionId: "qual-version",
      contentHash: "qual-hash",
      templateName: "Quarterly Reflection",
      imported: false,
    });
    expect(blocksOfKind(presentation.blocks, "score-summary")).toEqual([]);
    expect(
      blocksOfKind(presentation.blocks, "qualitative-scale")[0].items,
    ).toEqual(canonical.sections[1].items.map((item) => ({
      stableKey: item.stableKey,
      label: item.label,
      type: item.type,
      value: item.value,
      valueLabel: String(item.value),
      min: item.min,
      max: item.max,
    })));
    expect(blocksOfKind(presentation.blocks, "theme")[0]).toMatchObject({
      stableKey: "themes",
      label: "Themes",
      items: [
        {
          stableKey: "priorities",
          label: "Which themes matter?",
          values: ["cash", "people"],
          chosenLabels: ["Cash", "People"],
        },
      ],
    });
    expect(blocksOfKind(presentation.blocks, "narrative-response")[0]).toMatchObject({
      stableKey: "reflection",
      label: "Reflection",
      responses: [
        {
          stableKey: "reflection",
          label: "What changed?",
          answer: "We protected focus time.",
        },
      ],
    });
    expect(blocksOfKind(presentation.blocks, "finding")).toEqual([
      {
        kind: "finding",
        eyebrow: "What to work on next",
        label: "Your recommendations",
        groups: [
          {
            sectionName: "Reflection",
            items: [
              {
                stableKey: "reflection",
                text: "Protect the weekly planning rhythm.",
              },
            ],
          },
        ],
      },
    ]);
  });

  it("emits only authored narrative content for a sparse custom qualitative report", () => {
    const report = qualitativeReport({
      templateAlias: "walk-qual-sparse-custom",
      assessmentName: "Custom founder prompts",
      campaignLabel: null,
      result: {
        perQuestion: [],
        perSection: [],
        overallTotal: 0,
        overallAverage: 0,
        countAchieved: 0,
        tier: null,
        tierMetricValue: 0,
        unansweredKeys: [],
      },
      sections: [{ stableKey: "custom", name: "Founder reflections" }],
      questionByKey: { custom_prompt: "What deserves attention?" },
      questionsByKey: {
        custom_prompt: {
          type: "TEXT",
          label: "What deserves attention?",
          sectionStableKey: "custom",
        },
      },
      rawAnswers: [
        { stableKey: "custom_prompt", value: "Our onboarding handoff." },
      ],
      referringCoachEmail: null,
      coachName: null,
      coachLogoUrl: null,
    });

    const presentation = buildIndividualReportPresentation(report, {
      findingsEnabled: true,
    });

    expect(presentation.blocks).toEqual([
      {
        kind: "narrative-response",
        stableKey: "custom",
        label: "Founder reflections",
        responses: [
          {
            stableKey: "custom_prompt",
            label: "What deserves attention?",
            answer: "Our onboarding handoff.",
          },
        ],
      },
    ]);
    expect(
      presentation.blocks.some((block) =>
        [
          "score-summary",
          "metric-group",
          "qualitative-scale",
          "finding",
          "recommendation",
          "coach-cta",
          "closing",
        ].includes(block.kind),
      ),
    ).toBe(false);
  });

  it("is independent of appearance and deeply freezes the shared semantic object", () => {
    const report = scoredReport({ reportStyle: "CLASSIC" });
    const presentation = buildIndividualReportPresentation(report);
    const executive = buildIndividualReportPresentation({
      ...report,
      reportStyle: "EXECUTIVE_BOARDROOM",
    });
    const dashboard = buildIndividualReportPresentation({
      ...report,
      reportStyle: "MODERN_DASHBOARD",
    });

    expect(executive).toEqual(presentation);
    expect(dashboard).toEqual(presentation);
    expect(Object.isFrozen(presentation)).toBe(true);
    expect(Object.isFrozen(presentation.identity)).toBe(true);
    expect(Object.isFrozen(presentation.provenance)).toBe(true);
    expect(Object.isFrozen(presentation.blocks)).toBe(true);
    expect(Object.isFrozen(presentation.blocks[0])).toBe(true);
    const metric = blocksOfKind(presentation.blocks, "metric-group").find(
      (block) => block.metrics.length > 0,
    )!;
    expect(Object.isFrozen(metric.metrics)).toBe(true);
    expect(Object.isFrozen(metric.metrics[0])).toBe(true);
  });

  it("drops malformed optional findings without dropping valid identity, provenance, or narratives", () => {
    const report = qualitativeReport({
      result: {
        ...qualitativeReport().result,
        findings: [
          null,
          { stableKey: "broken", questionType: "TEXT", text: "   " },
        ] as unknown as RespondentReport["result"]["findings"],
      },
    });

    const presentation = buildIndividualReportPresentation(report, {
      findingsEnabled: true,
    });

    expect(presentation.identity.assessmentName).toBe("Quarterly Reflection");
    expect(presentation.provenance.submissionId).toBe("qual-submission");
    expect(blocksOfKind(presentation.blocks, "finding")).toEqual([]);
    expect(blocksOfKind(presentation.blocks, "narrative-response")).toHaveLength(1);
  });
});
