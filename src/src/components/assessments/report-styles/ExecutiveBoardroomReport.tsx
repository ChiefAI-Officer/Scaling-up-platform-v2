import { assessmentInter, assessmentPlayfairDisplay } from "@/lib/assessments/assessment-fonts";
import type {
  IndividualReportPresentation,
  MetricGroupBlock,
} from "@/lib/assessments/individual-report-presentation";
import type { ReportComparisonModel } from "@/lib/assessments/report-comparison-model";
import "@/styles/su-report-executive.css";
import {
  ComparisonCoverSubtitle,
  ReportComparisonContent,
  type ReportComparisonLabels,
} from "@/components/assessments/ReportComparisonContent";
import {
  partitionReportBlocks,
  ReportBlocks,
  ReportIdentityHeader,
  ReportProvenance,
} from "@/components/assessments/report-styles/ReportSharedContent";

function comparisonLabels(
  presentation: IndividualReportPresentation,
): ReportComparisonLabels {
  const groups = presentation.blocks.filter(
    (block): block is MetricGroupBlock => block.kind === "metric-group",
  );
  return {
    domains: Object.fromEntries(
      groups
        .filter((group) => group.role === "domain")
        .map((group) => [group.stableKey, group.label]),
    ),
    sections: Object.fromEntries(
      groups
        .filter((group) => group.role === "section")
        .map((group) => [group.stableKey, group.label]),
    ),
    questions: Object.fromEntries(
      groups.flatMap((group) =>
        group.metrics.map((metric) => [metric.stableKey, metric.label]),
      ),
    ),
  };
}

export function ExecutiveBoardroomReport({
  presentation,
  comparison,
  responsiveEnabled = false,
}: {
  presentation: IndividualReportPresentation;
  comparison?: ReportComparisonModel | null;
  responsiveEnabled?: boolean;
}) {
  const { summary, detail } = partitionReportBlocks(presentation.blocks);

  return (
    <article
      className={`su-report--executive ${assessmentInter.variable} ${assessmentPlayfairDisplay.variable}`}
      data-testid="executive-boardroom-report"
      data-responsive-report={responsiveEnabled ? "" : undefined}
    >
      <section className="report-page report-page--executive-cover">
        <ReportIdentityHeader
          presentation={presentation}
          eyebrow="Executive decision brief"
        />
        <ComparisonCoverSubtitle comparison={comparison} />
        <ReportProvenance presentation={presentation} />
      </section>
      {summary.length > 0 ? (
        <section className="report-page report-page--executive-summary report-page-break">
          <ReportBlocks blocks={summary} />
          <ReportProvenance presentation={presentation} />
        </section>
      ) : null}
      {comparison ? (
        <section className="report-page report-page--executive-comparison report-page-break">
          <ReportComparisonContent
            comparison={comparison}
            labels={comparisonLabels(presentation)}
            responsiveEnabled={responsiveEnabled}
          />
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
