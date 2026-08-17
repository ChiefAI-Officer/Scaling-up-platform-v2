/**
 * Assessment v7.6 — coach/admin-gated per-respondent results report PAGE.
 *
 * Server component. URL: /assessments/[id]/respondents/[respondentId]/report
 * (sibling to (portal); renders the brand-scoped report WITHOUT portal chrome —
 * see (report)/layout.tsx).
 *
 * The cross-cutting protocol — actor resolution (+ redirect-login on no actor),
 * the fail-closed rate-limit guard, the authorized load (canManageCampaign
 * inside getRespondentReport — ADMIN/STAFF bypass + owning coach), forbidden /
 * not-found → enumeration-safe 404, and the fail-closed VIEW_REPORT audit (now
 * with IP/UA) — lives in the Report access gate (viewRespondentReport → the pure
 * report-gate-core). See ADR-0012. This page keeps only the OK render + the
 * page-owned `view` metric.
 *
 * H15 (cache/PII): dynamic = "force-dynamic" + revalidate = 0 keep the page out
 *   of any static/edge cache; the real `Cache-Control` header is layered in
 *   middleware.
 */

import { notFound } from "next/navigation";
import {
  viewRespondentReport,
  viewCeoSelfRespondentReport,
  defaultReportGateDeps,
} from "@/lib/assessments/report-access-gate";
import { reportConfigFor } from "@/lib/assessments/report-config";
import { emitReportMetric } from "@/lib/assessments/report-metrics";
import { BrandedReport } from "@/components/assessments/BrandedReport";
import { ReportStyleScope } from "@/components/assessments/ReportStyleScope";
import { PrintReportButton } from "@/components/assessments/PrintReportButton";
import { ReportComparisonControls } from "@/components/assessments/ReportComparisonControls";
import { db } from "@/lib/db";
import { getApiActor } from "@/lib/auth/authorization";
import {
  asReportComparisonDb,
  listReportComparisonCandidates,
  loadReportComparison,
  type ReportComparisonViewer,
} from "@/lib/assessments/report-comparison";
import {
  REPORT_COMPARISON_ALIAS,
  isReportComparisonEnabled,
  isReportComparisonRolloutActive,
} from "@/lib/assessments/wave-report-comparison-flags";
import { resolveCeoViewerFromExactPathSession } from "@/lib/assessments/ceo-report-access";
import { getCeoReportAccessSession } from "@/lib/assessments/ceo-report-access-cookie";
import { logAuditStrict } from "@/lib/audit";
import {
  resolvePeerReportEnhancementsForCampaign,
} from "@/lib/assessments/peer-report-resolver";
import type { RespondentReport } from "@/lib/assessments/respondent-report";
import { isFindingsLogicEnabled } from "@/lib/assessments/wave-u-flags";
import { isMobileResponsiveEnabled } from "@/lib/mobile-responsive-flags";

// H15: never statically render or cache the report (PII).
export const dynamic = "force-dynamic";
export const revalidate = 0;

interface PageProps {
  params: Promise<{ id: string; respondentId: string }>;
  searchParams?: Promise<{ compareTo?: string }>;
}

export default async function RespondentReportPage({ params, searchParams }: PageProps) {
  const mobileResponsiveEnabled = isMobileResponsiveEnabled();
  const { id, respondentId } = await params;
  const compareTo = (await searchParams)?.compareTo;
  const actor = await getApiActor();
  const viewer: ReportComparisonViewer | null = actor
    ? { kind: "operator", actor }
    : await resolveCeoViewerFromExactPathSession(id, respondentId);

  const gate = viewer?.kind === "ceo-self"
    ? await viewCeoReport(viewer, id, respondentId)
    : await viewRespondentReport(defaultReportGateDeps(), { campaignId: id, respondentId });
  const { outcome, metricRole } = gate;

  // forbidden / not-found already 404'd inside the gate; this narrows the type.
  if (outcome.status !== "ok") {
    notFound();
  }

  const { report, reportStylesAvailable } = outcome;
  const peerEnhancements = await resolvePeerReportEnhancementsForCampaign({
    db,
    report,
    campaignId: id,
    reportStylesAvailable,
  });

  // Page-owned success marker (the gate emits only the request-ending events).
  emitReportMetric("respondent", "view", {
    role: metricRole,
    template: report.templateAlias ?? null,
    reportType: reportConfigFor(report.templateAlias).reportType,
  });

  const canonicalHref = `/assessments/${encodeURIComponent(id)}/respondents/${encodeURIComponent(respondentId)}/report`;
  const comparison = viewer
    ? await resolveReportComparison({
        viewer,
        campaignId: id,
        respondentId,
        submissionId: report.provenance.submissionId,
        templateAlias: report.templateAlias,
        compareTo,
      })
    : { candidates: [], bounded: false, model: null, error: false };

  return (
    <ReportStyleScope
      report={peerEnhancements.report}
      reportStylesAvailable={reportStylesAvailable}
    >
      <div
        className="su-report-page"
        data-responsive-report-page={mobileResponsiveEnabled ? "" : undefined}
      >
        <div className="su-report-actions no-print">
          <PrintReportButton
            fileName={reportExportName(peerEnhancements.report, comparison.model)}
          />
          {comparison.candidates.length > 0 ? (
            <ReportComparisonControls
              candidates={comparison.candidates}
              selectedSubmissionId={comparison.model?.baseline.submissionId ?? null}
              bounded={comparison.bounded}
              canonicalHref={canonicalHref}
            />
          ) : null}
        </div>
        {comparison.error ? (
          <p className="no-print su-report-comparison-error" role="alert">
            That earlier assessment cannot be compared with this report.
          </p>
        ) : null}
        <BrandedReport
          report={peerEnhancements.report}
          campaignLabel={peerEnhancements.report.campaignLabel}
          peerComparison={peerEnhancements.lvaPeerComparison}
          reportStylesAvailable={reportStylesAvailable}
          reportFindingsAvailable={isFindingsLogicEnabled()}
          comparison={comparison.model}
          responsiveEnabled={mobileResponsiveEnabled}
        />
      </div>
    </ReportStyleScope>
  );
}

async function viewCeoReport(
  viewer: Extract<ReportComparisonViewer, { kind: "ceo-self" }>,
  campaignId: string,
  respondentId: string,
) {
  const session = await getCeoReportAccessSession(campaignId, respondentId);
  if (
    !session ||
    session.focusCampaignId !== viewer.focusCampaignId ||
    session.focusSubmissionId !== viewer.focusSubmissionId ||
    session.respondentId !== viewer.respondentId
  ) {
    notFound();
  }
  return viewCeoSelfRespondentReport(defaultReportGateDeps(), session);
}

async function resolveReportComparison(input: {
  viewer: ReportComparisonViewer;
  campaignId: string;
  respondentId: string;
  submissionId: string;
  templateAlias: string | null;
  compareTo?: string;
}) {
  const empty = { candidates: [], bounded: false, model: null, error: false };
  if (input.templateAlias !== REPORT_COMPARISON_ALIAS) return empty;
  if (!isReportComparisonRolloutActive()) return empty;

  try {
    const campaign = await db.assessmentCampaign.findFirst({
      where: { id: input.campaignId, deletedAt: null },
      select: { organizationId: true, templateId: true, template: { select: { alias: true } } },
    });
    if (
      !campaign ||
      campaign.organizationId === null ||
      campaign.template?.alias !== REPORT_COMPARISON_ALIAS ||
      !isReportComparisonEnabled({ organizationId: campaign.organizationId, templateId: campaign.templateId })
    ) return empty;

    const focus = {
      campaignId: input.campaignId,
      respondentId: input.respondentId,
      submissionId: input.submissionId,
    };
    const candidates = await listReportComparisonCandidates(asReportComparisonDb(db), input.viewer, focus);
    if (candidates.kind !== "ok") return empty;
    if (input.compareTo === undefined) {
      return { ...empty, candidates: candidates.candidates, bounded: candidates.bounded };
    }
    if (!candidates.candidates.some((candidate) => candidate.submissionId === input.compareTo)) {
      return { candidates: candidates.candidates, bounded: candidates.bounded, model: null, error: true };
    }

    const selected = await loadReportComparison(
      asReportComparisonDb(db),
      input.viewer,
      focus,
      input.compareTo,
    );
    if (selected.kind !== "ok") {
      return { candidates: candidates.candidates, bounded: candidates.bounded, model: null, error: true };
    }
    try {
      await logAuditStrict({
        entityType: "AssessmentSubmission",
        entityId: input.submissionId,
        action: "VIEW_REPORT_COMPARISON",
        performedBy: input.viewer.kind === "operator" ? input.viewer.actor.userId : "CEO_SELF",
        changes: {
          kind: "report-native-comparison",
          focusCampaignId: input.campaignId,
          focusSubmissionId: input.submissionId,
          baselineSubmissionId: selected.model.baseline.submissionId,
          baselineCampaignId: selected.model.baseline.campaignId,
        },
      });
    } catch {
      return { candidates: candidates.candidates, bounded: candidates.bounded, model: null, error: true };
    }
    return { candidates: candidates.candidates, bounded: candidates.bounded, model: selected.model, error: false };
  } catch {
    return input.compareTo !== undefined ? { ...empty, error: true } : empty;
  }
}

function reportExportName(
  report: RespondentReport,
  comparison: import("@/lib/assessments/report-comparison-model").ReportComparisonModel | null,
): string {
  if (!comparison) return `${report.respondentName} - ${report.assessmentName} - Report`;
  const focus = reportPeriodLabel(report.campaignLabel, report.submittedAt);
  const baseline = reportPeriodLabel(comparison.baseline.campaignLabel, comparison.baseline.submittedAt);
  return `${report.respondentName} - ${report.assessmentName} - ${focus} vs ${baseline}`;
}

function reportPeriodLabel(label: string | null, submittedAt: Date): string {
  const campaign = label?.trim();
  if (campaign) return campaign;
  const date = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(submittedAt);
  return `Scaling Up Assessment · ${date}`;
}
