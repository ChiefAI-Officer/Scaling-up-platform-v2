import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, within } from "@testing-library/react";

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

function styleSelectors(css: string): string[] {
  const selectors: string[] = [];
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
  for (const match of withoutComments.matchAll(/([^{}]+)\{/g)) {
    const prelude = match[1].trim();
    if (prelude.startsWith("@")) continue;
    selectors.push(
      ...prelude.split(",").map((selector) => selector.trim()),
    );
  }
  return selectors;
}

function cssVariable(css: string, name: string): string {
  const match = css.match(new RegExp(`${name}:\\s*(#[0-9a-f]{6});`, "i"));
  if (!match) throw new Error(`Missing CSS variable ${name}`);
  return match[1];
}

function cssColorBinding(
  css: string,
  selector: string,
  property: "background" | "color" | "border-color",
) {
  const rule = blockFor(css, selector);
  const declaration = rule.match(
    new RegExp(
      `(?:^|[;{])\\s*${property}\\s*:\\s*(#[0-9a-f]{6}|var\\((--[a-z0-9-]+)\\));`,
      "i",
    ),
  );
  if (!declaration) {
    throw new Error(`Missing ${property} declaration for ${selector}`);
  }

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
    .map((channel) =>
      channel <= 0.04045
        ? channel / 12.92
        : ((channel + 0.055) / 1.055) ** 2.4,
    );

  if (!channels || channels.length !== 3) {
    throw new Error(`Invalid hex color ${hex}`);
  }
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrastRatio(foreground: string, background: string): number {
  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);
  return (
    (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) /
    (Math.min(foregroundLuminance, backgroundLuminance) + 0.05)
  );
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

const completePresentation: IndividualReportPresentation = {
  ...sparsePresentation,
  blocks: [
    {
      kind: "score-summary",
      headline: "68 / 100",
      headlineLabel: "ScaleUp",
      tierMessage: null,
      showTier: false,
      neutral: false,
      overallAverage: 6.8,
      overallAverageLabel: "6.8",
      overallTotal: 136,
      overallTotalLabel: "136",
      answeredItems: 2,
      sectionCount: 1,
      achievementMarkersVisible: true,
    },
    {
      kind: "metric-group",
      stableKey: "people",
      label: "People",
      role: "domain",
      color: "#C6A15B",
      summary: {
        average: 7.5,
        averageLabel: "7.5",
        total: 15,
        totalLabel: "15",
      },
      metrics: [],
    },
    {
      kind: "metric-group",
      stableKey: "people-section",
      label: "People evidence",
      role: "section",
      summary: {
        average: 7.5,
        averageLabel: "7.5",
        total: 15,
        totalLabel: "15",
        achievedCount: 1,
        totalCount: 2,
      },
      metrics: [
        {
          stableKey: "achieved-check",
          label: "Achieved check",
          value: 8,
          valueLabel: "8 / 10",
          achieved: true,
          achievementMarker: { symbol: "✓", label: "achieved" },
        },
        {
          stableKey: "missed-check",
          label: "Missed check",
          value: 7,
          valueLabel: "7 / 10",
          achieved: false,
          achievementMarker: { symbol: "✕", label: "not achieved" },
        },
      ],
    },
    {
      kind: "recommendation",
      groups: [
        {
          sectionStableKey: "people-section",
          label: "People evidence",
          items: [
            { stableKey: "action", text: "Use the authored action." },
          ],
        },
      ],
    },
    {
      kind: "coach-cta",
      eligible: true,
      contactEmail: null,
      label: "Talk to a Coach →",
      href: "https://scalingup.com/coaches",
      learnMoreHref: "https://scalingup.com",
    },
    {
      kind: "closing",
      greeting: "Alex",
      coach: { name: "Morgan Coach", logoUrl: null },
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
  it("parses exact color properties without matching declaration suffixes", () => {
    const css = `
      .tokens { --expected: #112233; --bad: #445566; }
      .mixed { border-color: var(--expected); color: var(--bad); }
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

  it.each(renderers)(
    "$label renders written achievement status and provenance on every emitted page",
    ({ Renderer, rootClass, coverClass }) => {
      const { container } = render(
        <Renderer presentation={completePresentation} />,
      );
      const report = within(container);
      const pages = container.querySelectorAll(`.${rootClass} .report-page`);

      expect(container.querySelector(`.${rootClass} .${coverClass}`))
        .toBeInTheDocument();
      expect(pages).toHaveLength(3);
      expect(container.querySelectorAll(`.${rootClass} .report-page-break`))
        .toHaveLength(2);
      expect(report.getAllByTestId("report-style-provenance"))
        .toHaveLength(pages.length);
      expect(report.getByText("achieved")).toBeInTheDocument();
      expect(report.getByText("not achieved")).toBeInTheDocument();
    },
  );

  it("uses bundled report fonts in the route shell and renderer roots", () => {
    const fonts = source("lib/assessments/assessment-fonts.ts");
    const layout = source("app/(report)/layout.tsx");
    const executive = source(
      "components/assessments/report-styles/ExecutiveBoardroomReport.tsx",
    );
    const dashboard = source(
      "components/assessments/report-styles/ModernDashboardReport.tsx",
    );

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

  it.each(renderers)(
    "$label keeps every appearance stylesheet selector rooted",
    ({ style, pageName, cssPath }) => {
      const css = source(cssPath);
      const page = blockFor(css, `@page ${pageName}`);
      const root = `.su-report--${style}`;

      expect(css).toContain("print-color-adjust: exact");
      expect(
        styleSelectors(css.replace(page, "")).every(
          (selector) =>
            selector === root || selector.startsWith(`${root} `),
        ),
      ).toBe(true);
      expect(css).not.toMatch(/:nth-child\(/);
    },
  );

  it("binds Executive domain identity to the authoritative five-color palette", () => {
    const css = source("styles/su-report-executive.css");
    const { container } = render(
      <ExecutiveBoardroomReport presentation={completePresentation} />,
    );
    const expected = [
      ["people", "#C6A15B"],
      ["strategy", "#5B8AA6"],
      ["execution", "#A2653E"],
      ["cash", "#4E8B5E"],
      ["you", "#8C5BA6"],
    ];

    expect(container.querySelector('[data-report-role="domain"]'))
      .toHaveAttribute("data-decision", "people");
    expect(
      blockFor(css, '.su-report--executive [data-report-role="domain"]'),
    ).toContain("border-left: 4px solid var(--executive-purple-500)");
    for (const [decision, color] of expected) {
      expect(cssVariable(css, `--executive-decision-${decision}`)).toBe(color);
      expect(
        blockFor(
          css,
          `.su-report--executive [data-report-role="domain"][data-decision="${decision}"]`,
        ),
      ).toContain(
        `border-left-color: var(--executive-decision-${decision})`,
      );
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
  ])(
    "$style status palettes preserve their accent and WCAG AA text contracts",
    ({ style, path, accents, statuses }) => {
      const css = source(path);

      for (const [status, expectedAccent] of Object.entries(accents)) {
        const accentVariable = `--${style}-status-${status}-accent`;
        const statusRule = blockFor(
          css,
          `.su-report--${style} .report-status--${status}`,
        );

        expect(cssVariable(css, accentVariable)).toBe(expectedAccent);
        expect(statusRule).toContain(`border-color: var(${accentVariable})`);
      }

      for (const status of statuses) {
        const inkVariable = `--${style}-status-${status}-ink`;
        const surfaceVariable = `--${style}-status-${status}-surface`;
        const ink = cssVariable(css, inkVariable);
        const surface = cssVariable(css, surfaceVariable);
        const statusRule = blockFor(
          css,
          `.su-report--${style} .report-status--${status}`,
        );

        expect(contrastRatio(ink, surface)).toBeGreaterThanOrEqual(4.5);
        expect(statusRule).toContain(`background: var(${surfaceVariable})`);
        expect(statusRule).toContain(`color: var(${inkVariable})`);
      }
    },
  );

  it.each([
    ["achieved", "--dashboard-status-strength-ink"],
    ["not-achieved", "--dashboard-status-priority-ink"],
  ])(
    "binds rendered Dashboard %s markers to WCAG AA status ink",
    (status, expectedInkVariable) => {
      const css = source("styles/su-report-dashboard.css");
      const selector =
        `.su-report--dashboard .report-question` +
        `[data-achievement-status="${status}"] .report-achievement`;
      const foreground = cssColorBinding(css, selector, "color");
      const surface = cssColorBinding(
        css,
        ".su-report--dashboard .report-page dl > div",
        "background",
      );

      expect(foreground.variable).toBe(expectedInkVariable);
      expect(surface.variable).toBe("--dashboard-soft");
      expect(contrastRatio(foreground.color, surface.color))
        .toBeGreaterThanOrEqual(4.5);
    },
  );

  it.each([
    {
      style: "executive",
      path: "styles/su-report-executive.css",
      foregroundSelector: ".su-report--executive .report-page h3",
      foregroundVariable: "--executive-purple-700",
      surfaceSelector: ".su-report--executive .report-page--executive-detail",
      expectedSurface: "#ffffff",
    },
    {
      style: "dashboard",
      path: "styles/su-report-dashboard.css",
      foregroundSelector:
        ".su-report--dashboard .report-action-group h3",
      foregroundVariable: "--dashboard-indigo",
      surfaceSelector: ".su-report--dashboard .report-action-group",
      expectedSurfaceVariable: "--dashboard-soft",
    },
  ])(
    "$style recommendation headings retain WCAG AA contrast on their card surface",
    ({
      path,
      foregroundSelector,
      foregroundVariable,
      surfaceSelector,
      expectedSurface,
      expectedSurfaceVariable,
    }) => {
      const css = source(path);
      const foreground = cssColorBinding(
        css,
        foregroundSelector,
        "color",
      );
      const surface = cssColorBinding(css, surfaceSelector, "background");

      expect(foreground.variable).toBe(foregroundVariable);
      if (expectedSurfaceVariable) {
        expect(surface.variable).toBe(expectedSurfaceVariable);
      } else {
        expect(surface.variable).toBeNull();
        expect(surface.color.toLowerCase()).toBe(expectedSurface);
      }
      expect(contrastRatio(foreground.color, surface.color))
        .toBeGreaterThanOrEqual(4.5);
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
