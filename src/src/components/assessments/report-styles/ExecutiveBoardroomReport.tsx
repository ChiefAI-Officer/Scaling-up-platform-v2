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
  StrengthsAndPriorities,
  SummaryFacts,
} from "@/components/assessments/report-styles/ReportSharedContent";

/** Structural only; Task 14 owns visual/print styling. */
export function ExecutiveBoardroomReport({ view }: { view: ScoredReportViewModel }) {
  return (
    <article className="su-report--executive" data-testid="executive-boardroom-report">
      <DegradedNotice view={view} />
      <ReportIdentityHeader view={view} eyebrow="Executive decision brief" />
      <SummaryFacts view={view} />
      <DecisionLedger view={view} />
      <StrengthsAndPriorities view={view} />
      <SectionEvidence view={view} />
      <SectionScorecard view={view} />
      <Recommendations view={view} />
      <AdditionalResponses view={view} />
      <ReportCta view={view} />
    </article>
  );
}
