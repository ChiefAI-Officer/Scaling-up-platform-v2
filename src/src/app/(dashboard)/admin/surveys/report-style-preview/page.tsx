import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/authorization";
import {
  buildReportStylePreviewReport,
  isReportStylePreviewAnatomy,
  isReportStylePreviewVariant,
  type ReportStylePreviewAnatomy,
} from "@/lib/assessments/report-style-preview-fixture";
import {
  isReportStyleKey,
  REPORT_STYLE_PREVIEW_PAGES,
  type ReportStyleKey,
  type ReportStylePreviewPage,
} from "@/lib/assessments/report-style-registry";
import { BrandedReport } from "@/components/assessments/BrandedReport";
import { ReportStyleScope } from "@/components/assessments/ReportStyleScope";
import "@/styles/su-public-brand.css";
import "@/styles/su-report.css";
import "@/styles/su-report-executive.css";
import "@/styles/su-report-dashboard.css";

type PreviewPage = ReportStylePreviewPage;

const PREVIEW_PAGES = new Set<PreviewPage>(REPORT_STYLE_PREVIEW_PAGES);

function isPreviewPage(value: unknown): value is PreviewPage {
  return (
    typeof value === "string" && PREVIEW_PAGES.has(value as PreviewPage)
  );
}

/**
 * Capture-only selection is applied after the complete real renderer mounts.
 * Scored reports use their physical summary/detail pages. Qualitative and
 * sparse reports have no invented summary block, so their logical Summary and
 * Detail previews select authored blocks from the real detail page.
 */
function PreviewSelectionStyles() {
  return (
    <style>{`
      [data-preview-style="CLASSIC"][data-preview-page="cover"] .su-report > :not(.su-report-cover),
      [data-preview-style="CLASSIC"][data-preview-anatomy="scored"][data-preview-page="summary"] .su-report > :not(.su-report-overall),
      [data-preview-style="CLASSIC"][data-preview-anatomy="scored"][data-preview-page="detail"] .su-report > :not(.su-report-recs),
      [data-preview-style="CLASSIC"][data-preview-anatomy="qualitative"][data-preview-page="summary"] .su-report > :not([data-testid="qual-preface"]),
      [data-preview-style="CLASSIC"][data-preview-anatomy="qualitative"][data-preview-page="detail"] .su-report > :not([data-testid="qual-section-reflection"]),
      [data-preview-style="CLASSIC"][data-preview-anatomy="sparse-custom"][data-preview-page="summary"] .su-report > :not([data-testid="qual-section-founder-reflections"]),
      [data-preview-style="CLASSIC"][data-preview-anatomy="sparse-custom"][data-preview-page="detail"] .su-report > :not([data-testid="qual-section-operating-reflections"]) { display: none; }

      [data-preview-style="EXECUTIVE_BOARDROOM"][data-preview-page="cover"] .su-report--executive > .report-page:not(.report-page--executive-cover),
      [data-preview-style="MODERN_DASHBOARD"][data-preview-page="cover"] .su-report--dashboard > .report-page:not(.report-page--dashboard-cover),
      [data-preview-style="EXECUTIVE_BOARDROOM"][data-preview-anatomy="scored"][data-preview-page="summary"] .su-report--executive > .report-page:not(.report-page--executive-summary),
      [data-preview-style="MODERN_DASHBOARD"][data-preview-anatomy="scored"][data-preview-page="summary"] .su-report--dashboard > .report-page:not(.report-page--dashboard-summary),
      [data-preview-style="EXECUTIVE_BOARDROOM"][data-preview-page="detail"] .su-report--executive > .report-page:not(.report-page--executive-detail),
      [data-preview-style="MODERN_DASHBOARD"][data-preview-page="detail"] .su-report--dashboard > .report-page:not(.report-page--dashboard-detail),
      [data-preview-style="EXECUTIVE_BOARDROOM"][data-preview-anatomy]:not([data-preview-anatomy="scored"])[data-preview-page="summary"] .su-report--executive > .report-page:not(.report-page--executive-detail),
      [data-preview-style="MODERN_DASHBOARD"][data-preview-anatomy]:not([data-preview-anatomy="scored"])[data-preview-page="summary"] .su-report--dashboard > .report-page:not(.report-page--dashboard-detail) { display: none; }

      [data-preview-anatomy="scored"][data-preview-page="detail"] .report-page--executive-detail [data-report-role="section"] ~ [data-report-role="section"],
      [data-preview-anatomy="scored"][data-preview-page="detail"] .report-page--dashboard-detail [data-report-role="section"] ~ [data-report-role="section"],
      [data-preview-anatomy="scored"][data-preview-page="summary"] .report-page--executive-summary [data-report-role="domain"] ~ [data-report-role="domain"] ~ [data-report-role="domain"],
      [data-preview-anatomy="scored"][data-preview-page="summary"] .report-page--dashboard-summary [data-report-role="domain"] ~ [data-report-role="domain"] ~ [data-report-role="domain"],
      [data-preview-anatomy="scored"][data-preview-page="detail"] .report-page--executive-detail .report-action-group ~ .report-action-group,
      [data-preview-anatomy="scored"][data-preview-page="detail"] .report-page--dashboard-detail .report-action-group ~ .report-action-group,
      [data-preview-anatomy="scored"][data-preview-page="detail"] .report-page--executive-detail [data-report-block="additional-response"],
      [data-preview-anatomy="scored"][data-preview-page="detail"] .report-page--dashboard-detail [data-report-block="additional-response"],
      [data-preview-anatomy="scored"][data-preview-page="detail"] .report-page--executive-detail [data-report-block="coach-cta"],
      [data-preview-anatomy="scored"][data-preview-page="detail"] .report-page--dashboard-detail [data-report-block="coach-cta"],
      [data-preview-anatomy="scored"][data-preview-page="detail"] .report-page--executive-detail [data-report-block="closing"],
      [data-preview-anatomy="scored"][data-preview-page="detail"] .report-page--dashboard-detail [data-report-block="closing"],
      [data-preview-anatomy="qualitative"][data-preview-page="summary"] .report-page--executive-detail [data-report-block="narrative-response"],
      [data-preview-anatomy="qualitative"][data-preview-page="summary"] .report-page--executive-detail [data-report-block="finding"],
      [data-preview-anatomy="qualitative"][data-preview-page="summary"] .report-page--dashboard-detail [data-report-block="narrative-response"],
      [data-preview-anatomy="qualitative"][data-preview-page="summary"] .report-page--dashboard-detail [data-report-block="finding"],
      [data-preview-anatomy="qualitative"][data-preview-page="detail"] .report-page--executive-detail [data-report-block]:not([data-report-block="narrative-response"]):not([data-report-block="finding"]),
      [data-preview-anatomy="qualitative"][data-preview-page="detail"] .report-page--dashboard-detail [data-report-block]:not([data-report-block="narrative-response"]):not([data-report-block="finding"]),
      [data-preview-anatomy="sparse-custom"][data-preview-page="summary"] [data-testid="report-style-narrative-operating-reflections"],
      [data-preview-anatomy="sparse-custom"][data-preview-page="detail"] [data-testid="report-style-narrative-founder-reflections"] { display: none; }
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

function PreviewRenderer({
  style,
  page,
  anatomy,
  variant,
}: {
  style: ReportStyleKey;
  page: PreviewPage;
  anatomy: ReportStylePreviewAnatomy;
  variant: Parameters<typeof buildReportStylePreviewReport>[1];
}) {
  const report = {
    ...buildReportStylePreviewReport(anatomy, variant),
    reportStyle: style,
  };

  return (
    <ReportStyleScope
      report={report}
      reportStylesAvailable
    >
      <article
        className={`report-style-preview--${style.toLowerCase().replaceAll("_", "-")}`}
        data-preview-anatomy={anatomy}
        data-preview-page={page}
        data-preview-style={style}
        data-testid={`report-style-preview-page-${page}`}
      >
        <PreviewSelectionStyles />
        <BrandedReport
          report={report}
          reportStylesAvailable
          reportFindingsAvailable
        />
        <PreviewEndMarker />
      </article>
    </ReportStyleScope>
  );
}

export default async function ReportStylePreviewPage({
  searchParams,
}: {
  searchParams: Promise<{
    style?: string;
    page?: string;
    capture?: string;
    anatomy?: string;
    variant?: string;
  }>;
}) {
  await requireAdmin();
  const query = await searchParams;
  const anatomy = query.anatomy ?? "scored";
  const variant = query.variant ?? "normal";

  if (
    !isReportStyleKey(query.style) ||
    !isPreviewPage(query.page) ||
    !isReportStylePreviewAnatomy(anatomy) ||
    !isReportStylePreviewVariant(variant)
  ) {
    notFound();
  }

  const letter = query.style !== "CLASSIC";
  const printPageName =
    query.style === "EXECUTIVE_BOARDROOM"
      ? "executive-report"
      : query.style === "MODERN_DASHBOARD"
        ? "dashboard-report"
        : undefined;
  const captureMode = query.capture === "1";

  return (
    <main
      data-capture={captureMode ? "true" : "false"}
      data-preview-anatomy={anatomy}
      data-preview-style={query.style}
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
          [data-capture="true"] > article { box-sizing: border-box; height: calc(100% - 1px); min-height: calc(100% - 1px); }
          [data-capture="true"] > article > .su-report,
          [data-capture="true"] > article > .su-report--executive,
          [data-capture="true"] > article > .su-report--dashboard,
          [data-capture="true"] .report-page--executive-cover,
          [data-capture="true"] .report-page--dashboard-cover { box-sizing: border-box; height: 100%; min-height: 100%; }
          [data-capture="true"] [data-preview-style="CLASSIC"][data-preview-page="cover"] .su-report-cover { box-sizing: border-box; height: 100%; min-height: 100%; }
          @media print {
            #main-content { max-width: none !important; padding: 0 !important; }
            #main-content > :not([data-testid="report-style-preview-root"]),
            #main-content ~ *,
            #main-content ~ * + * { display: none !important; }
            body :has(> #main-content) > :not(#main-content) { display: none !important; }
            #main-content { display: block !important; }
            #main-content > [data-testid="report-style-preview-root"] { height: auto !important; margin: 0 !important; max-height: none !important; min-height: 0 !important; overflow: visible !important; width: 100% !important; }
            [data-testid="report-style-preview-root"] > article,
            [data-testid="report-style-preview-root"] > article > .su-report,
            [data-testid="report-style-preview-root"] > article > .su-report--executive,
            [data-testid="report-style-preview-root"] > article > .su-report--dashboard { height: auto !important; min-height: 0 !important; }
            [data-testid="report-style-preview-root"] .report-page { height: auto !important; min-height: 0 !important; padding: 0 !important; position: relative !important; }
            [data-testid="report-style-preview-root"][data-preview-style="EXECUTIVE_BOARDROOM"] .report-page { height: 9.5in !important; }
            [data-testid="report-style-preview-root"][data-preview-style="MODERN_DASHBOARD"] .report-page { height: 9.7in !important; }
            [data-testid="report-style-preview-root"] .report-page section { margin-bottom: .75rem !important; }
            [data-testid="report-style-preview-root"] .report-page > .report-provenance { bottom: 0; left: 0; margin-top: .5rem !important; padding-top: .5rem !important; position: absolute; right: 0; }
            [data-testid="report-style-preview-root"] .report-page-break { break-before: auto !important; page-break-before: auto !important; }
            [data-testid="report-style-preview-root"] .su-report-cover { break-after: auto !important; page-break-after: auto !important; }
            [data-testid="report-style-preview-safe-bottom"] { display: none !important; }
            nav[aria-label="Main navigation"], body > div > a[href="#main-content"] { display: none !important; }
          }
        `}</style>
      ) : null}
      <PreviewRenderer
        style={query.style}
        page={query.page}
        anatomy={anatomy}
        variant={variant}
      />
    </main>
  );
}
