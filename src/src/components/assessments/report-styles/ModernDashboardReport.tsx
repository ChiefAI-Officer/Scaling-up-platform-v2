import { assessmentInter } from "@/lib/assessments/assessment-fonts";
import type { IndividualReportPresentation } from "@/lib/assessments/individual-report-presentation";
import "@/styles/su-report-dashboard.css";
import {
  partitionReportBlocks,
  ReportBlocks,
  ReportIdentityHeader,
  ReportProvenance,
} from "@/components/assessments/report-styles/ReportSharedContent";

export function ModernDashboardReport({
  presentation,
}: {
  presentation: IndividualReportPresentation;
}) {
  const { summary, detail } = partitionReportBlocks(presentation.blocks);
  const coverBlocks = summary.filter((block) => block.kind === "score-summary");
  const summaryBlocks = summary.filter((block) => block.kind !== "score-summary");

  return (
    <article
      className={`su-report--dashboard ${assessmentInter.variable}`}
      data-testid="modern-dashboard-report"
    >
      <section className="report-page report-page--dashboard-cover">
        <ReportIdentityHeader
          presentation={presentation}
          eyebrow="Diagnostic console"
        />
        <ReportBlocks blocks={coverBlocks} />
        <ReportProvenance presentation={presentation} />
      </section>
      {summaryBlocks.length > 0 ? (
        <section className="report-page report-page--dashboard-summary report-page-break">
          <ReportBlocks blocks={summaryBlocks} />
          <ReportProvenance presentation={presentation} />
        </section>
      ) : null}
      {detail.length > 0 ? (
        <section className="report-page report-page--dashboard-detail report-page-break">
          <ReportBlocks blocks={detail} />
          <ReportProvenance presentation={presentation} />
        </section>
      ) : null}
    </article>
  );
}
