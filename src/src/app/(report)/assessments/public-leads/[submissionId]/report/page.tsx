import { notFound } from "next/navigation";
import {
  defaultReportGateDeps,
  viewPublicLeadReport,
} from "@/lib/assessments/report-access-gate";
import { BrandedReport } from "@/components/assessments/BrandedReport";
import { PrintReportButton } from "@/components/assessments/PrintReportButton";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function PublicLeadReportPage({
  params,
}: {
  params: Promise<{ submissionId: string }>;
}) {
  const { submissionId } = await params;
  const { outcome } = await viewPublicLeadReport(defaultReportGateDeps(), {
    submissionId,
  });
  if (outcome.status !== "ok") notFound();

  return (
    <div className="su-report-page">
      <div className="su-report-actions no-print">
        <div className="mr-auto">
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Public lead
          </div>
          <div className="font-semibold">{outcome.takerEmail}</div>
        </div>
        <a
          className="su-cta"
          href={`mailto:${encodeURIComponent(outcome.takerEmail)}`}
        >
          Contact {outcome.report.respondentName}
        </a>
        <PrintReportButton
          fileName={`${outcome.report.respondentName} - ${outcome.report.assessmentName} - Report`}
        />
      </div>
      <BrandedReport report={outcome.report} />
    </div>
  );
}
