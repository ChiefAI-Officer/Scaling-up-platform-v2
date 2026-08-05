import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, within } from "@testing-library/react";

import { ExecutiveBoardroomReport } from "@/components/assessments/report-styles/ExecutiveBoardroomReport";
import { ModernDashboardReport } from "@/components/assessments/report-styles/ModernDashboardReport";
import { REPORT_STYLE_PREVIEW_FIXTURE } from "@/lib/assessments/report-style-preview-fixture";

const source = (path: string) => readFileSync(join(process.cwd(), "src", path), "utf8");

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

function styleSelectors(css: string): string[] {
  const selectors: string[] = [];
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
  for (const match of withoutComments.matchAll(/([^{}]+)\{/g)) {
    const prelude = match[1].trim();
    if (prelude.startsWith("@")) continue;
    selectors.push(...prelude.split(",").map((selector) => selector.trim()));
  }
  return selectors;
}

describe("curated report print contracts", () => {
  it.each([
    ["Executive Boardroom", ExecutiveBoardroomReport, "su-report--executive", "report-page--executive-cover"],
    ["Modern Dashboard", ModernDashboardReport, "su-report--dashboard", "report-page--dashboard-cover"],
  ] as const)("renders %s with page markers, written status labels, and recurring provenance", (_, Renderer, rootClass, coverClass) => {
    const { container } = render(<Renderer view={REPORT_STYLE_PREVIEW_FIXTURE} />);
    const report = within(container);

    expect(container.querySelector(`.${rootClass}`)).toBeInTheDocument();
    expect(container.querySelector(`.${rootClass} .${coverClass}`)).toBeInTheDocument();
    expect(container.querySelectorAll(`.${rootClass} .report-page`)).toHaveLength(3);
    expect(container.querySelectorAll(`.${rootClass} .report-page-break`)).toHaveLength(2);
    const provenance = report.getAllByTestId("report-style-provenance");
    expect(provenance).toHaveLength(3);
    for (const region of provenance) {
      expect(region).toHaveTextContent("Confidential assessment report");
    }
    expect(report.getAllByText("achieved").length).toBeGreaterThan(0);
    expect(report.getAllByText("not achieved").length).toBeGreaterThan(0);
  });

  it("uses bundled report fonts in the route shell and each client-safe renderer root", () => {
    const fonts = source("lib/assessments/assessment-fonts.ts");
    const layout = source("app/(report)/layout.tsx");
    const executive = source("components/assessments/report-styles/ExecutiveBoardroomReport.tsx");
    const dashboard = source("components/assessments/report-styles/ModernDashboardReport.tsx");

    expect(fonts).toMatch(/Playfair_Display/);
    expect(fonts).toMatch(/Inter/);
    expect(fonts).toMatch(/--font-assessment-display/);
    expect(fonts).toMatch(/--font-assessment-inter/);
    expect(layout).toMatch(/assessmentPlayfairDisplay\.variable/);
    expect(layout).toMatch(/assessmentInter\.variable/);
    expect(executive).toMatch(/assessmentPlayfairDisplay\.variable/);
    expect(executive).toMatch(/assessmentInter\.variable/);
    expect(dashboard).toMatch(/assessmentInter\.variable/);
  });

  it.each([
    ["executive", "styles/su-report-executive.css", "executive-report", "0.55in"],
    ["dashboard", "styles/su-report-dashboard.css", "dashboard-report", "0.45in"],
  ])("keeps %s CSS rooted and on a named Letter print page", (_, path, pageName, margin) => {
    const css = source(path);

    const page = blockFor(css, `@page ${pageName}`);
    const print = blockFor(css, "@media print");
    const root = `.su-report--${_}`;

    expect(page).toContain("size: Letter");
    expect(page).toContain(`margin: ${margin}`);
    expect(page).toMatch(/@bottom-left\s*\{[^}]*content:\s*"Confidential assessment report · Scaling Up";/);
    expect(page).toMatch(/@bottom-right\s*\{[^}]*content:\s*"Page " counter\(page\) " of " counter\(pages\);/);
    expect(css).toContain("print-color-adjust: exact");
    expect(css).toMatch(new RegExp(`\\.su-report--${_} \\.report-page \\{[^}]*page: ${pageName};`));
    expect(print).toMatch(new RegExp(`\\.su-report--${_} \\.report-page-break \\{[^}]*break-before: page;`));
    expect(styleSelectors(css.replace(page, "")).every((selector) => selector === root || selector.startsWith(`${root} `))).toBe(true);
    expect(css).not.toMatch(/:nth-child\(/);
  });

  it("overrides inherited Classic coach presentation on the light Executive CTA", () => {
    const css = source("styles/su-report-executive.css");

    expect(css).toMatch(/\.su-report--executive \.report-page footer \.su-report-coach-name\s*\{[^}]*color:\s*var\(--executive-ink\)/);
    expect(css).toMatch(/\.su-report--executive \.report-page footer \.su-report-coach-logo\s*\{[^}]*border:/);
  });

  it("does not change the Classic A4 print contract", () => {
    expect(source("styles/su-report.css")).toMatch(/@page\s*\{\s*size:\s*A4;/);
  });
});
