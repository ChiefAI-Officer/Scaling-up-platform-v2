import {
  buildSuFullLandscapeReportModel,
  SU_FULL_LANDSCAPE_CHAPTERS,
  SU_FULL_LANDSCAPE_PAGE_GROUPS,
  type SuFullLandscapeReportModel,
} from "@/lib/assessments/su-full-landscape-report";
import {
  completeSuFullLandscapePresentation,
  completeSuFullLandscapeReport,
} from "@/__tests__/fixtures/su-full-landscape";

function detailKeys(model: SuFullLandscapeReportModel): string[] {
  return model.pages.flatMap((page) => page.kind === "detail" ? page.questionKeys : []);
}

function chapterPageNumbers(model: SuFullLandscapeReportModel): number[] {
  return model.pages.flatMap((page) => page.kind === "chapter" ? page.number : []);
}

function keys(start: string, end: string): string[] {
  const first = Number(start.slice(1));
  const last = Number(end.slice(1));
  return Array.from({ length: last - first + 1 }, (_, index) => `Q${String(first + index).padStart(2, "0")}`);
}

describe("buildSuFullLandscapeReportModel", () => {
  it("composes the canonical 26-page report with every detail question exactly once", () => {
    const report = completeSuFullLandscapeReport();
    const presentation = completeSuFullLandscapePresentation(report);

    const model = buildSuFullLandscapeReportModel({ report, presentation });

    expect(model).not.toBeNull();
    expect(model!.pages).toHaveLength(26);
    expect(model!.pages.map((page) => page.number)).toEqual(
      Array.from({ length: 26 }, (_, index) => index + 1),
    );
    expect(detailKeys(model!)).toEqual(keys("Q01", "Q61"));
    expect(new Set(detailKeys(model!)).size).toBe(61);
    expect(chapterPageNumbers(model!)).toEqual([7, 11, 14, 19, 21]);
    expect(model!.pages[25].kind).toBe("appendix");
    expect(Object.isFrozen(model)).toBe(true);
    expect(Object.isFrozen(model!.pages)).toBe(true);
  });

  it("uses the fixed detail groups and five canonical chapter groupings", () => {
    const model = buildSuFullLandscapeReportModel({
      report: completeSuFullLandscapeReport(),
      presentation: completeSuFullLandscapePresentation(),
    });

    expect(model).not.toBeNull();
    expect(SU_FULL_LANDSCAPE_PAGE_GROUPS.map(({ number, questionKeys }) => [number, questionKeys])).toEqual([
      [8, keys("Q01", "Q06")], [9, keys("Q07", "Q08")], [10, keys("Q09", "Q13")],
      [12, keys("Q14", "Q19")], [13, keys("Q20", "Q20")], [15, keys("Q21", "Q24")],
      [16, keys("Q25", "Q29")], [17, keys("Q30", "Q34")], [18, keys("Q35", "Q40")],
      [20, keys("Q41", "Q45")], [22, keys("Q46", "Q51")], [23, keys("Q52", "Q55")],
      [24, keys("Q56", "Q61")],
    ]);
    expect(SU_FULL_LANDSCAPE_CHAPTERS.map((chapter) => [chapter.key, chapter.sectionStableKeys])).toEqual([
      ["people", ["S_PEOPLE_YE", "S_PEOPLE_CC"]],
      ["strategy", ["S_STRATEGY"]],
      ["execution", ["S_EXEC_LT", "S_EXEC_OP", "S_EXEC_SM", "S_EXEC_SIT"]],
      ["cash", ["S_CASH"]],
      ["you", ["S_YOU_LEAD", "S_YOU_IC"]],
    ]);
    expect(model!.chapters.map((chapter) => [chapter.key, chapter.questions.length])).toEqual([
      ["people", 13], ["strategy", 7], ["execution", 20], ["cash", 5], ["you", 16],
    ]);
  });

  it("derives section and chapter averages, signed deviations, and question gaps", () => {
    const model = buildSuFullLandscapeReportModel({
      report: completeSuFullLandscapeReport(),
      presentation: completeSuFullLandscapePresentation(),
    });

    expect(model).not.toBeNull();
    expect(model!.profileRows[0]).toMatchObject({
      stableKey: "S_PEOPLE_YE",
      chapterKey: "people",
      youAverage: 3.5,
    });
    expect(model!.profileRows[0].peersAverage).toBeCloseTo(5.7125);
    expect(model!.profileRows[0].deviation).toBeCloseTo(-2.2125);
    expect(model!.chapters[0]).toMatchObject({ key: "people", youAverage: 56 / 13, peersAverage: 77.5 / 13 });
    expect(model!.chapters[0].questions[0]).toMatchObject({ stableKey: "Q01", you: 0, peers: 6.3, gap: -6.3 });
    expect(model!.closestQuestions.map((question) => Math.abs(question.gap))).toEqual(
      [...model!.closestQuestions].map((question) => Math.abs(question.gap)).sort((a, b) => a - b),
    );
    expect(model!.largestGapQuestions.map((question) => Math.abs(question.gap))).toEqual(
      [...model!.largestGapQuestions].map((question) => Math.abs(question.gap)).sort((a, b) => b - a),
    );
  });

  it("derives Phase 2 from the frozen FTE answer and omits an invalid FTE phase", () => {
    const report = completeSuFullLandscapeReport();
    const presentation = completeSuFullLandscapePresentation(report);

    expect(buildSuFullLandscapeReportModel({ report, presentation })!.growthPhase).toMatchObject({ number: 2 });
    expect(buildSuFullLandscapeReportModel({
      report: { ...report, rawAnswers: [{ stableKey: "Q_FTE_CONTRACT", value: 0 }] },
      presentation,
    })!.growthPhase).toBeNull();
  });

  it("fails closed outside the Classic report style", () => {
    const report = completeSuFullLandscapeReport();
    const presentation = completeSuFullLandscapePresentation(report);

    expect(buildSuFullLandscapeReportModel({
      report: { ...report, reportStyle: "EXECUTIVE_BOARDROOM" },
      presentation,
    })).toBeNull();
  });

  it("allows only the governed people-domain background container outside the canonical sections", () => {
    const report = completeSuFullLandscapeReport();
    const presentation = completeSuFullLandscapePresentation(report);
    const background = { stableKey: "S_BACKGROUND", name: "Background", domain: "people" };

    expect(buildSuFullLandscapeReportModel({
      report: { ...report, sections: [...report.sections as object[], background] },
      presentation,
    })).not.toBeNull();
    expect(buildSuFullLandscapeReportModel({
      report: { ...report, sections: [...report.sections as object[], { ...background, domain: "strategy" }] },
      presentation,
    })).toBeNull();
    expect(buildSuFullLandscapeReportModel({
      report: { ...report, sections: [...report.sections as object[], { stableKey: "S_UNKNOWN", name: "Unknown", domain: "people" }] },
      presentation,
    })).toBeNull();
  });

  it.each([
    ["a missing canonical section", (presentation: ReturnType<typeof completeSuFullLandscapePresentation>) => ({ ...presentation, sections: presentation.sections.slice(1) })],
    ["a duplicate section", (presentation: ReturnType<typeof completeSuFullLandscapePresentation>) => ({ ...presentation, sections: [presentation.sections[0], presentation.sections[0], ...presentation.sections.slice(1)] })],
    ["an unknown section", (presentation: ReturnType<typeof completeSuFullLandscapePresentation>) => ({ ...presentation, sections: [{ ...presentation.sections[0], stableKey: "S_UNKNOWN" }, ...presentation.sections.slice(1)] })],
    ["an unknown section domain", (presentation: ReturnType<typeof completeSuFullLandscapePresentation>) => ({ ...presentation, sections: [{ ...presentation.sections[0], domain: "unknown" }, ...presentation.sections.slice(1)] })],
    ["a missing question key", (presentation: ReturnType<typeof completeSuFullLandscapePresentation>) => ({ ...presentation, sections: [{ ...presentation.sections[0], questions: presentation.sections[0].questions.slice(1) }, ...presentation.sections.slice(1)] })],
    ["a duplicate question key", (presentation: ReturnType<typeof completeSuFullLandscapePresentation>) => ({ ...presentation, sections: [{ ...presentation.sections[0], questions: [presentation.sections[0].questions[0], presentation.sections[0].questions[0], ...presentation.sections[0].questions.slice(1)] }, ...presentation.sections.slice(1)] })],
    ["an unknown question key", (presentation: ReturnType<typeof completeSuFullLandscapePresentation>) => ({ ...presentation, sections: [{ ...presentation.sections[0], questions: [{ ...presentation.sections[0].questions[0], stableKey: "Q99" }, ...presentation.sections[0].questions.slice(1)] }, ...presentation.sections.slice(1)] })],
  ])("fails closed for %s", (_name, mutate) => {
    const report = completeSuFullLandscapeReport();
    const presentation = completeSuFullLandscapePresentation(report);

    expect(buildSuFullLandscapeReportModel({ report, presentation: mutate(presentation) })).toBeNull();
  });
});
