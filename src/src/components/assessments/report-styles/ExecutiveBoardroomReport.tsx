import { assessmentInter, assessmentPlayfairDisplay } from "@/lib/assessments/assessment-fonts";
import type { IndividualReportPresentation } from "@/lib/assessments/individual-report-presentation";
import "@/styles/su-report-executive.css";
import {
  partitionReportBlocks,
  ReportBlocks,
  ReportIdentityHeader,
  ReportProvenance,
} from "@/components/assessments/report-styles/ReportSharedContent";

export function ExecutiveBoardroomReport({
  presentation,
}: {
  presentation: IndividualReportPresentation;
}) {
  const { summary, detail } = partitionReportBlocks(presentation.blocks);

  return (
    <article
      className={`su-report--executive ${assessmentInter.variable} ${assessmentPlayfairDisplay.variable}`}
      data-testid="executive-boardroom-report"
    >
      <section className="report-page report-page--executive-cover">
        <ReportIdentityHeader
          presentation={presentation}
          eyebrow="Executive decision brief"
        />
        <ReportProvenance presentation={presentation} />
      </section>
      {summary.length > 0 ? (
        <section className="report-page report-page--executive-summary report-page-break">
          <ReportBlocks blocks={summary} />
          <ReportProvenance presentation={presentation} />
        </section>
      ) : null}
      {detail.length > 0 ? (
        <section className="report-page report-page--executive-detail report-page-break">
          <ReportBlocks blocks={detail} />
          <ReportProvenance presentation={presentation} />
        </section>
      ) : null}
    </article>
  );
}
