import {
  personalizeSafeReportHtml,
  type ReportHtmlPersonalization,
  type SafeReportHtmlFragment,
} from "@/lib/assessments/report-html";
import { scopeReportHtmlCss } from "@/lib/assessments/report-html-css";

export function ReportHtmlSection({
  position,
  html,
  personalization,
}: {
  position: "introduction" | "conclusion";
  html: SafeReportHtmlFragment;
  personalization?: ReportHtmlPersonalization;
}) {
  const personalizedHtml = personalization
    ? personalizeSafeReportHtml(html, personalization, position)
    : html;
  if (!personalizedHtml) return null;
  const renderedHtml = scopeReportHtmlCss(personalizedHtml, position);

  return (
    <section
      className={`su-report-custom-html su-report-custom-html--${position}`}
      data-testid={`report-html-${position}`}
      // Sole audited injection seam. `SafeReportHtmlFragment` can only be
      // produced after server-side allowlist sanitization and defensive load.
      dangerouslySetInnerHTML={{ __html: renderedHtml }}
    />
  );
}
