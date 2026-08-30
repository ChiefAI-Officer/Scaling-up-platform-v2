import { completeSuFullLandscapeReport } from "@/__tests__/fixtures/su-full-landscape";
import type { RespondentReport } from "@/lib/assessments/respondent-report";
import { SU_FULL_QUESTION_BENCHMARKS } from "@/lib/assessments/su-full-question-benchmarks";

/**
 * Current-score sequence transcribed from Jeff's supplied two-page Condensed
 * artifact and mapped through the locked Scaling Up Full Esperto crosswalk.
 */
export const CONDENSED_GOLDEN_CURRENT_SCORES = [
  6, 7, 7, 7, 8, 8, 8, 8, 7, 8, 8, 8, 8,
  8, 8, 8, 8, 8, 8, 8,
  8, 8, 8, 9, 7, 8, 10, 8, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9,
  9, 9, 9, 9, 9,
  9, 9, 5, 7, 7, 9, 9, 8, 9, 8, 9, 9, 9, 9, 9, 9,
] as const;

export function condensedGoldenReport(): RespondentReport {
  const report = completeSuFullLandscapeReport();
  report.respondentName = "Golden CEO";
  report.result.peerBenchmarkSnapshot = undefined;
  report.result.perQuestion = report.result.perQuestion.map((question, index) => ({
    ...question,
    value: CONDENSED_GOLDEN_CURRENT_SCORES[index],
    peerValue: undefined,
  }));
  return report;
}

export const CONDENSED_GOLDEN_PEERS = SU_FULL_QUESTION_BENCHMARKS.map(
  ({ value }) => value,
);
