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
import { ReportHtmlSection } from "@/components/assessments/ReportHtmlSection";
import type { SafeReportHtml } from "@/lib/assessments/report-html";
import type { ReactNode } from "react";

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
  reportHtml,
  responsiveEnabled = false,
  beforeConclusion,
}: {
  presentation: IndividualReportPresentation;
  comparison?: ReportComparisonModel | null;
  reportHtml?: SafeReportHtml;
  responsiveEnabled?: boolean;
  beforeConclusion?: ReactNode;
}) {
  const { summary, detail } = partitionReportBlocks(presentation.blocks, {
    replaceConclusion: Boolean(reportHtml?.conclusionHtml),
  });
  const conclusionBlocks = beforeConclusion && !reportHtml?.conclusionHtml
    ? detail.filter(
        (block) => block.kind === "coach-cta" || block.kind === "closing",
      )
    : [];
  const detailBlocks = beforeConclusion
    ? detail.filter(
        (block) => block.kind !== "coach-cta" && block.kind !== "closing",
      )
    : detail;
  const coverBlocks = summary.filter((block) => block.kind === "score-summary");
  const summaryBlocks = summary.filter((block) => block.kind !== "score-summary");

  return (
    <article
      className={`su-report--dashboard ${assessmentInter.variable}`}
      data-testid="modern-dashboard-report"
      data-responsive-report={responsiveEnabled ? "" : undefined}
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
      {reportHtml?.introductionHtml ? (
        <section className="report-page report-page--dashboard-introduction report-page-break">
          <ReportHtmlSection
            position="introduction"
            html={reportHtml.introductionHtml}
            personalization={presentation.identity}
          />
          <ReportProvenance presentation={presentation} />
        </section>
      ) : null}
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
            responsiveEnabled={responsiveEnabled}
          />
          <ReportProvenance presentation={presentation} />
        </section>
      ) : null}
      {detailBlocks.length > 0 ? (
        <section className="report-page report-page--dashboard-detail report-page-break">
          <ReportBlocks blocks={detailBlocks} />
          <ReportProvenance presentation={presentation} />
        </section>
      ) : null}
      {beforeConclusion ? (
        <section className="report-page report-page--dashboard-generated-addon report-page-break">
          {beforeConclusion}
          <ReportProvenance presentation={presentation} />
        </section>
      ) : null}
      {conclusionBlocks.length > 0 ? (
        <section className="report-page report-page--dashboard-conclusion report-page-break">
          <ReportBlocks blocks={conclusionBlocks} />
          <ReportProvenance presentation={presentation} />
        </section>
      ) : null}
      {reportHtml?.conclusionHtml ? (
        <section className="report-page report-page--dashboard-conclusion report-page-break">
          <ReportHtmlSection
            position="conclusion"
            html={reportHtml.conclusionHtml}
            personalization={presentation.identity}
          />
          <ReportProvenance presentation={presentation} />
        </section>
      ) : null}
    </article>
  );
}
