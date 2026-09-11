/** @jest-environment node */

import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("authored report presentation ownership", () => {
  it("does not secretly style the Scaling Up Profits promotion from application CSS", () => {
    const reportCss = readFileSync(
      join(process.cwd(), "src", "styles", "su-report.css"),
      "utf8",
    );

    expect(reportCss).not.toContain("Scaling Up Profits promotion");
    expect(reportCss).not.toContain("Scaling Up Profits metrics and call to action");
    expect(reportCss).not.toContain("Book a free call");
  });
});
