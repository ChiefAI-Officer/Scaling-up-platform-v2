import {
  buildSuFullPeerPresentation,
  type SuFullPeerPresentation,
} from "@/lib/assessments/su-full-peer-presentation";
import {
  SCALING_UP_FULL_TEMPLATE_ALIAS,
  SU_FULL_QUESTION_BENCHMARKS,
} from "@/lib/assessments/su-full-question-benchmarks";
import type { RespondentReport } from "@/lib/assessments/respondent-report";

export const LANDSCAPE_SECTION_RANGES = [
  ["S_PEOPLE_YE", "Your Employees", "people", 1, 8],
  ["S_PEOPLE_CC", "Company Culture", "people", 9, 13],
  ["S_STRATEGY", "Strategy", "strategy", 14, 20],
  ["S_EXEC_LT", "Leadership Team", "execution", 21, 24],
  ["S_EXEC_OP", "Operational Processes", "execution", 25, 29],
  ["S_EXEC_SM", "Sales and Marketing", "execution", 30, 34],
  ["S_EXEC_SIT", "Scalability, Innovation and Technology", "execution", 35, 40],
  ["S_CASH", "Cash", "cash", 41, 45],
  ["S_YOU_LEAD", "Your Leadership", "you", 46, 55],
  ["S_YOU_IC", "Internal Communication", "you", 56, 61],
] as const;

function keyFor(number: number): string {
  return `Q${String(number).padStart(2, "0")}`;
}

/** A canonical ten-section frozen report for landscape-composition tests. */
export function completeSuFullLandscapeReport(): RespondentReport {
  const questionsByKey = Object.fromEntries(
    SU_FULL_QUESTION_BENCHMARKS.map((benchmark, index) => {
      const section = LANDSCAPE_SECTION_RANGES.find(
        ([, , , start, end]) => index + 1 >= start && index + 1 <= end,
      );
      if (!section) throw new Error(`No canonical section for ${benchmark.stableKey}`);
      return [
        benchmark.stableKey,
        {
          type: "SLIDER_LIKERT",
          label: `Canonical question ${index + 1}`,
          sectionStableKey: section[0],
          max: 10,
        },
      ];
    }),
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
      perQuestion: SU_FULL_QUESTION_BENCHMARKS.map((benchmark, index) => ({
        stableKey: benchmark.stableKey,
        value: index % 11,
        achieved: true,
        recommendation: `Frozen feedback for ${benchmark.stableKey}. This deliberately long canonical recommendation exercises landscape print density without changing its fixed page allocation.`,
      })),
      perSection: [],
    } as unknown as RespondentReport["result"],
    sections: LANDSCAPE_SECTION_RANGES.map(([stableKey, name, domain]) => ({
      stableKey,
      name,
      domain,
    })),
    questionByKey: Object.fromEntries(
      SU_FULL_QUESTION_BENCHMARKS.map((benchmark, index) => [
        benchmark.stableKey,
        `Canonical question ${index + 1}`,
      ]),
    ),
    questionsByKey,
    rawAnswers: [{ stableKey: "Q_FTE_CONTRACT", value: 12 }],
    scoringConfig: {},
    provenance: {
      submissionId: "sub-landscape-1",
      versionId: "ver-landscape-4",
      contentHash: "landscape-hash-4",
      templateName: "Scaling Up Full",
    },
    degraded: false,
  };
}

export function completeSuFullLandscapePresentation(
  report: RespondentReport = completeSuFullLandscapeReport(),
): SuFullPeerPresentation {
  const presentation = buildSuFullPeerPresentation({
    report,
    benchmarks: SU_FULL_QUESTION_BENCHMARKS.map((benchmark) => ({
      metricKey: benchmark.stableKey,
      value: benchmark.value,
      updatedAt: new Date("2026-08-18T00:00:00Z"),
    })),
  });
  if (!presentation) throw new Error("Canonical landscape fixture must build a peer presentation");
  return presentation;
}

export const LANDSCAPE_FIRST_QUESTION_KEY = keyFor(1);
