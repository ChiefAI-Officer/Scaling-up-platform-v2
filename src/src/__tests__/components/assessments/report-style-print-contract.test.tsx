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

function cssVariable(css: string, name: string): string {
  const match = css.match(new RegExp(`${name}:\\s*(#[0-9a-f]{6});`, "i"));
  if (!match) throw new Error(`Missing CSS variable ${name}`);
  return match[1];
}

function relativeLuminance(hex: string): number {
  const channels = hex
    .slice(1)
    .match(/.{2}/g)
    ?.map((channel) => Number.parseInt(channel, 16) / 255)
    .map((channel) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4));

  if (!channels || channels.length !== 3) throw new Error(`Invalid hex color ${hex}`);
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrastRatio(foreground: string, background: string): number {
  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);
  return (Math.max(foregroundLuminance, backgroundLuminance) + 0.05)
    / (Math.min(foregroundLuminance, backgroundLuminance) + 0.05);
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

  it("binds Executive decision identity to the authoritative five-color palette", () => {
    const css = source("styles/su-report-executive.css");
    const expected = [
      ["people", "#C6A15B"],
      ["strategy", "#5B8AA6"],
      ["execution", "#A2653E"],
      ["cash", "#4E8B5E"],
      ["you", "#8C5BA6"],
    ];

    for (const [decision, color] of expected) {
      expect(css).toContain(`--executive-decision-${decision}: ${color};`);
      expect(css).toMatch(new RegExp(`\\.report-decision\\[data-decision="${decision}"\\] \\{[^}]*border-left-color: var\\(--executive-decision-${decision}\\);`));
    }
  });

  it.each([
    {
      style: "executive",
      path: "styles/su-report-executive.css",
      accents: {
        strength: "#3E7A4A",
        "on-track": "#5B3A8E",
        "watch-area": "#B8791E",
        priority: "#A23B3B",
      },
      statuses: ["strength", "on-track", "watch-area", "priority", "unrated"],
    },
    {
      style: "dashboard",
      path: "styles/su-report-dashboard.css",
      accents: {
        strength: "#0E9F6E",
        "on-track": "#5B3FD9",
        "watch-area": "#DB9200",
        priority: "#E4483F",
      },
      statuses: ["strength", "on-track", "watch-area", "priority", "unrated"],
    },
  ])("keeps $style status accents authoritative while status text meets WCAG AA", ({ style, path, accents, statuses }) => {
    const css = source(path);

    for (const [status, expectedAccent] of Object.entries(accents)) {
      expect(cssVariable(css, `--${style}-status-${status}-accent`)).toBe(expectedAccent);
    }

    for (const status of statuses) {
      const inkVariable = `--${style}-status-${status}-ink`;
      const surfaceVariable = `--${style}-status-${status}-surface`;
      const ink = cssVariable(css, inkVariable);
      const surface = cssVariable(css, surfaceVariable);
      const statusRule = blockFor(css, `.su-report--${style} .report-status--${status}`);

      expect(contrastRatio(ink, surface)).toBeGreaterThanOrEqual(4.5);
      expect(statusRule).toContain(`background: var(${surfaceVariable})`);
      expect(statusRule).toContain(`color: var(${inkVariable})`);
    }

    if (style === "dashboard") {
      expect(blockFor(css, '.su-report--dashboard .report-question[data-achievement-status="achieved"] td:last-child'))
        .toContain("color: var(--dashboard-status-strength-ink)");
      expect(blockFor(css, '.su-report--dashboard .report-question[data-achievement-status="not-achieved"] td:last-child'))
        .toContain("color: var(--dashboard-status-priority-ink)");
    }
  });

  it.each([
    ["executive", "styles/su-report-executive.css", "var\\(--executive-gold\\)"],
    ["dashboard", "styles/su-report-dashboard.css", "var\\(--dashboard-indigo\\)"],
  ])("styles %s insight roles independently from score-band chips", (_, path, actionAccent) => {
    const css = source(path);

    expect(css).toMatch(/\.report-signal\[data-insight-role="top-strength"\]/);
    expect(css).toMatch(/\.report-signal\[data-insight-role="priority-action"\]/);
    expect(css).toMatch(new RegExp(`\\.report-action-group \\{[^}]*border-left: 4px solid ${actionAccent};`));
  });

  it("does not change the Classic A4 print contract", () => {
    expect(source("styles/su-report.css")).toMatch(/@page\s*\{\s*size:\s*A4;/);
  });
});
