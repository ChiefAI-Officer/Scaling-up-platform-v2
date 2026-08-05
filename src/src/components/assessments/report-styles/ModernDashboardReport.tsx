import type { ScoredReportViewModel } from "@/lib/assessments/scored-report-view-model";
import { assessmentInter } from "@/lib/assessments/assessment-fonts";
import "@/styles/su-report-dashboard.css";
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

function ReportProvenance({ view }: { view: ScoredReportViewModel }) {
  return (
    <p className="report-provenance" data-testid="report-style-provenance">
      Confidential assessment report · prepared for {view.identity.companyName}
    </p>
  );
}

export function ModernDashboardReport({ view }: { view: ScoredReportViewModel }) {
  return (
    <article className={`su-report--dashboard ${assessmentInter.variable}`} data-testid="modern-dashboard-report">
      <section className="report-page report-page--dashboard-cover">
        <DegradedNotice view={view} />
        <ReportIdentityHeader view={view} eyebrow="Diagnostic console" />
        <SummaryFacts view={view} />
        <ReportProvenance view={view} />
      </section>
      <section className="report-page report-page--dashboard-summary report-page-break">
        <section className="report-pulse" aria-labelledby="dashboard-pulse-title">
          <h2 id="dashboard-pulse-title">Five-domain pulse</h2>
          <p>{view.summary.headline}</p>
          <p>{view.summary.headlineLabel}</p>
        </section>
        <DecisionLedger view={view} />
        <StrengthsAndPriorities view={view} />
        <ScoreMatrix view={view} />
        <ReportProvenance view={view} />
      </section>
      <section className="report-page report-page--dashboard-detail report-page-break">
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
