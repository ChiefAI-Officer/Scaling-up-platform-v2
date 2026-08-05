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

function cssColorBinding(css: string, selector: string, property: "background" | "color" | "border-color") {
  const rule = blockFor(css, selector);
  const declaration = rule.match(new RegExp(`(?:^|[;{])\\s*${property}\\s*:\\s*(#[0-9a-f]{6}|var\\((--[a-z0-9-]+)\\));`, "i"));
  if (!declaration) throw new Error(`Missing ${property} declaration for ${selector}`);

  return {
    color: declaration[2] ? cssVariable(css, declaration[2]) : declaration[1],
    variable: declaration[2] ?? null,
  };
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
  it("parses color declarations without matching property-name suffixes", () => {
    const css = `
      .tokens {
        --expected: #112233;
        --bad: #445566;
      }
      .mixed {
        border-color: var(--expected);
        color: var(--bad);
      }
      .at-start { color : #AABBCC; }
    `;

    expect(cssColorBinding(css, ".mixed", "color")).toEqual({
      color: "#445566",
      variable: "--bad",
    });
    expect(cssColorBinding(css, ".mixed", "border-color")).toEqual({
      color: "#112233",
      variable: "--expected",
    });
    expect(cssColorBinding(css, ".at-start", "color")).toEqual({
      color: "#AABBCC",
      variable: null,
    });
  });

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
      const accentVariable = `--${style}-status-${status}-accent`;
      const statusRule = blockFor(css, `.su-report--${style} .report-status--${status}`);

      expect(cssVariable(css, accentVariable)).toBe(expectedAccent);
      expect(statusRule).toContain(`border-color: var(${accentVariable})`);
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
  });

  it.each([
    ["achieved", "--dashboard-status-strength-ink"],
    ["not-achieved", "--dashboard-status-priority-ink"],
  ])("binds Dashboard %s table text to a WCAG AA ink on the rendered cell surface", (status, expectedInkVariable) => {
    const css = source("styles/su-report-dashboard.css");
    const foreground = cssColorBinding(
      css,
      `.su-report--dashboard .report-question[data-achievement-status="${status}"] td:last-child`,
      "color",
    );
    const surface = cssColorBinding(css, ".su-report--dashboard .report-page th,", "background");

    expect(foreground.variable).toBe(expectedInkVariable);
    expect(surface.variable).toBe("--dashboard-soft");
    expect(contrastRatio(foreground.color, surface.color)).toBeGreaterThanOrEqual(4.5);
  });

  it("binds Dashboard small insight and action text to WCAG AA colors on their rendered card surfaces", () => {
    const css = source("styles/su-report-dashboard.css");
    const bindings = [
      {
        foregroundSelector: ".su-report--dashboard .report-insight-role--top-strength",
        foregroundVariable: "--dashboard-slate",
        surfaceSelector: '.su-report--dashboard .report-signal[data-insight-role="top-strength"]',
      },
      {
        foregroundSelector: ".su-report--dashboard .report-insight-role--priority-action",
        foregroundVariable: "--dashboard-indigo",
        surfaceSelector: '.su-report--dashboard .report-signal[data-insight-role="priority-action"]',
      },
      {
        foregroundSelector: ".su-report--dashboard .report-action-group h3",
        foregroundVariable: "--dashboard-indigo",
        surfaceSelector: ".su-report--dashboard .report-action-group",
      },
    ];

    for (const binding of bindings) {
      const foreground = cssColorBinding(css, binding.foregroundSelector, "color");
      const surface = cssColorBinding(css, binding.surfaceSelector, "background");

      expect(foreground.variable).toBe(binding.foregroundVariable);
      expect(surface.variable).toBe("--dashboard-soft");
      expect(contrastRatio(foreground.color, surface.color)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("binds Dashboard muted text and print margin boxes to an AA ink", () => {
    const css = source("styles/su-report-dashboard.css");
    const accessibleMuted = cssVariable(css, "--dashboard-muted-ink");
    const softSurface = cssVariable(css, "--dashboard-soft");
    const page = blockFor(css, "@page dashboard-report");

    expect(cssVariable(css, "--dashboard-muted")).toBe("#8A90A3");
    expect(accessibleMuted).toBe("#646B7D");

    for (const selector of [
      ".su-report--dashboard .report-page dt",
      ".su-report--dashboard .report-provenance",
    ]) {
      const foreground = cssColorBinding(css, selector, "color");

      expect(foreground.variable).toBe("--dashboard-muted-ink");
      expect(contrastRatio(foreground.color, selector.endsWith("dt") ? softSurface : "#ffffff")).toBeGreaterThanOrEqual(4.5);
    }

    expect(page.match(/@bottom-(?:left|right)\s*\{[^}]*color:\s*#646B7D;/g)).toHaveLength(2);
    expect(contrastRatio("#646B7D", "#ffffff")).toBeGreaterThanOrEqual(4.5);
  });

  it("binds Executive small insight and action text to WCAG AA colors on their white report surfaces", () => {
    const css = source("styles/su-report-executive.css");
    const bindings = [
      {
        foregroundSelector: ".su-report--executive .report-insight-role--top-strength",
        foregroundVariable: "--executive-ink",
        surfaceSelector: ".su-report--executive .report-page--executive-summary",
      },
      {
        foregroundSelector: ".su-report--executive .report-insight-role--priority-action",
        foregroundVariable: "--executive-purple-700",
        surfaceSelector: ".su-report--executive .report-page--executive-summary",
      },
      {
        foregroundSelector: ".su-report--executive .report-page h3",
        foregroundVariable: "--executive-purple-700",
        surfaceSelector: ".su-report--executive .report-page--executive-detail",
      },
    ];

    for (const binding of bindings) {
      const foreground = cssColorBinding(css, binding.foregroundSelector, "color");
      const surface = cssColorBinding(css, binding.surfaceSelector, "background");

      expect(foreground.variable).toBe(binding.foregroundVariable);
      expect(surface.variable).toBeNull();
      expect(surface.color.toLowerCase()).toBe("#ffffff");
      expect(contrastRatio(foreground.color, surface.color)).toBeGreaterThanOrEqual(4.5);
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
