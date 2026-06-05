/**
 * Assessment v7.6 — (report) route-group layout (Task 4).
 *
 * Minimal, brand-scoped shell for the standalone per-respondent results
 * report. This is a SIBLING route group to (portal): it deliberately renders
 * NO coach sidebar / nav so the printable report (H1) stays clean and the
 * report URL never inherits the portal chrome.
 *
 * The root layout (src/app/layout.tsx) already declares <html>/<body>, so we
 * only return a wrapper <div> — never redeclare the document shell.
 *
 * Brand scope (ADR-0005): everything is wrapped in `.su-public-brand .su-report`
 * so the public brand tokens + the detailed report CSS are fully scoped and
 * never leak into the blue admin/coach UI. BrandedReport additionally wraps its
 * own output in the same classes; the duplicate scope is harmless.
 */

import "@/styles/su-public-brand.css";
import "@/styles/su-report.css";

export default function ReportLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="su-public-brand su-report">{children}</div>;
}
