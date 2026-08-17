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

interface ResolverInput {
  db: PeerReportResolverDb;
  report: RespondentReport;
  reportStylesAvailable: boolean;
  peerBenchmarksEnabled?: boolean;
  enabledAliases?: readonly string[];
  logger?: Pick<Console, "warn">;
  /** Narrow seam for proving wrapper-level fail-soft behavior. */
  resolveEnhancements?: (
    input: ResolverInput & { templateId: string },
  ) => Promise<PeerReportEnhancements>;
}

type PeerReportPreflight = Readonly<{
  templateAlias: string;
  isLva: boolean;
}>;

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
 * Resolves every eligibility fact available from the frozen report alone.
 * Core and ID-wrapper callers share this gate so a miss never needs a lookup.
 */
function resolvePeerReportPreflight(input: ResolverInput): PeerReportPreflight | null {
  const peerBenchmarksEnabled = input.peerBenchmarksEnabled ?? isPeerBenchmarksEnabled();
  if (!peerBenchmarksEnabled) return null;

  const templateAlias = input.report.templateAlias;
  const enabledAliases = input.enabledAliases ?? PEER_RENDER_ENABLED_ALIASES;
  const aliasEnabled = input.enabledAliases === undefined
    ? isPeerRenderEnabledAlias(templateAlias)
    : enabledAliases.includes(templateAlias);
  if (!aliasEnabled) return null;

  const isSuFull = templateAlias === SCALING_UP_FULL_TEMPLATE_ALIAS;
  const isLva = templateAlias === LVA_TEMPLATE_ALIAS;
  if (!isSuFull && !isLva) return null;

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
  if (isSuFull && resolvedStyle !== "CLASSIC") return null;

  return { templateAlias, isLva };
}

/**
 * Adds the currently applicable peer reference data to one frozen report.
 * All gates run before the single template-level QUESTION benchmark query.
 */
export async function resolvePeerReportEnhancements(
  input: ResolverInput & { templateId: string },
): Promise<PeerReportEnhancements> {
  const logger = input.logger ?? console;
  const preflight = resolvePeerReportPreflight(input);
  if (!preflight) return unchanged(input.report);

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

  try {
    if (preflight.isLva) {
      return {
        report: input.report,
        lvaPeerComparison: buildPeerComparisonSection({
          questionsByKey: input.report.questionsByKey,
          rawAnswers: input.report.rawAnswers,
          benchmarks: new Map(rows.map((row) => [row.metricKey, row.value])),
          templateAlias: preflight.templateAlias,
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
  } catch (error) {
    logUnavailable(logger, input, {
      reason: "BUILD_ERROR",
      errorName: errorName(error),
    });
    return unchanged(input.report);
  }
}

export async function resolvePeerReportEnhancementsForCampaign(
  input: ResolverInput & { campaignId: string },
): Promise<PeerReportEnhancements> {
  const logger = input.logger ?? console;
  if (!resolvePeerReportPreflight(input)) return unchanged(input.report);
  let campaign: { templateId: string } | null | undefined;
  try {
    campaign = await input.db.assessmentCampaign?.findFirst({
      where: { id: input.campaignId, deletedAt: null },
      select: { templateId: true },
    });
  } catch (error) {
    logUnavailable(logger, input, { reason: "DB_ERROR", errorName: errorName(error) });
    return unchanged(input.report);
  }
  if (!campaign) {
    logUnavailable(logger, input, { reason: "CAMPAIGN_TEMPLATE_NOT_FOUND" });
    return unchanged(input.report);
  }
  try {
    const resolveEnhancements = input.resolveEnhancements
      ?? resolvePeerReportEnhancements;
    return await resolveEnhancements({
      ...input,
      templateId: campaign.templateId,
    });
  } catch (error) {
    logUnavailable(
      logger,
      { report: input.report, templateId: campaign.templateId },
      { reason: "RESOLVER_ERROR", errorName: errorName(error) },
    );
    return unchanged(input.report);
  }
}

export async function resolvePeerReportEnhancementsForSubmission(
  input: ResolverInput,
): Promise<PeerReportEnhancements> {
  const logger = input.logger ?? console;
  if (!resolvePeerReportPreflight(input)) return unchanged(input.report);
  let submission: { campaign: { templateId: string } } | null | undefined;
  try {
    submission = await input.db.assessmentSubmission?.findFirst({
      where: { id: input.report.provenance.submissionId },
      select: { campaign: { select: { templateId: true } } },
    });
  } catch (error) {
    logUnavailable(logger, input, { reason: "DB_ERROR", errorName: errorName(error) });
    return unchanged(input.report);
  }
  if (!submission) {
    logUnavailable(logger, input, { reason: "SUBMISSION_TEMPLATE_NOT_FOUND" });
    return unchanged(input.report);
  }
  try {
    const resolveEnhancements = input.resolveEnhancements
      ?? resolvePeerReportEnhancements;
    return await resolveEnhancements({
      ...input,
      templateId: submission.campaign.templateId,
    });
  } catch (error) {
    logUnavailable(
      logger,
      { report: input.report, templateId: submission.campaign.templateId },
      { reason: "RESOLVER_ERROR", errorName: errorName(error) },
    );
    return unchanged(input.report);
  }
}
