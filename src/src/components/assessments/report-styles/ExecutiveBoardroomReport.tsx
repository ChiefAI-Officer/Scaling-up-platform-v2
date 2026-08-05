import type { ScoredReportViewModel } from "@/lib/assessments/scored-report-view-model";
import {
  AdditionalResponses,
  DecisionLedger,
  Recommendations,
  ReportCta,
  ReportIdentityHeader,
} from "@/components/assessments/report-styles/ReportSharedContent";

/** Structural only; Task 14 owns visual/print styling. */
export function ExecutiveBoardroomReport({ view }: { view: ScoredReportViewModel }) {
  return (
    <article className="su-report--executive" data-testid="executive-boardroom-report">
      <ReportIdentityHeader view={view} eyebrow="Executive decision brief" />
      <section aria-labelledby="executive-overview-title">
        <h2 id="executive-overview-title">Decision overview</h2>
        <p>{view.summary.headline}</p>
        <p>{view.summary.headlineLabel}</p>
      </section>
      <DecisionLedger view={view} />
      <Recommendations view={view} />
      <AdditionalResponses view={view} />
      <ReportCta view={view} />
    </article>
  );
}
