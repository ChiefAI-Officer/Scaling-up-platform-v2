import {
  buildPeerComparisonSection,
  isPeerRenderEnabledAlias,
  PEER_RENDER_ENABLED_ALIASES,
  type PeerComparisonSection,
} from "@/lib/assessments/peer-benchmarks";
import { hasSourcePublicResult } from "@/lib/assessments/report-config";
import { effectiveReportStyle } from "@/lib/assessments/report-style-policy";
import type { RespondentReport } from "@/lib/assessments/respondent-report";
import {
  buildSuFullPeerPresentationResult,
} from "@/lib/assessments/su-full-peer-presentation";
import { LVA_TEMPLATE_ALIAS } from "@/lib/assessments/lva-report-display";
import { SCALING_UP_FULL_TEMPLATE_ALIAS } from "@/lib/assessments/su-full-question-benchmarks";
import { isPeerBenchmarksEnabled } from "@/lib/assessments/wave-s-flags";

type BenchmarkRow = {
  metricKey: string;
  value: number;
  updatedAt: Date;
};

export interface PeerReportResolverDb {
  assessmentBenchmark: {
    findMany(args: {
      where: { templateId: string; metricKind: "QUESTION" };
      select: { metricKey: true; value: true; updatedAt: true };
    }): Promise<BenchmarkRow[]>;
  };
  assessmentSubmission?: {
    findFirst(args: {
      where: { id: string };
      select: { campaign: { select: { templateId: true } } };
    }): Promise<{ campaign: { templateId: string } } | null>;
  };
  assessmentCampaign?: {
    findFirst(args: {
      where: { id: string; deletedAt: null };
      select: { templateId: true };
    }): Promise<{ templateId: string } | null>;
  };
}

export type PeerReportEnhancements = Readonly<{
  report: RespondentReport;
  lvaPeerComparison: PeerComparisonSection | null;
}>;

type ResolverInput = {
  db: PeerReportResolverDb;
  report: RespondentReport;
  reportStylesAvailable: boolean;
  peerBenchmarksEnabled?: boolean;
  enabledAliases?: readonly string[];
  logger?: Pick<Console, "warn">;
};

function unchanged(report: RespondentReport): PeerReportEnhancements {
  return { report, lvaPeerComparison: null };
}

function logUnavailable(
  logger: Pick<Console, "warn">,
  input: { report: RespondentReport; templateId?: string },
  details: Record<string, unknown>,
): void {
  try {
    logger.warn("assessment.peer_benchmark.unavailable", {
      templateAlias: input.report.templateAlias,
      templateId: input.templateId,
      submissionId: input.report.provenance.submissionId,
      versionId: input.report.provenance.versionId,
      ...details,
    });
  } catch {
    // Telemetry cannot turn an optional report enhancement into a render error.
  }
}

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : "UnknownError";
}

/**
 * Adds the currently applicable peer reference data to one frozen report.
 * All gates run before the single template-level QUESTION benchmark query.
 */
export async function resolvePeerReportEnhancements(
  input: ResolverInput & { templateId: string },
): Promise<PeerReportEnhancements> {
  const logger = input.logger ?? console;
  const peerBenchmarksEnabled = input.peerBenchmarksEnabled ?? isPeerBenchmarksEnabled();
  if (!peerBenchmarksEnabled) return unchanged(input.report);

  const templateAlias = input.report.templateAlias;
  const enabledAliases = input.enabledAliases ?? PEER_RENDER_ENABLED_ALIASES;
  const aliasEnabled = input.enabledAliases === undefined
    ? isPeerRenderEnabledAlias(templateAlias)
    : enabledAliases.includes(templateAlias);
  if (!aliasEnabled) return unchanged(input.report);

  const isSuFull = templateAlias === SCALING_UP_FULL_TEMPLATE_ALIAS;
  const isLva = templateAlias === LVA_TEMPLATE_ALIAS;
  if (!isSuFull && !isLva) return unchanged(input.report);

  const resolvedStyle = hasSourcePublicResult(
    templateAlias,
    input.report.publicLeadActions,
  )
    ? "CLASSIC"
    : effectiveReportStyle({
        storedStyle: typeof input.report.reportStyle === "string"
          ? input.report.reportStyle
          : undefined,
        available: input.reportStylesAvailable,
      });
  if (isSuFull && resolvedStyle !== "CLASSIC") return unchanged(input.report);

  let rows: BenchmarkRow[];
  try {
    rows = await input.db.assessmentBenchmark.findMany({
      where: { templateId: input.templateId, metricKind: "QUESTION" },
      select: { metricKey: true, value: true, updatedAt: true },
    });
  } catch (error) {
    logUnavailable(logger, input, { reason: "DB_ERROR", errorName: errorName(error) });
    return unchanged(input.report);
  }

  if (isLva) {
    return {
      report: input.report,
      lvaPeerComparison: buildPeerComparisonSection({
        questionsByKey: input.report.questionsByKey,
        rawAnswers: input.report.rawAnswers,
        benchmarks: new Map(rows.map((row) => [row.metricKey, row.value])),
        templateAlias,
      }),
    };
  }

  const result = buildSuFullPeerPresentationResult({
    report: input.report,
    benchmarks: rows,
  });
  if (result.status === "unavailable") {
    logUnavailable(logger, input, {
      reason: result.reason,
      expectedCount: result.expectedCount,
      benchmarkCount: result.benchmarkCount,
      scoreCount: result.scoreCount,
    });
    return unchanged(input.report);
  }

  return {
    report: { ...input.report, suFullPeerPresentation: result.presentation },
    lvaPeerComparison: null,
  };
}

export async function resolvePeerReportEnhancementsForCampaign(
  input: ResolverInput & { campaignId: string },
): Promise<PeerReportEnhancements> {
  const logger = input.logger ?? console;
  try {
    const campaign = await input.db.assessmentCampaign?.findFirst({
      where: { id: input.campaignId, deletedAt: null },
      select: { templateId: true },
    });
    if (!campaign) {
      logUnavailable(logger, input, { reason: "CAMPAIGN_TEMPLATE_NOT_FOUND" });
      return unchanged(input.report);
    }
    return resolvePeerReportEnhancements({ ...input, templateId: campaign.templateId });
  } catch (error) {
    logUnavailable(logger, input, { reason: "DB_ERROR", errorName: errorName(error) });
    return unchanged(input.report);
  }
}

export async function resolvePeerReportEnhancementsForSubmission(
  input: ResolverInput,
): Promise<PeerReportEnhancements> {
  const logger = input.logger ?? console;
  try {
    const submission = await input.db.assessmentSubmission?.findFirst({
      where: { id: input.report.provenance.submissionId },
      select: { campaign: { select: { templateId: true } } },
    });
    if (!submission) {
      logUnavailable(logger, input, { reason: "SUBMISSION_TEMPLATE_NOT_FOUND" });
      return unchanged(input.report);
    }
    return resolvePeerReportEnhancements({
      ...input,
      templateId: submission.campaign.templateId,
    });
  } catch (error) {
    logUnavailable(logger, input, { reason: "DB_ERROR", errorName: errorName(error) });
    return unchanged(input.report);
  }
}
