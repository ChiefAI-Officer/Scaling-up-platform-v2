import {
  buildReportComparisonModel,
  type ComparisonSnapshot,
} from "@/lib/assessments/report-comparison-model";

type QuestionInput = {
  stableKey: string;
  value: unknown;
  type?: string | null;
  min?: number | null;
  max?: number | null;
};

function snapshot(input: {
  submissionId: string;
  versionId: string;
  scaleUpScore?: unknown;
  domains?: Array<{ key: string; averagePoints: unknown }>;
  sections?: Array<{ stableKey: string; averagePoints: unknown }>;
  questions?: QuestionInput[];
}): ComparisonSnapshot {
  const questions = input.questions ?? [];

  return {
    submissionId: input.submissionId,
    campaignId: `campaign-${input.submissionId}`,
    campaignLabel: null,
    submittedAt: new Date("2026-01-01T00:00:00.000Z"),
    versionId: input.versionId,
    versionNumber: 1,
    isImported: false,
    result: {
      scaleUpScore: input.scaleUpScore,
      perDomain: input.domains ?? [],
      perSection: input.sections ?? [],
      perQuestion: questions.map(({ stableKey, value }) => ({ stableKey, value, achieved: false })),
    },
    questionMetaByKey: Object.fromEntries(
      questions.map(({ stableKey, type = "SLIDER_LIKERT", min = 0, max = 10 }) => [
        stableKey,
        { type, min, max },
      ]),
    ),
  };
}

describe("buildReportComparisonModel", () => {
  it("compares same-version aggregate and slider values", () => {
    const focus = snapshot({
      submissionId: "focus",
      versionId: "v2",
      scaleUpScore: 72,
      domains: [{ key: "people", averagePoints: 7 }],
      sections: [{ stableKey: "s1", averagePoints: 6 }],
      questions: [{ stableKey: "q1", value: 8 }],
    });
    const baseline = snapshot({
      submissionId: "baseline",
      versionId: "v2",
      scaleUpScore: 64,
      domains: [{ key: "people", averagePoints: 6 }],
      sections: [{ stableKey: "s1", averagePoints: 4 }],
      questions: [{ stableKey: "q1", value: 5 }],
    });

    const model = buildReportComparisonModel({ focus, baseline });

    expect(model.overall).toEqual({ current: 72, previous: 64, delta: 8, status: "comparable" });
    expect(model.domains.people).toEqual({ current: 7, previous: 6, delta: 1, status: "comparable" });
    expect(model.sections.s1).toEqual({ current: 6, previous: 4, delta: 2, status: "comparable" });
    expect(model.questions.q1).toEqual({ current: 8, previous: 5, delta: 3, status: "comparable" });
  });

  it("marks cross-version aggregates different-version while retaining exact compatible slider deltas", () => {
    const focus = snapshot({
      submissionId: "focus",
      versionId: "v2",
      scaleUpScore: 72,
      domains: [{ key: "people", averagePoints: 7 }],
      sections: [{ stableKey: "s1", averagePoints: 6 }],
      questions: [{ stableKey: "q1", value: 8 }],
    });
    const baseline = snapshot({
      submissionId: "baseline",
      versionId: "v1",
      scaleUpScore: 64,
      domains: [{ key: "people", averagePoints: 6 }],
      sections: [{ stableKey: "s1", averagePoints: 4 }],
      questions: [{ stableKey: "q1", value: 5 }],
    });

    const model = buildReportComparisonModel({ focus, baseline });

    expect(model.sameVersion).toBe(false);
    expect(model.overall).toEqual({ current: 72, previous: 64, delta: null, status: "different-version" });
    expect(model.domains.people.status).toBe("different-version");
    expect(model.sections.s1.status).toBe("different-version");
    expect(model.questions.q1).toEqual({ current: 8, previous: 5, delta: 3, status: "comparable" });
  });

  it("uses stable keys instead of labels for compatible renamed questions", () => {
    const focus = snapshot({ submissionId: "focus", versionId: "v2", questions: [{ stableKey: "q1", value: 8 }] });
    const baseline = snapshot({ submissionId: "baseline", versionId: "v1", questions: [{ stableKey: "q1", value: 5 }] });

    expect(buildReportComparisonModel({ focus, baseline }).questions.q1).toEqual({
      current: 8,
      previous: 5,
      delta: 3,
      status: "comparable",
    });
  });

  it("marks type, scale, missing, removed, and non-finite question values unmatched without treating missing values as zero", () => {
    const focus = snapshot({
      submissionId: "focus",
      versionId: "v2",
      questions: [
        { stableKey: "type-changed", value: 8 },
        { stableKey: "scale-changed", value: 8, min: 0, max: 10 },
        { stableKey: "missing-baseline", value: 8 },
        { stableKey: "non-finite", value: Number.POSITIVE_INFINITY },
      ],
    });
    const baseline = snapshot({
      submissionId: "baseline",
      versionId: "v1",
      questions: [
        { stableKey: "type-changed", value: 5, type: "TEXT" },
        { stableKey: "scale-changed", value: 5, min: 1, max: 10 },
        { stableKey: "removed", value: 5 },
        { stableKey: "non-finite", value: 5 },
      ],
    });

    const model = buildReportComparisonModel({ focus, baseline });

    expect(model.questions["type-changed"]).toEqual({ current: 8, previous: 5, delta: null, status: "unmatched" });
    expect(model.questions["scale-changed"]).toEqual({ current: 8, previous: 5, delta: null, status: "unmatched" });
    expect(model.questions["missing-baseline"]).toEqual({ current: 8, previous: null, delta: null, status: "unmatched" });
    expect(model.questions.removed).toEqual({ current: null, previous: 5, delta: null, status: "unmatched" });
    expect(model.questions["non-finite"]).toEqual({ current: null, previous: 5, delta: null, status: "unmatched" });
  });

  it("reports coverage for current, matched, unmatched-current, and baseline-only questions", () => {
    const focus = snapshot({
      submissionId: "focus",
      versionId: "v2",
      questions: [
        { stableKey: "matched", value: 8 },
        { stableKey: "unmatched", value: 7 },
        { stableKey: "missing", value: 6 },
      ],
    });
    const baseline = snapshot({
      submissionId: "baseline",
      versionId: "v1",
      questions: [
        { stableKey: "matched", value: 5 },
        { stableKey: "unmatched", value: 4, max: 5 },
        { stableKey: "baseline-only", value: 3 },
      ],
    });

    expect(buildReportComparisonModel({ focus, baseline }).coverage).toEqual({
      currentQuestionCount: 3,
      matchedQuestionCount: 1,
      unmatchedCurrentCount: 2,
      baselineOnlyCount: 1,
    });
  });
});
