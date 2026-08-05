import type { ScoredReportViewModel } from "@/lib/assessments/scored-report-view-model";
import {
  AdditionalResponses,
  DegradedNotice,
  DecisionLedger,
  Recommendations,
  ReportCta,
  ReportIdentityHeader,
  SectionEvidence,
  SectionScorecard,
  ScoreMatrix,
  StrengthsAndPriorities,
  SummaryFacts,
} from "@/components/assessments/report-styles/ReportSharedContent";

/** Structural only; Task 14 owns visual/print styling. */
export function ModernDashboardReport({ view }: { view: ScoredReportViewModel }) {
  return (
    <article className="su-report--dashboard" data-testid="modern-dashboard-report">
      <DegradedNotice view={view} />
      <ReportIdentityHeader view={view} eyebrow="Diagnostic console" />
      <section aria-labelledby="dashboard-pulse-title">
        <h2 id="dashboard-pulse-title">Five-domain pulse</h2>
        <p>{view.summary.headline}</p>
        <p>{view.summary.headlineLabel}</p>
      </section>
      <DecisionLedger view={view} />
      <SummaryFacts view={view} />
      <StrengthsAndPriorities view={view} />
      <ScoreMatrix view={view} />
      <SectionScorecard view={view} />
      <SectionEvidence view={view} />
      <Recommendations view={view} />
      <AdditionalResponses view={view} />
      <ReportCta view={view} />
    </article>
  );
}
