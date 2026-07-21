/**
 * PrintReportButton (#64 / DT-2 — Print vs Download split, TDD).
 *
 * Jeff asked for a distinct Print AND Download affordance on the report. There
 * is no server-side PDF: both actions open the browser print dialog (which
 * renders the branded PDF via the @media print rules in su-report.css). The
 * difference is that "Download PDF" first sets document.title to a descriptive
 * `fileName` so the browser's "Save as PDF" gets a good default filename, then
 * restores the original title once the dialog closes (`afterprint`).
 *
 * Tests:
 *  1. Renders BOTH a "Print" and a "Download PDF" button
 *  2. "Print" calls window.print once and never touches document.title
 *  3. "Download PDF" sets document.title to fileName, prints, restores on afterprint
 *  4. "Download PDF" with no fileName just prints (no title change)
 *  5. Both buttons carry the `no-print` class (hidden in the print output)
 */

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { PrintReportButton } from "@/components/assessments/PrintReportButton";

describe("PrintReportButton (#64 — Print / Download split)", () => {
  let printMock: jest.SpyInstance;

  beforeEach(() => {
    printMock = jest.spyOn(window, "print").mockImplementation(() => undefined);
  });

  afterEach(() => {
    printMock.mockRestore();
    document.title = "";
  });

  it("renders BOTH a Print and a Download PDF button", () => {
    render(<PrintReportButton />);
    expect(screen.getByRole("button", { name: /^print$/i })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /download pdf/i })
    ).toBeInTheDocument();
  });

  it("Print calls window.print once and does NOT change document.title", () => {
    document.title = "Original";
    render(<PrintReportButton fileName="Acme - LVA - Group Report" />);
    fireEvent.click(screen.getByRole("button", { name: /^print$/i }));
    expect(printMock).toHaveBeenCalledTimes(1);
    expect(document.title).toBe("Original");
  });

  it("Download PDF sets document.title to fileName before printing, then restores it on afterprint", () => {
    document.title = "Original";
    render(<PrintReportButton fileName="Acme - LVA - Group Report" />);
    fireEvent.click(screen.getByRole("button", { name: /download pdf/i }));
    expect(printMock).toHaveBeenCalledTimes(1);
    // title is set to the descriptive filename for the print dialog
    expect(document.title).toBe("Acme - LVA - Group Report");
    // browser fires afterprint when the dialog closes → title restored
    window.dispatchEvent(new Event("afterprint"));
    expect(document.title).toBe("Original");
  });

  it("repeat Download invocations restore to the TRUE original title (re-entry guard)", () => {
    document.title = "Original";
    render(<PrintReportButton fileName="Acme - LVA - Group Report" />);
    const download = screen.getByRole("button", { name: /download pdf/i });
    // Two clicks before afterprint fires: the guard skips the 2nd capture so
    // the restore target is never poisoned to the filename.
    fireEvent.click(download);
    fireEvent.click(download);
    expect(document.title).toBe("Acme - LVA - Group Report");
    window.dispatchEvent(new Event("afterprint"));
    expect(document.title).toBe("Original");
  });

  it("Download PDF with no fileName just prints (no title change)", () => {
    document.title = "Original";
    render(<PrintReportButton />);
    fireEvent.click(screen.getByRole("button", { name: /download pdf/i }));
    expect(printMock).toHaveBeenCalledTimes(1);
    expect(document.title).toBe("Original");
  });

  it("both buttons carry the no-print class so they are hidden on print", () => {
    render(<PrintReportButton />);
    expect(screen.getByRole("button", { name: /^print$/i })).toHaveClass(
      "no-print"
    );
    expect(screen.getByRole("button", { name: /download pdf/i })).toHaveClass(
      "no-print"
    );
  });
});
