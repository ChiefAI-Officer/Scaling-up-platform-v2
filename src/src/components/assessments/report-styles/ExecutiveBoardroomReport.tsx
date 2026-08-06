import type { ScoredReportViewModel } from "@/lib/assessments/scored-report-view-model";
import { assessmentInter, assessmentPlayfairDisplay } from "@/lib/assessments/assessment-fonts";
import "@/styles/su-report-executive.css";
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

function ReportProvenance({ view }: { view: ScoredReportViewModel }) {
  return (
    <p className="report-provenance" data-testid="report-style-provenance">
      Confidential assessment report · prepared for {view.identity.companyName}
    </p>
  );
}

export function ExecutiveBoardroomReport({ view }: { view: ScoredReportViewModel }) {
  return (
    <article className={`su-report--executive ${assessmentInter.variable} ${assessmentPlayfairDisplay.variable}`} data-testid="executive-boardroom-report">
      <section className="report-page report-page--executive-cover">
        <DegradedNotice view={view} />
        <ReportIdentityHeader view={view} eyebrow="Executive decision brief" />
        <ReportProvenance view={view} />
      </section>
      <section className="report-page report-page--executive-summary report-page-break">
        <SummaryFacts view={view} />
        <DecisionLedger view={view} />
        <StrengthsAndPriorities view={view} />
        <ReportProvenance view={view} />
      </section>
      <section className="report-page report-page--executive-detail report-page-break">
        <SectionScorecard view={view} />
        <SectionEvidence view={view} />
        <Recommendations view={view} />
        <AdditionalResponses view={view} />
        <ReportCta view={view} />
        <ReportProvenance view={view} />
      </section>
    </article>
  );
}
