import type { RespondentReport } from "@/lib/assessments/respondent-report";
import {
  applyScoredReportContactEmailOverride,
  applyScoredReportFindingsPolicy,
  buildReportIdentity,
  buildReportProvenance,
  buildScoredReportPresentationBlocks,
  buildScoredReportViewModel,
} from "@/lib/assessments/scored-report-view-model";
import {
  buildQualitativeModel,
  buildQualitativeReportPresentationBlocks,
} from "@/lib/assessments/qualitative-report-model";
import {
  buildFindingsSection,
  parseResolvedFindings,
  type FindingsSection,
} from "@/lib/assessments/findings-section-model";
import { reportConfigFor } from "@/lib/assessments/report-config";

export type ReportIdentity = Readonly<{
  assessmentName: string;
  campaignLabel: string | null;
  campaignSubtitle: string | null;
  respondentName: string;
  respondentEmail: string | null;
  respondentNameIsEmail: boolean;
  jobTitle: string | null;
  companyName: string;
  submittedAtLabel: string;
}>;

export type ReportProvenance = Readonly<{
  submissionId: string | null;
  versionId: string | null;
  contentHash: string | null;
  templateName: string;
  imported: boolean;
}>;

export type ScoreSummaryBlock = Readonly<{
  kind: "score-summary";
  headline: string;
  headlineLabel: string;
  tierMessage: string | null;
  showTier: boolean;
  neutral: boolean;
  overallAverage: number;
  overallAverageLabel: string;
  overallTotal: number;
  overallTotalLabel: string;
  answeredItems: number;
  sectionCount: number;
  achievementMarkersVisible: boolean;
}>;

export type ReportMetric = Readonly<{
  stableKey: string;
  label: string;
  type?: string;
  value: unknown;
  valueLabel: string;
  maximum?: number | null;
  min?: number;
  max?: number;
  achieved?: boolean;
  achievementMarker?: Readonly<{
    symbol: "✓" | "✕";
    label: "achieved" | "not achieved";
  }> | null;
  unmapped?: boolean;
}>;

export type MetricGroupSummary = Readonly<{
  average: number | null;
  averageLabel: string;
  total: number;
  totalLabel: string;
  achievedCount?: number;
  totalCount?: number;
}>;

export type MetricGroupBlock = Readonly<{
  kind: "metric-group";
  stableKey: string;
  label: string;
  role: "domain" | "section" | "other" | "qualitative";
  description?: string;
  domain?: string | null;
  color?: string | null;
  summary?: MetricGroupSummary;
  metrics: readonly ReportMetric[];
  scorecardVisible?: boolean;
}>;

export type QualitativeScaleBlock = Readonly<{
  kind: "qualitative-scale";
  stableKey: string;
  label: string;
  description?: string;
  items: readonly ReportMetric[];
}>;

export type ThemeBlock = Readonly<{
  kind: "theme";
  stableKey: string;
  label: string;
  description?: string;
  items: readonly Readonly<{
    stableKey: string;
    label: string;
    values: readonly unknown[];
    chosenLabels: readonly string[];
  }>[];
}>;

export type FindingBlock = Readonly<{
  kind: "finding";
  eyebrow: string;
  label: string;
  groups: readonly Readonly<{
    sectionName: string | null;
    items: readonly Readonly<{ stableKey: string; text: string }>[];
  }>[];
}>;

export type RecommendationBlock = Readonly<{
  kind: "recommendation";
  groups: readonly Readonly<{
    sectionStableKey: string | null;
    label: string;
    items: readonly Readonly<{ stableKey: string; text: string }>[];
  }>[];
}>;

export type NarrativeResponseBlock = Readonly<{
  kind: "narrative-response";
  stableKey: string;
  label: string;
  description?: string;
  responses: readonly Readonly<{
    stableKey: string;
    label: string;
    answer: string;
  }>[];
}>;

export type AdditionalResponseBlock = Readonly<{
  kind: "additional-response";
  responses: readonly Readonly<{ label: string; answer: string }>[];
}>;

export type CoachCtaBlock = Readonly<{
  kind: "coach-cta";
  eligible: true;
  contactEmail: string | null;
  label: "Talk to a Coach →";
  href: string;
  learnMoreHref: "https://scalingup.com";
}>;

export type ClosingBlock = Readonly<{
  kind: "closing";
  greeting: string;
  coach: Readonly<{ name: string | null; logoUrl: string | null }>;
}>;

export type IndividualReportBlock =
  | ScoreSummaryBlock
  | MetricGroupBlock
  | QualitativeScaleBlock
  | ThemeBlock
  | FindingBlock
  | RecommendationBlock
  | NarrativeResponseBlock
  | AdditionalResponseBlock
  | CoachCtaBlock
  | ClosingBlock;

export type IndividualReportPresentation = Readonly<{
  identity: ReportIdentity;
  blocks: readonly IndividualReportBlock[];
  provenance: ReportProvenance;
}>;

export type BuildIndividualReportPresentationOptions = Readonly<{
  findingsEnabled?: boolean;
  contactEmail?: string | null;
}>;

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || typeof value !== "object") return value;
  const object = value as object;
  if (seen.has(object)) return value;
  seen.add(object);
  for (const child of Object.values(object)) deepFreeze(child, seen);
  return Object.freeze(value);
}

/**
 * Adapts the already-authoritative scored or qualitative model. It does not
 * inspect the selected appearance and never re-scores or reclassifies a report.
 */
export function buildIndividualReportPresentation(
  report: RespondentReport,
  options: BuildIndividualReportPresentationOptions = {},
): IndividualReportPresentation {
  const config = reportConfigFor(report.templateAlias);
  let blocks: IndividualReportBlock[];

  if (config.reportType === "qualitative") {
    const qualitative = buildQualitativeModel({
      templateAlias: report.templateAlias,
      sections: report.sections,
      questionsByKey: report.questionsByKey,
      rawAnswers: report.rawAnswers,
    });
    const findings: FindingsSection | null = options.findingsEnabled === true
      ? buildFindingsSection(
          parseResolvedFindings(
            (report.result as { findings?: unknown } | null | undefined)?.findings,
          ),
          report.sections,
        )
      : null;
    blocks = buildQualitativeReportPresentationBlocks(qualitative, findings);
  } else {
    const selected = applyScoredReportContactEmailOverride(
      applyScoredReportFindingsPolicy(
        buildScoredReportViewModel(report),
        options.findingsEnabled === true,
      ),
      options.contactEmail,
    );
    blocks = buildScoredReportPresentationBlocks(selected);
  }

  return deepFreeze({
    identity: buildReportIdentity(report),
    blocks,
    provenance: buildReportProvenance(report),
  });
}
