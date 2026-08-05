import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/authorization";
import {
  REPORT_STYLE_PREVIEW_FIXTURE,
} from "@/lib/assessments/report-style-preview-fixture";
import {
  isReportStyleKey,
  REPORT_STYLE_PREVIEW_PAGES,
  type ReportStyleKey,
  type ReportStylePreviewPage,
} from "@/lib/assessments/report-style-registry";
import {
  DecisionLedger,
  Recommendations,
  ReportIdentityHeader,
  ScoreMatrix,
  SectionEvidence,
  SummaryFacts,
} from "@/components/assessments/report-styles/ReportSharedContent";
import {
  type BrandedReportProps,
  LegacyClassicReport,
} from "@/components/assessments/BrandedReport";
import "@/styles/su-public-brand.css";
import "@/styles/su-report.css";
import "@/styles/su-report-executive.css";
import "@/styles/su-report-dashboard.css";

type PreviewPage = ReportStylePreviewPage;

const PREVIEW_PAGES = new Set<PreviewPage>(REPORT_STYLE_PREVIEW_PAGES);

function isPreviewPage(value: unknown): value is PreviewPage {
  return typeof value === "string" && PREVIEW_PAGES.has(value as PreviewPage);
}

function ReportProvenance() {
  return (
    <p className="report-provenance">
      Confidential assessment report · prepared for {REPORT_STYLE_PREVIEW_FIXTURE.identity.companyName}
    </p>
  );
}

function detailPreviewView() {
  const view = REPORT_STYLE_PREVIEW_FIXTURE;
  return {
    ...view,
    recommendations: view.recommendations.slice(0, 1),
    sections: view.sections.slice(0, 1),
  };
}

/**
 * A safe, fixture-only approximation of the frozen Classic report. The live
 * Classic renderer intentionally consumes a frozen RespondentReport, which a
 * preview route must never load. This uses the same report CSS and the
 * canonical presentation fixture instead.
 */
function classicPreviewReport(): BrandedReportProps["report"] {
  const view = REPORT_STYLE_PREVIEW_FIXTURE;
  const recommendationByQuestion = new Map(
    view.recommendations.flatMap((group) =>
      group.items.map((item) => [item.stableKey, item.text] as const),
    ),
  );

  return {
    respondentName: view.identity.respondentName,
    respondentEmail: view.identity.respondentEmail,
    jobTitle: view.identity.jobTitle,
    companyName: view.identity.companyName,
    assessmentName: view.identity.assessmentName,
    templateAlias: "scaling-up-full",
    reportStyle: "CLASSIC",
    campaignLabel: view.identity.campaignLabel,
    submittedAt: new Date("2026-01-15T12:00:00.000Z"),
    result: {
      perQuestion: view.sections.flatMap((section) =>
        section.questions.map((question) => ({
          stableKey: question.stableKey,
          value: question.value ?? 0,
          achieved: question.achieved,
          recommendation: recommendationByQuestion.get(question.stableKey),
        })),
      ),
      perSection: view.sections.map((section) => ({
        stableKey: section.stableKey,
        name: section.label,
        totalPoints: section.totalPoints,
        averagePoints: section.averagePoints,
        achievedCount: section.achievedCount,
        totalCount: section.totalCount,
      })),
      perDomain: view.decisions.map((decision) => ({
        key: decision.stableKey,
        label: decision.label,
        averagePoints: decision.averageAcrossSections,
        answeredSectionCount: 1,
        totalSectionCount: 1,
        tier: null,
      })),
      overallTotal: view.summary.overallTotal,
      overallAverage: view.summary.overallAverage,
      countAchieved: view.sections.reduce((total, section) => total + section.achievedCount, 0),
      tier: null,
      tierMetricValue: view.summary.overallAverage,
      scaleUpScore: 68,
      unansweredKeys: [],
    },
    sections: view.sections.map((section) => ({
      stableKey: section.stableKey,
      name: section.label,
      domain: section.domain,
      questions: section.questions.map((question) => ({ stableKey: question.stableKey })),
    })),
    questionByKey: Object.fromEntries(
      view.sections.flatMap((section) => section.questions.map((question) => [question.stableKey, question.label])),
    ),
    questionsByKey: Object.fromEntries(
      view.sections.flatMap((section) => section.questions.map((question) => [
        question.stableKey,
        { label: question.label, max: question.maximum ?? 10, sectionStableKey: section.stableKey, type: "SLIDER_LIKERT" },
      ])),
    ),
    rawAnswers: view.additionalResponses.map((response, index) => ({
      stableKey: `additional-${index}`,
      value: response.answer,
    })),
    scoringConfig: { scaleUpScore: true, tiers: [], tierMetric: "overallAvg", passThreshold: 1 },
    provenance: {
      submissionId: "synthetic-preview",
      versionId: "synthetic-preview-v1",
      contentHash: "synthetic-preview",
      templateName: view.provenance.templateName,
    },
    degraded: false,
    coachName: view.coach.name,
    coachLogoUrl: view.coach.logoUrl,
  };
}

function ClassicPreviewPage({ page }: { page: PreviewPage }) {
  const report = classicPreviewReport();

  return (
    <article className="report-style-preview--classic" data-preview-page={page} data-testid="classic-preview">
      <style>{`
        .report-style-preview--classic[data-preview-page="cover"] .su-report > :not(.su-report-cover) { display: none; }
        .report-style-preview--classic[data-preview-page="summary"] .su-report > :not(.su-report-overall) { display: none; }
        .report-style-preview--classic[data-preview-page="detail"] .su-report > :not(.su-report-recs) { display: none; }
      `}</style>
      <div data-testid={`report-style-preview-page-${page}`}>
        <LegacyClassicReport report={report} reportFindingsAvailable={false} />
      </div>
      <PreviewEndMarker />
    </article>
  );
}

function ExecutivePreviewPage({ page }: { page: PreviewPage }) {
  const view = REPORT_STYLE_PREVIEW_FIXTURE;

  return (
    <article className="su-report--executive" data-testid="executive-boardroom-report">
      {page === "cover" ? (
        <section className="report-page report-page--executive-cover" data-testid="report-style-preview-page-cover">
          <ReportIdentityHeader view={view} eyebrow="Executive decision brief" />
          <ReportProvenance />
        </section>
      ) : null}
      {page === "summary" ? (
        <section className="report-page report-page--executive-summary" data-testid="report-style-preview-page-summary">
          <SummaryFacts view={view} />
          <DecisionLedger view={view} />
          <ReportProvenance />
        </section>
      ) : null}
      {page === "detail" ? (
        <section className="report-page report-page--executive-detail" data-testid="report-style-preview-page-detail">
          <SectionEvidence view={detailPreviewView()} />
          <Recommendations view={detailPreviewView()} />
          <ReportProvenance />
        </section>
      ) : null}
      <PreviewEndMarker />
    </article>
  );
}

function DashboardPreviewPage({ page }: { page: PreviewPage }) {
  const view = REPORT_STYLE_PREVIEW_FIXTURE;

  return (
    <article className="su-report--dashboard" data-testid="modern-dashboard-report">
      {page === "cover" ? (
        <section className="report-page report-page--dashboard-cover" data-testid="report-style-preview-page-cover">
          <ReportIdentityHeader view={view} eyebrow="Diagnostic console" />
          <SummaryFacts view={view} />
          <ReportProvenance />
        </section>
      ) : null}
      {page === "summary" ? (
        <section className="report-page report-page--dashboard-summary" data-testid="report-style-preview-page-summary">
          <section className="report-pulse" aria-labelledby="dashboard-preview-pulse-title">
            <h2 id="dashboard-preview-pulse-title">Five-domain pulse</h2>
            <p>{view.summary.headline}</p>
            <p>{view.summary.headlineLabel}</p>
          </section>
          <ScoreMatrix view={view} />
          <ReportProvenance />
        </section>
      ) : null}
      {page === "detail" ? (
        <section className="report-page report-page--dashboard-detail" data-testid="report-style-preview-page-detail">
          <SectionEvidence view={detailPreviewView()} />
          <Recommendations view={detailPreviewView()} />
          <ReportProvenance />
        </section>
      ) : null}
      <PreviewEndMarker />
    </article>
  );
}

function PreviewEndMarker() {
  return (
    <span
      aria-hidden="true"
      data-testid="report-style-preview-safe-bottom"
      style={{ display: "block", height: 1, width: 1 }}
    />
  );
}

function PreviewRenderer({ style, page }: { style: ReportStyleKey; page: PreviewPage }) {
  if (style === "CLASSIC") return <ClassicPreviewPage page={page} />;
  if (style === "EXECUTIVE_BOARDROOM") return <ExecutivePreviewPage page={page} />;
  return <DashboardPreviewPage page={page} />;
}

export default async function ReportStylePreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ style?: string; page?: string; capture?: string }>;
}) {
  await requireAdmin();
  const query = await searchParams;

  if (!isReportStyleKey(query.style) || !isPreviewPage(query.page)) notFound();

  const letter = query.style !== "CLASSIC";
  const printPageName = query.style === "EXECUTIVE_BOARDROOM"
    ? "executive-report"
    : query.style === "MODERN_DASHBOARD"
      ? "dashboard-report"
      : undefined;
  const captureMode = query.capture === "1";
  return (
    <main
      data-capture={captureMode ? "true" : "false"}
      data-testid="report-style-preview-root"
      style={{
        background: "#ffffff",
        boxSizing: "border-box",
        height: letter ? "1056px" : "1123px",
        margin: "0 auto",
        maxHeight: letter ? "1056px" : "1123px",
        minHeight: letter ? "1056px" : "1123px",
        overflow: "hidden",
        page: printPageName,
        position: "relative",
        width: letter ? "816px" : "794px",
        zIndex: 100,
      }}
    >
      {captureMode ? (
        <style>{`
          [data-capture="true"] .report-style-preview--classic,
          [data-capture="true"] .report-style-preview--classic > div,
          [data-capture="true"] .report-style-preview--classic .su-report,
          [data-capture="true"] .report-page--executive-cover,
          [data-capture="true"] .report-page--dashboard-cover { box-sizing: border-box; height: 100%; min-height: 100%; }
          [data-capture="true"] > .su-report--executive,
          [data-capture="true"] > .su-report--dashboard,
          [data-capture="true"] > .report-style-preview--classic { height: 100%; }
          [data-capture="true"] .report-style-preview--classic[data-preview-page="cover"] .su-report-cover { box-sizing: border-box; height: 100%; min-height: 100%; }
          @media print {
            #main-content { max-width: none !important; padding: 0 !important; }
            #main-content > :not([data-testid="report-style-preview-root"]),
            #main-content ~ *,
            #main-content ~ * + * { display: none !important; }
            #main-content { display: block !important; }
            #main-content > [data-testid="report-style-preview-root"] { height: auto !important; margin: 0 !important; max-height: none !important; min-height: 0 !important; overflow: visible !important; width: 100% !important; }
            [data-testid="report-style-preview-root"] .report-page { page: auto !important; }
            nav[aria-label="Main navigation"], body > div > a[href="#main-content"] { display: none !important; }
          }
        `}</style>
      ) : null}
      <PreviewRenderer style={query.style} page={query.page} />
    </main>
  );
}
