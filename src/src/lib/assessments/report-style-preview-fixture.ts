import {
  applyScoredReportFindingsPolicy,
  buildScoredReportViewModel,
  type ScoredReportViewModel,
} from "@/lib/assessments/scored-report-view-model";
import {
  buildIndividualReportPresentation,
  type IndividualReportPresentation,
} from "@/lib/assessments/individual-report-presentation";
import type { RespondentReport } from "@/lib/assessments/respondent-report";
import {
  REPORT_STYLE_PREVIEW_ANATOMIES,
  type ReportStylePreviewAnatomy,
} from "@/lib/assessments/report-style-registry";

export {
  REPORT_STYLE_PREVIEW_ANATOMIES,
  type ReportStylePreviewAnatomy,
};

export type ReportStylePreviewVariant =
  | "normal"
  | "partial"
  | "degraded"
  | "max-length"
  | "missing-blocks"
  | "long-branding";

export const REPORT_STYLE_PREVIEW_VARIANTS = Object.freeze([
  "normal",
  "partial",
  "degraded",
  "max-length",
  "missing-blocks",
  "long-branding",
] as const satisfies readonly ReportStylePreviewVariant[]);

const previewAnatomies = new Set<ReportStylePreviewAnatomy>(
  REPORT_STYLE_PREVIEW_ANATOMIES,
);
const previewVariants = new Set<ReportStylePreviewVariant>(
  REPORT_STYLE_PREVIEW_VARIANTS,
);

export function isReportStylePreviewAnatomy(
  value: unknown,
): value is ReportStylePreviewAnatomy {
  return (
    typeof value === "string" &&
    previewAnatomies.has(value as ReportStylePreviewAnatomy)
  );
}

export function isReportStylePreviewVariant(
  value: unknown,
): value is ReportStylePreviewVariant {
  return (
    typeof value === "string" &&
    previewVariants.has(value as ReportStylePreviewVariant)
  );
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || typeof value !== "object") return value;
  const object = value as object;
  if (seen.has(object)) return value;
  seen.add(object);
  for (const child of Object.values(object)) deepFreeze(child, seen);
  return Object.freeze(value);
}

function previewProvenance(anatomy: ReportStylePreviewAnatomy) {
  return {
    submissionId: `preview_${anatomy.replace("-", "_")}_sub`,
    versionId: `preview_${anatomy.replace("-", "_")}_ver`,
    contentHash: `preview_${anatomy.replace("-", "_")}_hash`,
    templateName:
      anatomy === "scored"
        ? "Scaling Up Full"
        : anatomy === "qualitative"
          ? "Quarterly Reflection"
          : "Custom Founder Prompts",
  };
}

function scoredReport(): RespondentReport {
  const sectionDefinitions = [
    {
      stableKey: "people",
      name: "People",
      domain: "people",
      scores: [8, 8, 7, 7],
      labels: [
        "Everyone has a clear accountabilities map",
        "We resolve performance gaps quickly and fairly",
        "We hire people who raise the standard",
        "Our values guide difficult decisions",
      ],
    },
    {
      stableKey: "strategy",
      name: "Strategy",
      domain: "strategy",
      scores: [7, 7, 7, 7],
      labels: [
        "Our strategic choices are understood across the company",
        "Customers can explain why they choose us",
        "Our brand promise is credible",
        "We decline distractions outside our strategy",
      ],
    },
    {
      stableKey: "execution",
      name: "Execution",
      domain: "execution",
      scores: [6, 6, 6, 6],
      labels: [
        "Our quarterly priorities have a single accountable owner",
        "We use a small set of visible measures",
        "Meetings create decisions and commitments",
        "We close the loop on commitments",
      ],
    },
    {
      stableKey: "cash",
      name: "Cash",
      domain: "cash",
      scores: [5, 5, 6, 6],
      labels: [
        "We actively improve our cash conversion cycle",
        "Our cash forecast drives weekly action",
        "We price for value and margin",
        "Payment terms are consistently managed",
      ],
    },
    {
      stableKey: "you",
      name: "You",
      domain: "you",
      scores: [8, 8, 8, 8],
      labels: [
        "I protect the energy needed to lead",
        "I make time for the work only I can do",
        "I invite direct feedback",
        "I keep learning with intention",
      ],
    },
  ] as const;

  const questionsByKey: RespondentReport["questionsByKey"] = {};
  const questionByKey: RespondentReport["questionByKey"] = {};
  const perQuestion: RespondentReport["result"]["perQuestion"] = [];
  const sections = sectionDefinitions.map((section) => {
    const questions = section.scores.map((value, index) => {
      const stableKey = `${section.stableKey}-${index + 1}`;
      const label = section.labels[index];
      questionByKey[stableKey] = label;
      questionsByKey[stableKey] = {
        type: "SLIDER_LIKERT",
        label,
        sectionStableKey: section.stableKey,
        min: 0,
        max: 10,
      };
      perQuestion.push({
        stableKey,
        value,
        achieved: value >= 7,
        ...(stableKey === "cash-1"
          ? {
              recommendation:
                "Create a weekly cash conversion review with one owner for receivables, inventory, and commitments.",
            }
          : stableKey === "execution-1"
            ? {
                recommendation:
                  "Give every quarterly priority one accountable owner and a visible weekly measure.",
              }
            : {}),
      });
      return { stableKey };
    });
    return { ...section, questions };
  });

  const perSection = sectionDefinitions.map((section) => {
    const totalPoints = section.scores.reduce((sum, value) => sum + value, 0);
    return {
      stableKey: section.stableKey,
      name: section.name,
      totalPoints,
      averagePoints: totalPoints / section.scores.length,
      achievedCount: section.scores.filter((value) => value >= 7).length,
      totalCount: section.scores.length,
    };
  });
  const perDomain = perSection.map((section) => ({
    key: section.stableKey,
    label: section.name,
    averagePoints: section.averagePoints,
    answeredSectionCount: 1,
    totalSectionCount: 1,
    tier: null,
  }));

  questionByKey["preview-biggest-difference"] =
    "What would make the biggest difference this quarter?";
  questionsByKey["preview-biggest-difference"] = {
    type: "TEXT",
    label: questionByKey["preview-biggest-difference"],
  };

  return {
    respondentName: "Alex Rivera",
    respondentEmail: null,
    jobTitle: "Chief Executive Officer",
    companyName: "ABC Corp",
    assessmentName: "Scaling Up Full",
    templateAlias: "scaling-up-full",
    reportStyle: "CLASSIC",
    campaignLabel: "Annual planning workshop",
    submittedAt: new Date("2026-01-15T12:00:00.000Z"),
    result: {
      perQuestion,
      perSection,
      perDomain,
      overallTotal: 136,
      overallAverage: 6.8,
      countAchieved: perQuestion.filter((question) => question.achieved).length,
      tier: null,
      tierMetricValue: 6.8,
      scaleUpScore: 68,
      unansweredKeys: [],
    },
    sections,
    questionByKey,
    questionsByKey,
    rawAnswers: [
      {
        stableKey: "preview-biggest-difference",
        value:
          "A shared rhythm for turning strategic choices into weekly commitments, without losing the candor that made our planning workshop useful.",
      },
    ],
    scoringConfig: {
      scaleUpScore: true,
      tiers: [],
      tierMetric: "overallAvg",
      passThreshold: 1,
    },
    provenance: previewProvenance("scored"),
    degraded: false,
    coachName: "Your Scaling Up Coach",
    coachLogoUrl: null,
    isImported: false,
  };
}

function qualitativeReport(): RespondentReport {
  return {
    respondentName: "Alex Rivera",
    respondentEmail: null,
    jobTitle: "Chief Executive Officer",
    companyName: "ABC Corp",
    assessmentName: "Quarterly Reflection",
    templateAlias: "walk-qual-preview",
    reportStyle: "CLASSIC",
    campaignLabel: "Leadership planning session",
    submittedAt: new Date("2026-01-15T12:00:00.000Z"),
    result: {
      perQuestion: [],
      perSection: [],
      overallTotal: 0,
      overallAverage: 0,
      countAchieved: 0,
      tier: null,
      tierMetricValue: 0,
      unansweredKeys: [],
      findings: [
        {
          stableKey: "reflection",
          questionType: "TEXT",
          sectionStableKey: "reflection",
          questionLabel: "What changed?",
          text: "Protect the weekly planning rhythm.",
        },
      ],
    },
    sections: [
      {
        stableKey: "operating-facts",
        name: "Operating facts",
        description: "A synthetic set of current operating facts.",
      },
      {
        stableKey: "confidence",
        name: "Leadership confidence",
        description: "Choose the closest authored fit.",
      },
      { stableKey: "themes", name: "Themes" },
      { stableKey: "reflection", name: "Reflection" },
    ],
    questionByKey: {
      revenue: "Revenue in three years",
      confidence: "I can explain the strategy",
      priorities: "Which themes matter?",
      reflection: "What changed?",
    },
    questionsByKey: {
      revenue: {
        type: "NUMBER",
        label: "Revenue in three years",
        sectionStableKey: "operating-facts",
      },
      confidence: {
        type: "SLIDER_LIKERT",
        label: "I can explain the strategy",
        sectionStableKey: "confidence",
        min: 1,
        max: 3,
      },
      priorities: {
        type: "MULTI_CHOICE",
        label: "Which themes matter?",
        sectionStableKey: "themes",
        options: [
          { key: "cash", label: "Cash" },
          { key: "people", label: "People" },
        ],
      },
      reflection: {
        type: "TEXT",
        label: "What changed?",
        sectionStableKey: "reflection",
      },
    },
    rawAnswers: [
      { stableKey: "revenue", value: 0 },
      { stableKey: "confidence", value: 2 },
      { stableKey: "priorities", value: ["cash", "people"] },
      {
        stableKey: "reflection",
        value:
          "We protected focus time and made operating commitments visible.",
      },
    ],
    scoringConfig: {},
    provenance: previewProvenance("qualitative"),
    degraded: false,
    coachName: "Your Scaling Up Coach",
    coachLogoUrl: null,
    isImported: false,
  };
}

function sparseCustomReport(): RespondentReport {
  return {
    respondentName: "Alex Rivera",
    respondentEmail: null,
    jobTitle: null,
    companyName: "ABC Corp",
    assessmentName: "Custom Founder Prompts",
    templateAlias: "walk-qual-preview-sparse",
    reportStyle: "CLASSIC",
    campaignLabel: null,
    submittedAt: new Date("2026-01-15T12:00:00.000Z"),
    result: {
      perQuestion: [],
      perSection: [],
      overallTotal: 0,
      overallAverage: 0,
      countAchieved: 0,
      tier: null,
      tierMetricValue: 0,
      unansweredKeys: [],
    },
    sections: [
      { stableKey: "founder-reflections", name: "Founder reflections" },
      { stableKey: "operating-reflections", name: "Operating reflections" },
    ],
    questionByKey: {
      attention: "What deserves attention?",
      handoff: "Where does work wait unnecessarily?",
    },
    questionsByKey: {
      attention: {
        type: "TEXT",
        label: "What deserves attention?",
        sectionStableKey: "founder-reflections",
      },
      handoff: {
        type: "TEXT",
        label: "Where does work wait unnecessarily?",
        sectionStableKey: "operating-reflections",
      },
    },
    rawAnswers: [
      { stableKey: "attention", value: "Our onboarding handoff." },
      {
        stableKey: "handoff",
        value: "Decisions wait between the weekly planning and delivery rhythm.",
      },
    ],
    scoringConfig: {},
    provenance: previewProvenance("sparse-custom"),
    degraded: false,
    coachName: null,
    coachLogoUrl: null,
    isImported: false,
  };
}

function reportForAnatomy(anatomy: ReportStylePreviewAnatomy): RespondentReport {
  switch (anatomy) {
    case "scored":
      return scoredReport();
    case "qualitative":
      return qualitativeReport();
    case "sparse-custom":
      return sparseCustomReport();
  }
}

function applyPreviewVariant(
  report: RespondentReport,
  variant: ReportStylePreviewVariant,
): void {
  switch (variant) {
    case "normal":
      return;
    case "partial": {
      if (report.templateAlias === "scaling-up-full") {
        report.result.perQuestion = report.result.perQuestion.slice(0, 8);
        report.result.perSection = report.result.perSection.slice(0, 2);
        report.result.perDomain = report.result.perDomain?.slice(0, 2);
        report.sections = (report.sections as unknown[]).slice(0, 2);
      } else {
        report.sections = (report.sections as unknown[]).slice(0, 2);
        report.rawAnswers = (report.rawAnswers as unknown[]).slice(0, 2);
      }
      report.result.findings = [];
      return;
    }
    case "degraded":
      report.degraded = true;
      if (report.templateAlias === "scaling-up-full") {
        report.result.perQuestion.push({
          stableKey: "preview-missing-score",
          value: 0,
          achieved: false,
        });
        report.questionByKey["preview-missing-score"] = "Not available";
      }
      return;
    case "max-length": {
      const long =
        "A deliberately long synthetic assessment label that verifies wrapped evidence, recommendations, narrative answers, and page boundaries remain readable without clipping or overlap";
      report.assessmentName = `${long} — ${long}`;
      report.campaignLabel = `${long} — Campaign`;
      report.respondentName = "Alexandria Rivera-Montgomery-Worthington";
      report.companyName = `${long} Corporation`;
      for (const section of report.sections as Array<Record<string, unknown>>) {
        if (typeof section.name === "string") section.name = `${section.name}: ${long}`;
      }
      for (const [key, meta] of Object.entries(report.questionsByKey)) {
        meta.label = `${meta.label}. ${long}`;
        report.questionByKey[key] = meta.label;
      }
      for (const answer of report.rawAnswers as Array<{
        stableKey: string;
        value: unknown;
      }>) {
        if (typeof answer.value === "string") {
          answer.value = `${answer.value} ${long}. ${long}.`;
        }
      }
      for (const question of report.result.perQuestion) {
        if (question.recommendation) {
          question.recommendation = `${question.recommendation} ${long}. ${long}.`;
        }
      }
      if (Array.isArray(report.result.findings)) {
        report.result.findings = report.result.findings.map((finding) =>
          finding && typeof finding === "object"
            ? {
                ...finding,
                text: `${String((finding as { text?: unknown }).text ?? "")} ${long}. ${long}.`,
              }
            : finding,
        );
      }
      return;
    }
    case "missing-blocks":
      report.campaignLabel = null;
      report.jobTitle = null;
      report.respondentEmail = null;
      report.coachName = null;
      report.coachLogoUrl = null;
      report.referringCoachEmail = null;
      report.result.findings = [];
      if (report.templateAlias === "scaling-up-full") {
        report.templateAlias = "five-dysfunctions";
        report.result.perQuestion = report.result.perQuestion.map((question) => ({
          ...question,
          recommendation: undefined,
        }));
        report.rawAnswers = [];
      }
      return;
    case "long-branding":
      report.companyName =
        "The International Association for Deliberately Long but Entirely Synthetic Enterprise Transformation and Operating-System Excellence";
      report.coachName =
        "Alexandra Montgomery-Worthington, Certified Scaling Up Coach for Enterprise Transformation and Sustainable Growth";
      report.campaignLabel =
        "FY2026 Enterprise Transformation, Strategic Alignment, and Operating Rhythm Planning Campaign";
      return;
  }
}

/**
 * Returns a fresh, deeply frozen synthetic frozen-report model. No loader,
 * database, campaign, organization, respondent, or authored customer content
 * is consulted.
 */
export function buildReportStylePreviewReport(
  anatomy: ReportStylePreviewAnatomy,
  variant: ReportStylePreviewVariant,
): RespondentReport {
  const report = reportForAnatomy(anatomy);
  applyPreviewVariant(report, variant);
  return deepFreeze(report);
}

/** Uses the exact neutral adapter used by real alternate individual reports. */
export function buildReportStylePreviewPresentation(
  anatomy: ReportStylePreviewAnatomy,
  variant: ReportStylePreviewVariant,
): IndividualReportPresentation {
  return buildIndividualReportPresentation(
    buildReportStylePreviewReport(anatomy, variant),
    { findingsEnabled: true },
  );
}

/** Backwards-compatible scored visual-QA seam used by the DB-free harness. */
export function buildReportStylePreviewFixture(
  variant: ReportStylePreviewVariant,
): ScoredReportViewModel {
  return deepFreeze(
    applyScoredReportFindingsPolicy(
      buildScoredReportViewModel(
        buildReportStylePreviewReport("scored", variant),
      ),
      true,
    ),
  );
}

/** Fixed scored normal anatomy retained for existing callers and snapshots. */
export const REPORT_STYLE_PREVIEW_FIXTURE = buildReportStylePreviewFixture("normal");
