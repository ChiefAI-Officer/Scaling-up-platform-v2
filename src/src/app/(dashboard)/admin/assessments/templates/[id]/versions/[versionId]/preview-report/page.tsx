import { notFound } from "next/navigation";
import { BrandedReport } from "@/components/assessments/BrandedReport";
import { ReportStyleScope } from "@/components/assessments/ReportStyleScope";
import { loadSafeReportHtml } from "@/lib/assessments/report-html";
import { buildReportHtmlPreviewReport } from "@/lib/assessments/report-html-preview";
import { requireAdmin } from "@/lib/auth/authorization";
import { db } from "@/lib/db";
import "@/styles/su-public-brand.css";
import "@/styles/su-report.css";
import "@/styles/su-report-executive.css";
import "@/styles/su-report-dashboard.css";

export default async function ReportHtmlPreviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; versionId: string }>;
  searchParams: Promise<{ peerReference?: string }>;
}) {
  await requireAdmin();
  const [{ id, versionId }, query] = await Promise.all([params, searchParams]);
  const template = await db.assessmentTemplate.findUnique({
    where: { id },
    select: {
      id: true,
      alias: true,
      name: true,
      versions: {
        where: { id: versionId },
        select: {
          id: true,
          templateId: true,
          questions: true,
          sections: true,
          scoringConfig: true,
          reportConfig: true,
        },
      },
    },
  });
  const version = template?.versions[0];
  if (!template || !version || version.templateId !== template.id) notFound();

  const report = {
    ...buildReportHtmlPreviewReport({
      template,
      version,
      peerReference:
        template.alias === "scaling-up-full"
        && query.peerReference === "historical"
          ? "historical"
          : "current",
    }),
    reportHtml: loadSafeReportHtml(version.reportConfig),
  };
  return (
    <main data-testid="report-html-full-preview">
      <aside data-print-hidden className="print:hidden">
        Representative preview content
      </aside>
      <ReportStyleScope report={report} reportStylesAvailable>
        <div className="su-report-page">
          <BrandedReport
            report={report}
            reportStylesAvailable
            reportFindingsAvailable
          />
        </div>
      </ReportStyleScope>
    </main>
  );
}
