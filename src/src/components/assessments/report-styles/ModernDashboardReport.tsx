import { assessmentInter } from "@/lib/assessments/assessment-fonts";
import type {
  IndividualReportPresentation,
  MetricGroupBlock,
} from "@/lib/assessments/individual-report-presentation";
import type { ReportComparisonModel } from "@/lib/assessments/report-comparison-model";
import "@/styles/su-report-dashboard.css";
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

export function ModernDashboardReport({
  presentation,
  comparison,
}: {
  presentation: IndividualReportPresentation;
  comparison?: ReportComparisonModel | null;
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
        <ComparisonCoverSubtitle comparison={comparison} />
        <ReportBlocks blocks={coverBlocks} />
        <ReportProvenance presentation={presentation} />
      </section>
      {summaryBlocks.length > 0 ? (
        <section className="report-page report-page--dashboard-summary report-page-break">
          <ReportBlocks blocks={summaryBlocks} />
          <ReportProvenance presentation={presentation} />
        </section>
      ) : null}
      {comparison ? (
        <section className="report-page report-page--dashboard-comparison report-page-break">
          <ReportComparisonContent
            comparison={comparison}
            labels={comparisonLabels(presentation)}
          />
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
