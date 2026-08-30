import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getApiActor } from "@/lib/auth/authorization";
import { viewRespondentReport, defaultReportGateDeps } from "@/lib/assessments/report-access-gate";
import { resolvePeerReportEnhancementsForCampaign } from "@/lib/assessments/peer-report-resolver";
import { buildSuFullLandscapeReportModel } from "@/lib/assessments/su-full-landscape-report";
import { buildSuFullSelfComparisonModel } from "@/lib/assessments/su-full-self-comparison";
import {
  authorizeSelfComparisonFocus,
  loadAuthorizedSelfComparison,
} from "@/lib/assessments/summary-reports/self-comparison-access";
import { SuFullLandscapeReport } from "@/components/assessments/su-full-landscape/SuFullLandscapeReport";
import { PrintReportButton } from "@/components/assessments/PrintReportButton";
import { logAuditStrict } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function SelfComparisonPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ focus?: string; earlier?: string }>;
}) {
  const { id: campaignId } = await params;
  const { focus, earlier } = await searchParams;
  const actor = await getApiActor();
  if (!actor || actor.role !== "COACH" || !focus || !earlier) notFound();

  const authorizedFocus = await authorizeSelfComparisonFocus(db, actor, {
    destinationCampaignId: campaignId,
    focusSubmissionId: focus,
  });
  if (!authorizedFocus) notFound();

  const gated = await viewRespondentReport(defaultReportGateDeps(), {
    campaignId,
    respondentId: authorizedFocus.respondentId,
  });
  if (gated.outcome.status !== "ok" || gated.outcome.report.provenance.submissionId !== authorizedFocus.submissionId) notFound();
  const access = await loadAuthorizedSelfComparison(db, actor, {
    destinationCampaignId: campaignId,
    focusSubmissionId: focus,
    earlierSubmissionId: earlier,
  });
  if (access.kind !== "ok") notFound();
  const { report, reportStylesAvailable } = gated.outcome;
  const enhanced = await resolvePeerReportEnhancementsForCampaign({ db, report, campaignId, reportStylesAvailable });
  const presentation = enhanced.report.suFullPeerPresentation;
  if (!presentation) notFound();
  const landscape = buildSuFullLandscapeReportModel({ report: enhanced.report, presentation, resolvedStyle: "CLASSIC" });
  if (!landscape) notFound();
  const selfComparison = buildSuFullSelfComparisonModel({
    focus: landscape,
    comparison: access.comparison,
    respondentName: enhanced.report.respondentName,
    focusCampaignLabel: enhanced.report.campaignLabel,
    focusSubmittedAt: enhanced.report.submittedAt,
  });
  if (!selfComparison) notFound();

  try {
    await logAuditStrict({
      entityType: "AssessmentSubmission",
      entityId: access.focus.submissionId,
      action: "VIEW_REPORT_COMPARISON",
      performedBy: actor.userId,
      changes: {
        kind: "summary-self-comparison",
        focusCampaignId: campaignId,
        focusSubmissionId: access.focus.submissionId,
        earlierCampaignId: access.comparison.baseline.campaignId,
        earlierSubmissionId: access.comparison.baseline.submissionId,
      },
    });
  } catch {
    notFound();
  }

  return <div className="su-report-page">
    <div className="su-report-actions no-print"><PrintReportButton fileName={`${enhanced.report.respondentName} - Scaling Up - Focus vs Earlier - Self Comparison`} /></div>
    <SuFullLandscapeReport report={enhanced.report} model={landscape} selfComparison={selfComparison} />
  </div>;
}
