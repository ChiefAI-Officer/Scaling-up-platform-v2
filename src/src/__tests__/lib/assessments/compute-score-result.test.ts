import { computeScoreResult } from "@/lib/assessments/compute-score-result";
import {
  scoreSubmission,
  type Answer,
  type TemplateVersionForScoring,
} from "@/lib/assessments/scoring";
import { pruneHiddenAnswers } from "@/lib/assessments/form-visibility";
import type { PagerQuestion } from "@/lib/assessments/section-pages";
import {
  SU_FULL_PHASE_PEER_CONTENT_HASHES,
  SU_FULL_PHASE_PEER_SOURCE_ID,
} from "@/lib/assessments/su-full-phase-peer-catalogue";

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

  it("forwards the selected growth phase through the prune→score seam", () => {
    const phaseAwareVersion = {
      ...version,
      questions: version.questions.map((question) => ({
        ...question,
        phaseRecommendations: [1, 2, 3, 4, 5].map((phase) => ({
          phase,
          bands: [{ minScore: 0, maxScore: 3, text: `phase-${phase}` }],
        })),
        phasePeerBenchmarks: [1, 2, 3, 4, 5].map((phase) => ({
          phase,
          value: phase === 4 ? 6.6 : 6.3,
        })),
      })),
      scoringConfig: {
        ...version.scoringConfig,
        phasePeerBenchmarkCatalogue: {
          sourceId: SU_FULL_PHASE_PEER_SOURCE_ID,
          phases: [1, 2, 3, 4, 5].map((phase) => ({
            phase,
            contentHash:
              SU_FULL_PHASE_PEER_CONTENT_HASHES[
                phase as keyof typeof SU_FULL_PHASE_PEER_CONTENT_HASHES
              ],
          })),
        },
      },
    } as TemplateVersionForScoring;

    const { result } = computeScoreResult(
      phaseAwareVersion,
      phaseAwareVersion.questions as unknown as PagerQuestion[],
      answers,
      { recommendationPhase: 4 },
    );

    expect(result.recommendationPhase).toBe(4);
    expect(result.perQuestion[0].recommendation).toBe("phase-4");
    expect(result.perQuestion.map((row) => row.peerValue)).toEqual([6.6, 6.6]);
    expect(result.peerBenchmarkSnapshot).toEqual({
      sourceId: "2026-08-20.esperto-five-phase-peers-v1",
      contentHash: "ae9e9e2fbfc8525f4e6d8c3ca65775a50b85476371f29a74934dbe6dd3a965ff",
      phase: 4,
    });
  });

  it("omits governed peer fields when no growth phase is supplied", () => {
    const governedVersion = {
      ...version,
      questions: version.questions.map((question) => ({
        ...question,
        phasePeerBenchmarks: [1, 2, 3, 4, 5].map((phase) => ({
          phase,
          value: phase === 4 ? 6.6 : 6.3,
        })),
      })),
      scoringConfig: {
        ...version.scoringConfig,
        phasePeerBenchmarkCatalogue: {
          sourceId: SU_FULL_PHASE_PEER_SOURCE_ID,
          phases: [1, 2, 3, 4, 5].map((phase) => ({
            phase,
            contentHash:
              SU_FULL_PHASE_PEER_CONTENT_HASHES[
                phase as keyof typeof SU_FULL_PHASE_PEER_CONTENT_HASHES
              ],
          })),
        },
      },
    } as TemplateVersionForScoring;

    const { result } = computeScoreResult(
      governedVersion,
      governedVersion.questions as unknown as PagerQuestion[],
      answers,
    );

    expect(result.peerBenchmarkSnapshot).toBeUndefined();
    expect(result.perQuestion.every((row) => row.peerValue === undefined)).toBe(true);
  });

  it("keeps legacy score-only recommendations when no phase-aware payload is pinned", () => {
    const legacyVersion = {
      ...version,
      questions: version.questions.map((question, index) => index === 0
        ? {
            ...question,
            recommendations: [{ minScore: 0, maxScore: 3, text: "legacy frozen paragraph" }],
          }
        : question),
    } as TemplateVersionForScoring;

    const { result } = computeScoreResult(
      legacyVersion,
      legacyVersion.questions as unknown as PagerQuestion[],
      answers,
    );

    expect(result.recommendationPhase).toBeUndefined();
    expect(result.perQuestion[0].recommendation).toBe("legacy frozen paragraph");
  });
});
