import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/authorization";
import {
  buildReportStylePreviewFixture,
  isReportStylePreviewVariant,
} from "@/lib/assessments/report-style-preview-fixture";
import type { ScoredReportViewModel } from "@/lib/assessments/scored-report-view-model";
import {
  isReportStyleKey,
  REPORT_STYLE_PREVIEW_PAGES,
  type ReportStyleKey,
  type ReportStylePreviewPage,
} from "@/lib/assessments/report-style-registry";
import {
  ExecutiveBoardroomReport,
} from "@/components/assessments/report-styles/ExecutiveBoardroomReport";
import { ModernDashboardReport } from "@/components/assessments/report-styles/ModernDashboardReport";
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


/**
 * A safe, fixture-only approximation of the frozen Classic report. The live
 * Classic renderer intentionally consumes a frozen RespondentReport, which a
 * preview route must never load. This uses the same report CSS and the
 * canonical presentation fixture instead.
 */
function classicPreviewReport(view: ScoredReportViewModel): BrandedReportProps["report"] {
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
    degraded: view.degraded,
    coachName: view.coach.name,
    coachLogoUrl: view.coach.logoUrl,
  };
}

function ClassicPreviewPage({ page, view }: { page: PreviewPage; view: ScoredReportViewModel }) {
  const report = classicPreviewReport(view);

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

function ExecutivePreviewPage({ page, view }: { page: PreviewPage; view: ScoredReportViewModel }) {
  return (
    <div className="report-style-preview--executive" data-preview-page={page} data-testid={`report-style-preview-page-${page}`}>
      <PreviewSelectionStyles />
      <ExecutiveBoardroomReport view={view} />
      <PreviewEndMarker />
    </div>
  );
}

function DashboardPreviewPage({ page, view }: { page: PreviewPage; view: ScoredReportViewModel }) {
  return (
    <div className="report-style-preview--dashboard" data-preview-page={page} data-testid={`report-style-preview-page-${page}`}>
      <PreviewSelectionStyles />
      <ModernDashboardReport view={view} />
      <PreviewEndMarker />
    </div>
  );
}

/**
 * Capture-only selection: render the real report first, then isolate one
 * representative, complete physical segment. Nothing here alters live report
 * markup or data; it only prevents a long renderer page from being cropped.
 */
function PreviewSelectionStyles() {
  return (
    <style>{`
      .report-style-preview--executive[data-preview-page="cover"] .su-report--executive > .report-page:not(.report-page--executive-cover),
      .report-style-preview--dashboard[data-preview-page="cover"] .su-report--dashboard > .report-page:not(.report-page--dashboard-cover),
      .report-style-preview--executive[data-preview-page="summary"] .su-report--executive > .report-page:not(.report-page--executive-summary),
      .report-style-preview--dashboard[data-preview-page="summary"] .su-report--dashboard > .report-page:not(.report-page--dashboard-summary),
      .report-style-preview--executive[data-preview-page="detail"] .su-report--executive > .report-page:not(.report-page--executive-detail),
      .report-style-preview--dashboard[data-preview-page="detail"] .su-report--dashboard > .report-page:not(.report-page--dashboard-detail) { display: none; }

      .report-style-preview--executive[data-preview-page="summary"] .report-page--executive-summary [aria-label="Strengths and priorities"],
      .report-style-preview--dashboard[data-preview-page="summary"] .report-page--dashboard-summary [aria-labelledby="report-style-decisions-title"],
      .report-style-preview--dashboard[data-preview-page="summary"] .report-page--dashboard-summary [aria-label="Strengths and priorities"] { display: none; }

      .report-style-preview--executive[data-preview-page="detail"] .report-page--executive-detail [aria-label="Section scorecard"],
      .report-style-preview--dashboard[data-preview-page="detail"] .report-page--dashboard-detail [aria-label="Section scorecard"],
      .report-style-preview--executive[data-preview-page="detail"] .report-page--executive-detail [aria-label="Section and question evidence"] > .report-section:not(:first-of-type),
      .report-style-preview--dashboard[data-preview-page="detail"] .report-page--dashboard-detail [aria-label="Section and question evidence"] > .report-section:not(:first-of-type),
      .report-style-preview--executive[data-preview-page="detail"] .report-page--executive-detail [aria-labelledby="report-style-actions-title"] .report-action-group:not(:first-of-type),
      .report-style-preview--dashboard[data-preview-page="detail"] .report-page--dashboard-detail [aria-labelledby="report-style-actions-title"] .report-action-group:not(:first-of-type),
      .report-style-preview--executive[data-preview-page="detail"] .report-page--executive-detail [aria-labelledby="report-style-additional-title"],
      .report-style-preview--dashboard[data-preview-page="detail"] .report-page--dashboard-detail [aria-labelledby="report-style-additional-title"],
      .report-style-preview--executive[data-preview-page="detail"] .report-page--executive-detail footer,
      .report-style-preview--dashboard[data-preview-page="detail"] .report-page--dashboard-detail footer { display: none; }
    `}</style>
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

function PreviewRenderer({ style, page, view }: { style: ReportStyleKey; page: PreviewPage; view: ScoredReportViewModel }) {
  if (style === "CLASSIC") return <ClassicPreviewPage page={page} view={view} />;
  if (style === "EXECUTIVE_BOARDROOM") return <ExecutivePreviewPage page={page} view={view} />;
  return <DashboardPreviewPage page={page} view={view} />;
}

export default async function ReportStylePreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ style?: string; page?: string; capture?: string; variant?: string }>;
}) {
  await requireAdmin();
  const query = await searchParams;

  const variant = query.variant ?? "normal";
  if (!isReportStyleKey(query.style) || !isPreviewPage(query.page) || !isReportStylePreviewVariant(variant)) notFound();

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
      data-preview-variant={variant}
      data-testid="report-style-preview-root"
      style={{
        background: "#ffffff",
        boxSizing: "border-box",
        height: captureMode ? (letter ? "1056px" : "1123px") : "auto",
        margin: "0 auto",
        maxHeight: captureMode ? (letter ? "1056px" : "1123px") : undefined,
        maxWidth: letter ? "816px" : "794px",
        minHeight: captureMode ? (letter ? "1056px" : "1123px") : undefined,
        overflow: captureMode ? "hidden" : "visible",
        page: printPageName,
        position: "relative",
        width: captureMode ? (letter ? "816px" : "794px") : "100%",
        zIndex: 100,
      }}
    >
      {captureMode ? (
        <style>{`
          [data-capture="true"] .report-style-preview--classic,
          [data-capture="true"] .report-style-preview--executive,
          [data-capture="true"] .report-style-preview--dashboard { box-sizing: border-box; height: calc(100% - 1px); min-height: calc(100% - 1px); }
          [data-capture="true"] .report-style-preview--classic > div,
          [data-capture="true"] .report-style-preview--classic .su-report,
          [data-capture="true"] .report-style-preview--executive .su-report--executive,
          [data-capture="true"] .report-style-preview--dashboard .su-report--dashboard,
          [data-capture="true"] .report-page--executive-cover,
          [data-capture="true"] .report-page--dashboard-cover { box-sizing: border-box; height: 100%; min-height: 100%; }
          [data-capture="true"] > .report-style-preview--classic { height: calc(100% - 1px); }
          [data-capture="true"] .report-style-preview--classic[data-preview-page="cover"] .su-report-cover { box-sizing: border-box; height: 100%; min-height: 100%; }
          @media print {
            #main-content { max-width: none !important; padding: 0 !important; }
            #main-content > :not([data-testid="report-style-preview-root"]),
            #main-content ~ *,
            #main-content ~ * + * { display: none !important; }
            body :has(> #main-content) > :not(#main-content) { display: none !important; }
            #main-content { display: block !important; }
            #main-content > [data-testid="report-style-preview-root"] { height: auto !important; margin: 0 !important; max-height: none !important; min-height: 0 !important; overflow: visible !important; width: 100% !important; }
            [data-testid="report-style-preview-root"] .report-style-preview--classic,
            [data-testid="report-style-preview-root"] .report-style-preview--executive,
            [data-testid="report-style-preview-root"] .report-style-preview--dashboard,
            [data-testid="report-style-preview-root"] .report-style-preview--classic > div,
            [data-testid="report-style-preview-root"] .report-style-preview--classic .su-report,
            [data-testid="report-style-preview-root"] .report-style-preview--executive .su-report--executive,
            [data-testid="report-style-preview-root"] .report-style-preview--dashboard .su-report--dashboard { height: auto !important; min-height: 0 !important; }
            [data-testid="report-style-preview-root"] .report-page { height: auto !important; min-height: 0 !important; padding: 0 !important; }
            [data-testid="report-style-preview-root"] .report-page-break { break-before: auto !important; page-break-before: auto !important; }
            [data-testid="report-style-preview-root"] .su-report-cover { break-after: auto !important; page-break-after: auto !important; }
            [data-testid="report-style-preview-safe-bottom"] { display: none !important; }
            nav[aria-label="Main navigation"], body > div > a[href="#main-content"] { display: none !important; }
          }
        `}</style>
      ) : null}
      <PreviewRenderer style={query.style} page={query.page} view={buildReportStylePreviewFixture(variant)} />
    </main>
  );
}
