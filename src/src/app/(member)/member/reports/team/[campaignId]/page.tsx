import { notFound } from "next/navigation";
import { GroupReport, GroupReportEmpty } from "@/components/assessments/GroupReport";
import { PrintReportButton } from "@/components/assessments/PrintReportButton";
import { viewMemberGroupReport } from "@/lib/assessments/member-report-gate";
import { defaultReportGateDeps } from "@/lib/assessments/report-access-gate-deps";
import { emitReportMetric } from "@/lib/assessments/report-metrics";
import { isMemberPortalEnabled } from "@/lib/members/flags";
import { getMemberSession } from "@/lib/members/session";
import { isMobileResponsiveEnabled } from "@/lib/mobile-responsive-flags";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function MemberGroupReportPage({
  params,
}: {
  params: Promise<{ campaignId: string }>;
}) {
  if (!isMemberPortalEnabled()) notFound();
  const session = await getMemberSession();
  if (!session.normalizedEmail) notFound();

  const { campaignId } = await params;
  const generatedAt = new Date();
  const { outcome, metricRole } = await viewMemberGroupReport(
    defaultReportGateDeps(),
    { normalizedEmail: session.normalizedEmail, campaignId, generatedAt },
  );

  if (outcome.kind === "notApplicable") {
    emitReportMetric("member", "not_applicable", {
      role: metricRole,
      reason: outcome.reason,
      template: outcome.templateAlias,
    });
    return (
      <div className="su-report-page">
        <div className="su-group-empty" data-testid="group-report-not-applicable">
          <p className="su-group-empty-title">Group report is not available</p>
          <p className="su-group-empty-sub">
            This assessment does not have a group report available here.
          </p>
        </div>
      </div>
    );
  }

  if (outcome.kind === "empty") {
    emitReportMetric("member", "empty", {
      role: metricRole,
      invitedCount: outcome.provenance.invitedCount,
      completedCount: 0,
    });
    return (
      <div className="su-report-page">
        <GroupReportEmpty />
      </div>
    );
  }

  if (outcome.kind !== "ok") notFound();

  const { report, provenance } = outcome;
  const orphanCount = report.respondents.filter((respondent) => respondent.isOrphan).length;
  emitReportMetric("member", "view", {
    role: metricRole,
    template: provenance.templateAlias,
    reportType: report.reportType,
    completedCount: provenance.completedCount,
    invitedCount: provenance.invitedCount,
    orphanCount,
    degraded: report.degraded,
  });
  const ceoName = report.respondents.find((respondent) => respondent.isCEO)?.name ?? null;
  const responsiveEnabled = isMobileResponsiveEnabled();

  return (
    <div
      className="su-report-page"
      data-responsive-report-page={responsiveEnabled ? "" : undefined}
    >
      <div className="su-report-actions no-print">
        <PrintReportButton
          fileName={`${provenance.companyName} - ${provenance.assessmentName} - Group Report`}
        />
      </div>
      <GroupReport
        report={report}
        assessmentName={provenance.assessmentName}
        companyName={provenance.companyName}
        generatedAt={provenance.generatedAt}
        completedCount={provenance.completedCount}
        invitedCount={provenance.invitedCount}
        versionLabel={provenance.versionLabel}
        ceoName={ceoName}
        templateAlias={provenance.templateAlias}
        coachLogoUrl={provenance.coachLogoUrl}
        coachName={provenance.coachName}
        isImported={provenance.isImported}
        responsiveEnabled={responsiveEnabled}
      />
    </div>
  );
}
