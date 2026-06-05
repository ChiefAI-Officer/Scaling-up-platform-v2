"use client";

/**
 * PrintReportButton — Task 3.
 *
 * A screen-only "Print / Download PDF" button that triggers the browser's
 * print dialog, producing a clean branded PDF via the @media print rules in
 * su-report.css.  The `no-print` class hides this button in the print output
 * so it never appears in the generated PDF.
 */

export function PrintReportButton() {
  return (
    <button
      type="button"
      className="no-print su-cta su-report-print-btn"
      onClick={() => window.print()}
    >
      Print / Download PDF
    </button>
  );
}

export default PrintReportButton;
