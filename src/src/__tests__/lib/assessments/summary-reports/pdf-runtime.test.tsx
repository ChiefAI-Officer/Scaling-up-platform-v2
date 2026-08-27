import { execFileSync } from "node:child_process";

const RENDER_PDF_SCRIPT = `
  import { Document, Page, Text, renderToBuffer } from "@react-pdf/renderer";
  import { createElement } from "react";

  const pdf = await renderToBuffer(
    createElement(
      Document,
      { title: "Summary Reporting Runtime Proof" },
      createElement(
        Page,
        { size: "A4" },
        createElement(Text, null, "summary-report-runtime-proof"),
      ),
    ),
  );

  process.stdout.write(pdf);
`;

describe("summary report PDF runtime", () => {
  it("renders a PDF buffer", async () => {
    const pdf = execFileSync(
      process.execPath,
      ["--input-type=module", "--eval", RENDER_PDF_SCRIPT],
    );

    expect(pdf.subarray(0, 5).toString("ascii")).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(500);
  });
});
