"use client";

/**
 * PrintReportButton — report action bar (#64 / DT-2).
 *
 * Two screen-only actions, both opening the browser print dialog (which renders
 * the branded PDF via the @media print rules in su-report.css):
 *  - "Print"        → window.print() as-is.
 *  - "Download PDF" → sets document.title to `fileName` first (browsers use the
 *    document title as the default "Save as PDF" filename), prints, then
 *    restores the title once the dialog closes (`afterprint`).
 *
 * Jeff (#64) asked for a distinct Print vs Download affordance. There is no
 * server-side PDF route — the browser's "Save as PDF" destination is the
 * download path — so the split is about the affordance + a good default
 * filename, not two different rendering pipelines.
 *
 * The `no-print` class on both buttons (and the wrapping bar) hides them in the
 * print output so they never appear in the generated PDF.
 */

export function PrintReportButton({ fileName }: { fileName?: string }) {
  function handleDownload() {
    // Re-entry guard: only swap the title when it is not already `fileName`.
    // The print dialog is modal (so a second click mid-dialog can't happen),
    // but the guard makes a repeat invoke idempotent regardless — without it a
    // second capture would read `original === fileName` and leave the title
    // stuck. `{ once: true }` auto-removes the restore listener after it fires
    // (afterprint fires on both print AND cancel). This is a "use client"
    // component, so the click handler only runs in the browser.
    if (fileName && document.title !== fileName) {
      const original = document.title;
      document.title = fileName;
      window.addEventListener(
        "afterprint",
        () => {
          document.title = original;
        },
        { once: true }
      );
    }
    window.print();
  }

  return (
    <div className="no-print su-report-print-actions">
      <button
        type="button"
        className="no-print su-cta su-report-print-btn"
        onClick={() => window.print()}
      >
        Print
      </button>
      <button
        type="button"
        className="no-print su-cta su-report-download-btn"
        onClick={handleDownload}
      >
        Download PDF
      </button>
    </div>
  );
}

export default PrintReportButton;
