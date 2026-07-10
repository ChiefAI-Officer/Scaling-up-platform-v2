import { buildVersionScoringPayload } from "@/components/admin/template-editor/build-version-payload";
import type { QuestionDraftRow } from "@/components/admin/template-editor/question-serialization";
import type { SectionDraft } from "@/components/admin/template-editor/SectionsCard";

const sections: SectionDraft[] = [
  { uid: "u-s1", stableKey: "S1", name: "Section 1", sortOrder: 1 } as unknown as SectionDraft,
];
const questions: QuestionDraftRow[] = [
  { uid: "u-q1", stableKey: "S1_q1", sectionStableKey: "S1", label: "Q1", helpText: "",
    type: "SLIDER_LIKERT", isRequired: true, sortOrder: 1, isNewToDraft: false, isInherited: false,
    scaleMin: 0, scaleMax: 3, scaleStep: 1, anchorMin: "Low", anchorMax: "High",
    options: [], findingBands: [], findingOptionTexts: {},
    showIf: null } as unknown as QuestionDraftRow,
];

describe("buildVersionScoringPayload", () => {
  it("NOT dirty → passes raw arrays through by reference (byte-for-byte)", () => {
    const rawQuestions = [{ stableKey: "S1_q1", type: "SLIDER_LIKERT" }];
    const rawSections = [{ stableKey: "S1", name: "Section 1", sortOrder: 1 }];
    const out = buildVersionScoringPayload({
      questions, sections, rawQuestions, rawSections, scoringConfig: { tierMetric: "overallAvg" },
      publishedKeys: new Set(), publishedOptionKeys: {}, dirty: { questions: false, sections: false },
    });
    expect(out.questions).toBe(rawQuestions);   // same reference
    expect(out.sections).toBe(rawSections);     // same reference
    expect(out.scoringConfig).toEqual({ tierMetric: "overallAvg" });
  });

  it("dirty → rebuilds questions and stamps section sortOrder", () => {
    const out = buildVersionScoringPayload({
      questions, sections, rawQuestions: [], rawSections: [], scoringConfig: {},
      publishedKeys: new Set(), publishedOptionKeys: {}, dirty: { questions: true, sections: true },
    });
    expect(Array.isArray(out.questions)).toBe(true);
    expect((out.sections as Array<{ sortOrder: number }>)[0].sortOrder).toBe(1);
  });
});
