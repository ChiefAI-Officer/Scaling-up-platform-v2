import { buildVersionScoringPayload } from "@/components/admin/template-editor/build-version-payload";
import {
  QuestionSerializationError,
  type QuestionDraftRow,
} from "@/components/admin/template-editor/question-serialization";
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

// ED5 T12 (co-validate C3) — save-side defense-in-depth against the pre-cascade
// orphan-delete corruption class. The PUBLISH-side rejection of the same class
// (checkSectionRefsResolve) + dangling show-if (checkShowIfIntegrity) already
// exist and are covered by scoring-publish-section-refs.test.ts +
// scoring.wave-w.test.ts. A dangling show-if is intentionally NOT blocked at
// save (Wave W permits in-progress conditional authoring).
describe("buildVersionScoringPayload — orphan section-ref guard (ED5 T12, C3)", () => {
  it("throws ORPHAN_SECTION_REF when a non-empty sectionStableKey resolves to no section", () => {
    const rawQuestions = [
      { stableKey: "S1_q1", type: "SLIDER_LIKERT", sectionStableKey: "S_GONE" },
    ];
    const rawSections = [{ stableKey: "S1", name: "Section 1", sortOrder: 1 }];
    let caught: unknown;
    try {
      buildVersionScoringPayload({
        questions, sections, rawQuestions, rawSections, scoringConfig: {},
        publishedKeys: new Set(), publishedOptionKeys: {},
        dirty: { questions: false, sections: false },
      });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(QuestionSerializationError);
    expect((caught as QuestionSerializationError).code).toBe("ORPHAN_SECTION_REF");
    expect((caught as Error).message).toMatch(/unknown section "S_GONE"/);
  });

  it("does NOT throw for a resolvable ref and tolerates an empty key (Other bucket)", () => {
    const rawQuestions = [
      { stableKey: "S1_q1", type: "SLIDER_LIKERT", sectionStableKey: "S1" },
      { stableKey: "x_q2", type: "TEXT", sectionStableKey: "" },
    ];
    const rawSections = [{ stableKey: "S1", name: "Section 1", sortOrder: 1 }];
    expect(() =>
      buildVersionScoringPayload({
        questions, sections, rawQuestions, rawSections, scoringConfig: {},
        publishedKeys: new Set(), publishedOptionKeys: {},
        dirty: { questions: false, sections: false },
      }),
    ).not.toThrow();
  });
});
