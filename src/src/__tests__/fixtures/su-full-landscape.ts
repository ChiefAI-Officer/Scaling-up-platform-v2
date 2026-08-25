import {
  buildSuFullPeerPresentation,
  type SuFullPeerPresentation,
} from "@/lib/assessments/su-full-peer-presentation";
import {
  SCALING_UP_FULL_TEMPLATE_ALIAS,
  SU_FULL_QUESTION_BENCHMARKS,
} from "@/lib/assessments/su-full-question-benchmarks";
import {
  SU_FULL_PHASE_PEER_CONTENT_HASHES,
  SU_FULL_PHASE_PEER_SOURCE_ID,
  getGovernedPeerValue,
} from "@/lib/assessments/su-full-phase-peer-catalogue";
import type { RespondentReport } from "@/lib/assessments/respondent-report";
import { prepareReportHtmlForStorage } from "@/lib/assessments/report-html";
import { buildTemplateContent } from "../../../prisma/seed-scaling-up-full-assessment";

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
  const content = buildTemplateContent();
  const sliderQuestions = content.questions.filter(
    (question): question is Extract<(typeof content.questions)[number], { type: "SLIDER_LIKERT" }> =>
      question.type === "SLIDER_LIKERT",
  );
  if (sliderQuestions.length !== SU_FULL_QUESTION_BENCHMARKS.length) {
    throw new Error("Canonical seed and peer benchmark question counts differ");
  }

  const questionsByKey = Object.fromEntries(
    sliderQuestions.map((question, index) => {
      const benchmark = SU_FULL_QUESTION_BENCHMARKS[index];
      if (question.stableKey !== benchmark.stableKey) {
        throw new Error(`Canonical seed/benchmark mismatch at ${question.stableKey}`);
      }
      return [
        question.stableKey,
        {
          type: "SLIDER_LIKERT",
          label: question.label,
          sectionStableKey: question.sectionStableKey,
          max: question.scale.max,
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
      scaleUpScore: 55,
      recommendationPhase: 4,
      peerBenchmarkSnapshot: {
        sourceId: SU_FULL_PHASE_PEER_SOURCE_ID,
        contentHash: SU_FULL_PHASE_PEER_CONTENT_HASHES[4],
        phase: 4,
      },
      perQuestion: sliderQuestions.map((question, index) => {
        const value = index % 11;
        const selectedBand = question.recommendations.find(
          (band) => value >= band.minScore && value <= band.maxScore,
        );
        if (!selectedBand) throw new Error(`No canonical feedback band for ${question.stableKey}=${value}`);
        return {
          stableKey: question.stableKey,
          value,
          achieved: true,
          recommendation: selectedBand.text,
          peerValue: getGovernedPeerValue(question.stableKey, 4) ?? undefined,
        };
      }),
      perSection: [],
    } as unknown as RespondentReport["result"],
    sections: content.sections,
    questionByKey: Object.fromEntries(
      sliderQuestions.map((question) => [
        question.stableKey,
        question.label,
      ]),
    ),
    questionsByKey,
    rawAnswers: [{ stableKey: "Q_FTE_CONTRACT", value: 12 }],
    scoringConfig: content.scoringConfig,
    provenance: {
      submissionId: "sub-landscape-1",
      versionId: "ver-landscape-4",
      contentHash: "landscape-hash-4",
      templateName: "Scaling Up Full",
    },
    degraded: false,
  };
}

/** Edition 6 authored preface and CTA used by landscape report render tests. */
export function restoredScalingUpFullCtaReport(): RespondentReport {
  const prepared = prepareReportHtmlForStorage({
    reportHtml: {
      schemaVersion: 1,
      introductionHtml: [
        '<div aria-label="Verne Harnish preface">',
        '<strong aria-label="Preface heading">PREFACE</strong>',
        '<p>Dear {{respondentName}},\n\nCongratulations! You are now the owner of your own personalized ScaleUp Assessment report. With this report you will gain a better understanding of how well prepared you are for Scaling Up, how you and your company compare to your peers and what your priorities may be. To reach the \'next level\' you now have the choice of using the Scaling Up book, implementing a growth program or working with a coach. Ultimately, this report will work as a guide and input towards your personal growth path. {{companyName}}, you can use this report as a guide and as input for your personal growth path.\n\nThe assessment has been predominantly devised utilizing the Scaling Up / Rockefeller Habits 2.0 methodology, alongside academic growth models and organizational development theories. We have received input from many seasoned growth entrepreneurs, coaches, mentors and academics. We hope and believe you will be positively surprised by the number of Scaling Up insights throughout this report. We would highly recommend repeating this assessment annually, in order to keep track of your progress.\n\nI wish you many great insights. Enjoy the report and keep scaling!</p>',
        '<img src="https://platformtest.scalingup.com/brand/verne-harnish-preface.jpg" alt="Verne Harnish">',
        '<span aria-label="Verne Harnish signature"></span>',
        '<aside>Verne Harnish, CEO\nScaling Up\nAuthor of Scaling Up (Rockefeller Habits 2.0)\nThe Greatest Business Decisions of All Time\nMastering the Rockefeller Habits</aside>',
        "</div>",
      ].join(""),
      conclusionHtml: [
        '<section aria-label="Scaling Up Full next steps">',
        '<p><strong>Next step</strong> – Go back thru the book Scaling Up (Rockefeller Habits 2.0) or start with Mastering the Rockefeller Habits (quicker/simpler read to start).</p>',
        '<img src="https://platformtest.scalingup.com/brand/scaling-up-books.png" alt="Mastering the Rockefeller Habits and Scaling Up books">',
        '<p>Or you can schedule a complimentary one-hour debrief of your assessment with one of our 280+ coaching partners around the globe.</p>',
        '<a href="https://coaches.scalingup.com/coach-match-after-assessment-form" target="_blank" rel="noopener noreferrer" aria-label="Request a complimentary follow-up">YES! I WOULD LIKE A COMPLIMENTARY FOLLOW-UP</a>',
        '<a href="https://scalingup.com/book/" target="_blank" rel="noopener noreferrer" aria-label="Buy the books">YES! I LIKE TO BUY THE BOOKS</a>',
        "</section>",
      ].join(""),
    },
  });
  if (!prepared.ok) throw new Error(prepared.issues.map((issue) => issue.message).join(" "));
  const report = completeSuFullLandscapeReport();
  return {
    ...report,
    reportHtml: (prepared.reportConfig as { reportHtml: typeof report.reportHtml }).reportHtml,
  };
}

export function completeSuFullLandscapePresentation(
  report: RespondentReport = completeSuFullLandscapeReport(),
): SuFullPeerPresentation {
  const presentation = buildSuFullPeerPresentation({
    report,
  });
  if (!presentation) throw new Error("Canonical landscape fixture must build a peer presentation");
  return presentation;
}

export const LANDSCAPE_FIRST_QUESTION_KEY = keyFor(1);
