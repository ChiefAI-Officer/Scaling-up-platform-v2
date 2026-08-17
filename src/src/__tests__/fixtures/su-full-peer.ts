import {
  SCALING_UP_FULL_TEMPLATE_ALIAS,
  SU_FULL_QUESTION_BENCHMARKS,
} from "@/lib/assessments/su-full-question-benchmarks";
import type { RespondentReport } from "@/lib/assessments/respondent-report";

/** A complete frozen Scaling Up Full submission for peer-presentation tests. */
export function completeSuFullPeerReport(): RespondentReport {
  const keys = SU_FULL_QUESTION_BENCHMARKS.map((row) => row.stableKey);
  const questionsByKey = Object.fromEntries(
    keys.map((stableKey, index) => [
      stableKey,
      {
        type: "SLIDER_LIKERT",
        label: `Question ${index + 1}`,
        sectionStableKey: index < 8 ? "S_PEOPLE_YE" : "S_REST",
        max: 10,
      },
    ]),
  );

  return {
    respondentName: "Ari Founder",
    respondentEmail: "ari@example.com",
    jobTitle: "CEO",
    companyName: "Acme",
    assessmentName: "Scaling Up Full",
    templateAlias: SCALING_UP_FULL_TEMPLATE_ALIAS,
    reportStyle: "CLASSIC",
    campaignLabel: null,
    submittedAt: new Date("2026-08-17T00:00:00Z"),
    result: {
      perQuestion: keys.map((stableKey, index) => ({
        stableKey,
        value: index % 11,
        achieved: true,
        recommendation: `Frozen feedback ${stableKey}`,
      })),
      perSection: [],
    } as unknown as RespondentReport["result"],
    sections: [
      { stableKey: "S_PEOPLE_YE", name: "Your Employees", domain: "people" },
      { stableKey: "S_REST", name: "Remaining Questions", domain: "strategy" },
    ],
    questionByKey: Object.fromEntries(
      keys.map((key, index) => [key, `Question ${index + 1}`]),
    ),
    questionsByKey,
    rawAnswers: [],
    scoringConfig: {},
    provenance: {
      submissionId: "sub-1",
      versionId: "ver-4",
      contentHash: "hash-4",
      templateName: "Scaling Up Full",
    },
    degraded: false,
  };
}

export function completeSuFullBenchmarkRows() {
  return SU_FULL_QUESTION_BENCHMARKS.map((row, index) => ({
    metricKey: row.stableKey,
    value: row.value,
    updatedAt: new Date(
      index === 60 ? "2026-08-18T00:00:00Z" : "2026-08-17T00:00:00Z",
    ),
  }));
}
