import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render } from "@testing-library/react";

import { ExecutiveBoardroomReport } from "@/components/assessments/report-styles/ExecutiveBoardroomReport";
import { ModernDashboardReport } from "@/components/assessments/report-styles/ModernDashboardReport";
import type { IndividualReportPresentation } from "@/lib/assessments/individual-report-presentation";

const source = (path: string) =>
  readFileSync(join(process.cwd(), "src", path), "utf8");

function blockFor(css: string, prelude: string): string {
  const start = css.indexOf(prelude);
  if (start < 0) return "";
  const open = css.indexOf("{", start);
  let depth = 0;
  for (let index = open; index < css.length; index += 1) {
    if (css[index] === "{") depth += 1;
    if (css[index] === "}") depth -= 1;
    if (depth === 0) return css.slice(start, index + 1);
  }
  return "";
}

const longToken =
  "AUTHORED_LONG_TOKEN_WITHOUT_BREAKS_ABCDEFGHIJKLMNOPQRSTUVWXYZ_0123456789_AUTHORED_LONG_TOKEN_WITHOUT_BREAKS";

const sparsePresentation: IndividualReportPresentation = {
  identity: {
    assessmentName: longToken,
    campaignLabel: null,
    campaignSubtitle: null,
    respondentName: "Alex Rivera",
    respondentEmail: null,
    respondentNameIsEmail: false,
    jobTitle: null,
    companyName: "Example Co",
    submittedAtLabel: "January 15, 2026",
  },
  provenance: {
    submissionId: "submission-id",
    versionId: "version-id",
    contentHash: "content-hash",
    templateName: "Custom prompts",
    imported: false,
  },
  blocks: [
    {
      kind: "narrative-response",
      stableKey: "custom",
      label: longToken,
      responses: [
        {
          stableKey: "long-answer",
          label: longToken,
          answer: longToken,
          type: "TEXT",
          value: longToken,
          valueLabel: longToken,
        },
      ],
    },
  ],
};

const renderers = [
  {
    label: "Executive Boardroom",
    Renderer: ExecutiveBoardroomReport,
    style: "executive",
    rootClass: "su-report--executive",
    coverClass: "report-page--executive-cover",
    pageName: "executive-report",
    cssPath: "styles/su-report-executive.css",
    margin: "0.55in",
  },
  {
    label: "Modern Dashboard",
    Renderer: ModernDashboardReport,
    style: "dashboard",
    rootClass: "su-report--dashboard",
    coverClass: "report-page--dashboard-cover",
    pageName: "dashboard-report",
    cssPath: "styles/su-report-dashboard.css",
    margin: "0.45in",
  },
] as const;

describe("adaptive report print and responsive contracts", () => {
  it.each(renderers)(
    "$label uses US Letter and omits absent summary pages instead of printing blanks",
    ({ Renderer, rootClass, coverClass, pageName, cssPath, margin }) => {
      const { container } = render(
        <Renderer presentation={sparsePresentation} />,
      );
      const css = source(cssPath);
      const page = blockFor(css, `@page ${pageName}`);

      expect(page).toContain("size: Letter");
      expect(page).toContain(`margin: ${margin}`);
      expect(
        container.querySelector(`.${rootClass} .${coverClass}`),
      ).toBeInTheDocument();
      expect(container.querySelectorAll(`.${rootClass} .report-page`)).toHaveLength(2);
      expect(
        container.querySelector(`.${rootClass} [class*="-summary"]`),
      ).not.toBeInTheDocument();
      expect(container.querySelectorAll(`.${rootClass} .report-page:empty`))
        .toHaveLength(0);
    },
  );

  it("keeps Classic on A4 while alternate styles remain explicitly Letter", () => {
    expect(source("styles/su-report.css")).toMatch(
      /@page\s*\{\s*size:\s*A4;/,
    );
    expect(source("styles/su-report-executive.css")).toMatch(
      /@page executive-report\s*\{[^}]*size:\s*Letter;/,
    );
    expect(source("styles/su-report-dashboard.css")).toMatch(
      /@page dashboard-report\s*\{[^}]*size:\s*Letter;/,
    );
  });

  it.each(renderers)(
    "$label wraps long authored content and never requires horizontal scrolling on mobile",
    ({ style, rootClass }) => {
      const globals = source("app/globals.css");
      const responsive = blockFor(
        globals,
        "@media screen and (max-width: 640px)",
      );

      expect(globals).toMatch(
        new RegExp(
          `\\.su-report--${style}\\s*\\{[^}]*max-width:\\s*100%;[^}]*overflow-wrap:\\s*anywhere;`,
        ),
      );
      expect(globals).toMatch(
        new RegExp(
          `\\.su-report--${style} \\[data-report-block\\]\\s*\\{[^}]*min-width:\\s*0;[^}]*overflow-wrap:\\s*anywhere;`,
        ),
      );
      expect(responsive).toMatch(
        new RegExp(
          `\\.su-report--${style} \\.report-page\\s*\\{[^}]*grid-template-columns:\\s*minmax\\(0,\\s*1fr\\);`,
        ),
      );
      expect(responsive).toMatch(
        new RegExp(
          `\\.su-report--${style} \\.report-page table\\s*\\{[^}]*display:\\s*table(?:\\s*!important)?;[^}]*overflow-x:\\s*visible(?:\\s*!important)?;[^}]*table-layout:\\s*fixed;[^}]*width:\\s*100%(?:\\s*!important)?;`,
        ),
      );
      expect(responsive).not.toMatch(
        new RegExp(`${rootClass.replaceAll("-", "\\-")}[^}]*overflow-x:\\s*auto;`),
      );
    },
  );

  it.each(renderers)(
    "$label keeps content-led page breaks without fixed-height empty columns",
    ({ style, cssPath }) => {
      const css = source(cssPath);
      const print = blockFor(css, "@media print");

      expect(css).toMatch(
        new RegExp(
          `\\.su-report--${style} \\.report-page \\{[^}]*page: ${style}-report;`,
        ),
      );
      expect(print).toMatch(
        new RegExp(
          `\\.su-report--${style} \\.report-page \\{[^}]*min-height:\\s*0;`,
        ),
      );
      expect(print).toMatch(
        new RegExp(
          `\\.su-report--${style} \\.report-page-break \\{[^}]*break-before:\\s*page;`,
        ),
      );
    },
  );
});
