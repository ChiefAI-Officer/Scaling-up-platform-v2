/**
 * Authenticated Results report for one Public Campaign referral submission.
 *
 * The Report access gate owns authentication, rollout gating, rate limiting,
 * domain authorization, enumeration-safe failures, and the fail-closed audit.
 * This page renders only the canonical frozen report returned after that
 * protocol succeeds.
 */

import { notFound } from "next/navigation";

import { BrandedReport } from "@/components/assessments/BrandedReport";
import { PrintReportButton } from "@/components/assessments/PrintReportButton";
import {
  defaultReportGateDeps,
  viewPublicReferralReport,
} from "@/lib/assessments/report-access-gate";
import { db } from "@/lib/db";
import { isReportStylesEnabled } from "@/lib/assessments/wave-report-styles-flags";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface PageProps {
  params: Promise<{ submissionId: string }>;
}

export default async function PublicSubmissionReportPage({
  params,
}: PageProps) {
  const { submissionId } = await params;
  const { outcome } = await viewPublicReferralReport(
    defaultReportGateDeps(),
    { submissionId },
  );

  // The gate already maps these outcomes to 404. This remains as defensive
  // type narrowing if a future gate implementation returns instead.
  if (outcome.status !== "ok") {
    notFound();
  }

  const { report } = outcome;
  const reportStylesAvailable = await resolveReportStylesAvailable(submissionId);

  return (
    <div className="su-report-page">
      <div className="su-report-actions no-print">
        <PrintReportButton
          fileName={
            `${report.respondentName} - ${report.assessmentName} - Report`
          }
        />
      </div>
      <BrandedReport
        report={report}
        campaignLabel={report.campaignLabel}
        reportStylesAvailable={reportStylesAvailable}
      />
    </div>
  );
}

async function resolveReportStylesAvailable(submissionId: string): Promise<boolean> {
  try {
    const submission = await db.assessmentSubmission.findFirst({
      where: { id: submissionId },
      select: { campaign: { select: { id: true, templateId: true } } },
    });
    const campaign = submission?.campaign;
    return campaign
      ? isReportStylesEnabled({ templateId: campaign.templateId, campaignId: campaign.id })
      : false;
  } catch {
    return false;
  }
}
