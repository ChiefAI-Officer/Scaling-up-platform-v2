/**
 * Test Mode fidelity regression guards (spec 19ac §3.7). Equivalence is by
 * construction (Test Mode and the submit routes share buildVersionScoringPayload
 * + computeScoreResult); these lock it so a future edit can't reintroduce a
 * second code path. Inline fixture only — prisma/seed*.ts is tsconfig-excluded
 * (review-loop F8), so we build the draft here.
 */
import { buildVersionScoringPayload } from "@/components/admin/template-editor/build-version-payload";
import { computeScoreResult } from "@/lib/assessments/compute-score-result";
import {
  scoreSubmission,
  TemplateVersionForScoringSchema,
  type Answer,
} from "@/lib/assessments/scoring";
import { pruneHiddenAnswers } from "@/lib/assessments/form-visibility";
import type { PagerQuestion } from "@/lib/assessments/section-pages";
import type { QuestionDraftRow } from "@/components/admin/template-editor/question-serialization";
import type { SectionDraft } from "@/components/admin/template-editor/SectionsCard";

const sections: SectionDraft[] = [
  { uid: "u-s1", stableKey: "S1", name: "Section 1", sortOrder: 1 } as unknown as SectionDraft,
];

function draftQuestion(key: string, order: number): QuestionDraftRow {
  return {
    uid: `u-${key}`, stableKey: key, sectionStableKey: "S1", label: key, helpText: "",
    type: "SLIDER_LIKERT", isRequired: true, sortOrder: order, isNewToDraft: false, isInherited: false,
    scaleMin: 0, scaleMax: 3, scaleStep: 1, anchorMin: "Low", anchorMax: "High",
    options: [], findingBands: [], findingOptionTexts: {}, showIf: null,
  } as unknown as QuestionDraftRow;
}
const questions: QuestionDraftRow[] = [draftQuestion("S1_q1", 1), draftQuestion("S1_q2", 2)];
const scoringConfig = {
  tierMetric: "overallAvg",
  passThreshold: 0,
  tiers: [{ minMetric: 0, maxMetric: 3, label: "All", message: "ok" }],
};

function assembleAndParse() {
  const built = buildVersionScoringPayload({
    questions, sections, rawQuestions: [], rawSections: [], scoringConfig,
    publishedKeys: new Set(), publishedOptionKeys: {}, dirty: { questions: true, sections: true },
  });
  // Parse succeeding proves the draft assembles into a valid, persisted-shape
  // scoring version (the write path persists this payload verbatim).
  return TemplateVersionForScoringSchema.parse(built);
}

describe("Test Mode fidelity (regression guards)", () => {
  it("assembly parity: a draft assembles into a valid, parseable scoring version", () => {
    const v = assembleAndParse();
    expect(v.questions.map((q) => q.stableKey)).toEqual(["S1_q1", "S1_q2"]);
    expect(v.sections[0].stableKey).toBe("S1");
  });

  it("scoring parity: complete answers → Test Mode result === real submit result", () => {
    const v = assembleAndParse();
    const pq = v.questions as unknown as PagerQuestion[];
    const complete: Answer[] = [
      { stableKey: "S1_q1", value: 2 },
      { stableKey: "S1_q2", value: 3 },
    ];
    // Test Mode path (drawer): computeScoreResult with allowMissingRequired.
    const { result: testMode } = computeScoreResult(v, pq, complete, { allowMissingRequired: true });
    // Real submit path: scoreSubmission on pruned answers, NO option.
    const real = scoreSubmission(v, pruneHiddenAnswers(complete, pq));
    expect(testMode).toEqual(real);
    expect(testMode.overallAverage).toBeCloseTo(2.5);
    expect(testMode.tier?.label).toBe("All");
  });
});
