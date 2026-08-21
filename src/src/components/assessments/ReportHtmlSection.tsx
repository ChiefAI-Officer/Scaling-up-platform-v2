import type { SafeReportHtmlFragment } from "@/lib/assessments/report-html";

export function ReportHtmlSection({
  position,
  html,
}: {
  position: "introduction" | "conclusion";
  html: SafeReportHtmlFragment;
}) {
  return (
    <section
      className={`su-report-custom-html su-report-custom-html--${position}`}
      data-testid={`report-html-${position}`}
      // Sole audited injection seam. `SafeReportHtmlFragment` can only be
      // produced after server-side allowlist sanitization and defensive load.
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
