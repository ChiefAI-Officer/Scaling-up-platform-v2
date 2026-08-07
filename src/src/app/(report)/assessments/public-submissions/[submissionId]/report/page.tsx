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
import { ReportStyleScope } from "@/components/assessments/ReportStyleScope";
import {
  defaultReportGateDeps,
  viewPublicReferralReport,
} from "@/lib/assessments/report-access-gate";
import { isFindingsLogicEnabled } from "@/lib/assessments/wave-u-flags";

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

  const { report, reportStylesAvailable } = outcome;

  return (
    <ReportStyleScope
      report={report}
      reportStylesAvailable={reportStylesAvailable}
    >
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
          reportFindingsAvailable={isFindingsLogicEnabled()}
        />
      </div>
    </ReportStyleScope>
  );
}
