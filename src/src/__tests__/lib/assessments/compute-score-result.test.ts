import { computeScoreResult } from "@/lib/assessments/compute-score-result";
import {
  scoreSubmission,
  type Answer,
  type TemplateVersionForScoring,
} from "@/lib/assessments/scoring";
import { pruneHiddenAnswers } from "@/lib/assessments/form-visibility";
import type { PagerQuestion } from "@/lib/assessments/section-pages";

// Minimal 2-slider scored version (tierMetric overallAvg, single full-span tier).
const version: TemplateVersionForScoring = {
  questions: [
    {
      stableKey: "S1_q1",
      type: "SLIDER_LIKERT",
      label: "Q1",
      sectionStableKey: "S1",
      sortOrder: 1,
      isRequired: true,
      scale: { min: 0, max: 3, step: 1, anchorMin: "Low", anchorMax: "High" },
    },
    {
      stableKey: "S1_q2",
      type: "SLIDER_LIKERT",
      label: "Q2",
      sectionStableKey: "S1",
      sortOrder: 2,
      isRequired: true,
      scale: { min: 0, max: 3, step: 1, anchorMin: "Low", anchorMax: "High" },
    },
  ] as unknown as TemplateVersionForScoring["questions"],
  sections: [
    { stableKey: "S1", name: "S1", sortOrder: 1 },
  ] as unknown as TemplateVersionForScoring["sections"],
  scoringConfig: {
    tierMetric: "overallAvg",
    passThreshold: 0,
    tiers: [
      { minMetric: 0, maxMetric: 3, label: "All", message: "All good" },
    ],
  } as unknown as TemplateVersionForScoring["scoringConfig"],
};
const questions = version.questions as unknown as PagerQuestion[];
const answers: Answer[] = [
  { stableKey: "S1_q1", value: 2 },
  { stableKey: "S1_q2", value: 3 },
];

describe("computeScoreResult", () => {
  it("equals a manual prune→score for identical inputs (behavior-preserving)", () => {
    const manualPruned = pruneHiddenAnswers(answers, questions);
    const manual = scoreSubmission(version, manualPruned);
    const { result, prunedAnswers } = computeScoreResult(version, questions, answers);
    expect(result).toEqual(manual);
    expect(prunedAnswers).toEqual(manualPruned);
  });

  it("passes allowMissingRequired through (partial answers score instead of throwing)", () => {
    const partial: Answer[] = [{ stableKey: "S1_q1", value: 2 }];
    expect(() => computeScoreResult(version, questions, partial)).toThrow(); // MISSING_REQUIRED_KEY
    const { result } = computeScoreResult(version, questions, partial, { allowMissingRequired: true });
    expect(result.unansweredKeys).toContain("S1_q2");
  });
});
