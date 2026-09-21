import { notFound } from "next/navigation";
import { BrandedReport } from "@/components/assessments/BrandedReport";
import { PrintReportButton } from "@/components/assessments/PrintReportButton";
import { ReportStyleScope } from "@/components/assessments/ReportStyleScope";
import { defaultReportGateDeps } from "@/lib/assessments/report-access-gate-deps";
import { viewMemberRespondentReport } from "@/lib/assessments/member-report-gate";
import { emitReportMetric } from "@/lib/assessments/report-metrics";
import { reportConfigFor } from "@/lib/assessments/report-config";
import { isFindingsLogicEnabled } from "@/lib/assessments/wave-u-flags";
import { isMemberPortalEnabled } from "@/lib/members/flags";
import { getMemberSession } from "@/lib/members/session";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function MemberReportPage({
  params,
}: {
  params: Promise<{ submissionId: string }>;
}) {
  if (!isMemberPortalEnabled()) notFound();
  const session = await getMemberSession();
  if (!session.normalizedEmail) notFound();
  const { submissionId } = await params;
  const { outcome, metricRole } = await viewMemberRespondentReport(defaultReportGateDeps(), {
    normalizedEmail: session.normalizedEmail,
    submissionId,
  });
  if (outcome.status !== "ok") notFound();
  const { report, reportStylesAvailable } = outcome;
  emitReportMetric("member", "view", {
    role: metricRole,
    template: report.templateAlias,
    reportType: reportConfigFor(report.templateAlias).reportType,
  });

  return (
    <ReportStyleScope report={report} reportStylesAvailable={reportStylesAvailable}>
      <div className="su-report-page">
        <div className="su-report-actions no-print"><PrintReportButton /></div>
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
