import { computeScoreResult } from "@/lib/assessments/compute-score-result";
import { buildQuestionMetaByKey } from "@/lib/assessments/question-meta";
import { loadSafeReportHtml } from "@/lib/assessments/report-html";
import { buildReportStylePreviewReport } from "@/lib/assessments/report-style-preview-fixture";
import type { RespondentReport } from "@/lib/assessments/respondent-report";
import { TemplateVersionForScoringSchema, type Answer } from "@/lib/assessments/scoring";
import { buildSuFullPeerPresentation } from "@/lib/assessments/su-full-peer-presentation";
import { SCALING_UP_FULL_TEMPLATE_ALIAS } from "@/lib/assessments/su-full-question-benchmarks";

export interface ReportHtmlPreviewInput {
  template: { id: string; alias: string; name: string };
  version: {
    id: string;
    questions: unknown;
    sections: unknown;
    scoringConfig: unknown;
    reportConfig: unknown;
  };
  peerReference: "current" | "historical";
}

const REPRESENTATIVE_SUBMITTED_AT = new Date("2026-01-15T12:00:00.000Z");

function deterministicAnswers(questions: readonly {
  stableKey: string;
  type: string;
  scale?: { min: number; max: number; step: number };
  options?: readonly { key: string }[];
}[]): Answer[] {
  return questions.map((question, index) => {
    if (question.stableKey === "Q_FTE_CONTRACT") {
      return { stableKey: question.stableKey, value: 12 };
    }
    if (question.type === "SLIDER_LIKERT") {
      const scale = question.scale;
      const steps = scale ? Math.floor((scale.max - scale.min) / scale.step) : 0;
      const value = scale ? scale.min + (index % (steps + 1)) * scale.step : 0;
      return { stableKey: question.stableKey, value };
    }
    if (question.type === "MULTI_CHOICE") {
      return { stableKey: question.stableKey, value: question.options?.[0] ? [question.options[0].key] : [] };
    }
    if (question.type === "NUMBER") return { stableKey: question.stableKey, value: 1 };
    return { stableKey: question.stableKey, value: "Representative response" };
  });
}

function withRepresentativeIdentity(
  report: RespondentReport,
  input: ReportHtmlPreviewInput,
): RespondentReport {
  return {
    ...report,
    respondentName: "Representative leader",
    respondentEmail: null,
    jobTitle: "Chief Executive Officer",
    companyName: "Representative company",
    assessmentName: input.template.name,
    templateAlias: input.template.alias,
    campaignLabel: null,
    submittedAt: REPRESENTATIVE_SUBMITTED_AT,
    reportHtml: loadSafeReportHtml(input.version.reportConfig),
    provenance: {
      submissionId: "representative-preview",
      versionId: input.version.id,
      contentHash: "representative-preview",
      templateName: input.template.name,
    },
  };
}

export function buildReportHtmlPreviewReport(
  input: ReportHtmlPreviewInput,
): RespondentReport {
  if (input.template.alias !== SCALING_UP_FULL_TEMPLATE_ALIAS) {
    return withRepresentativeIdentity(
      buildReportStylePreviewReport("scored", "normal"),
      input,
    );
  }

  const parsed = TemplateVersionForScoringSchema.safeParse({
    questions: input.version.questions,
    sections: input.version.sections,
    scoringConfig: input.version.scoringConfig,
  });
  if (!parsed.success) {
    throw new Error("Saved assessment version cannot build a representative preview");
  }
  const answers = deterministicAnswers(parsed.data.questions);
  const { result } = computeScoreResult(parsed.data, parsed.data.questions, answers, {
    allowMissingRequired: true,
    recommendationPhase: 4,
  });
  const historical = input.peerReference === "historical";
  const previewResult = historical
    ? {
        ...result,
        perQuestion: result.perQuestion.map((row) => {
          const withoutPeerValue = { ...row };
          delete withoutPeerValue.peerValue;
          return withoutPeerValue;
        }),
        peerBenchmarkSnapshot: undefined,
      }
    : result;
  const questionsByKey = buildQuestionMetaByKey(parsed.data.questions);
  const report = withRepresentativeIdentity(
    {
      respondentName: "",
      respondentEmail: null,
      jobTitle: null,
      companyName: "",
      assessmentName: "",
      templateAlias: input.template.alias,
      reportStyle: "CLASSIC",
      campaignLabel: null,
      submittedAt: REPRESENTATIVE_SUBMITTED_AT,
      result: previewResult,
      sections: parsed.data.sections,
      questionByKey: Object.fromEntries(
        Object.entries(questionsByKey).map(([key, question]) => [key, question.label]),
      ),
      questionsByKey,
      rawAnswers: answers,
      scoringConfig: parsed.data.scoringConfig,
      provenance: { submissionId: "", versionId: "", contentHash: "", templateName: "" },
      degraded: false,
    },
    input,
  );

  return {
    ...report,
    suFullPeerPresentation: buildSuFullPeerPresentation({ report }),
  };
}
