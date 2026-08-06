import { render, screen, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";

import {
  BrandedReport,
  LegacyClassicReport,
} from "@/components/assessments/BrandedReport";
import { ReportStyleScope } from "@/components/assessments/ReportStyleScope";
import { ExecutiveBoardroomReport } from "@/components/assessments/report-styles/ExecutiveBoardroomReport";
import { ModernDashboardReport } from "@/components/assessments/report-styles/ModernDashboardReport";
import type { IndividualReportPresentation } from "@/lib/assessments/individual-report-presentation";
import { buildReportStylePreviewReport } from "@/lib/assessments/report-style-preview-fixture";
import type { RespondentReport } from "@/lib/assessments/respondent-report";
import type { ScoreResult } from "@/lib/assessments/scoring";

const identity = {
  assessmentName: "Authored assessment title",
  campaignLabel: "Authored campaign label",
  campaignSubtitle: "Authored campaign label",
  respondentName: "Safe Test Name",
  respondentEmail: "safe@example.test",
  respondentNameIsEmail: false,
  jobTitle: "Chief Executive Officer",
  companyName: "Example Co",
  submittedAtLabel: "January 15, 2026",
} as const;

const provenance = {
  submissionId: "campaign-safe-id",
  versionId: "version-safe-id",
  contentHash: "hash-safe",
  templateName: "Authored template name",
  imported: false,
} as const;

const scoredPresentation: IndividualReportPresentation = {
  identity,
  provenance,
  blocks: [
    {
      kind: "score-summary",
      headline: "68 / 100",
      headlineLabel: "ScaleUp",
      tierMessage: null,
      showTier: false,
      neutral: false,
      overallAverage: 6.8,
      overallAverageLabel: "6.80",
      overallTotal: 136,
      overallTotalLabel: "136",
      answeredItems: 20,
      sectionCount: 5,
      achievementMarkersVisible: true,
    },
    {
      kind: "metric-group",
      stableKey: "people",
      label: "People",
      role: "domain",
      color: "#f7a600",
      summary: {
        average: 7.5,
        averageLabel: "7.50",
        total: 30,
        totalLabel: "30",
      },
      metrics: [],
    },
    {
      kind: "metric-group",
      stableKey: "operating-rhythm",
      label: "Operating rhythm",
      role: "section",
      description: "Authored section description.",
      summary: {
        average: 7,
        averageLabel: "7.00",
        total: 14,
        totalLabel: "14",
        achievedCount: 1,
        totalCount: 2,
      },
      metrics: [
        {
          stableKey: "weekly-measure",
          label: "A visible weekly measure",
          value: 7,
          valueLabel: "7 / 10",
          maximum: 10,
          achieved: false,
          achievementMarker: { symbol: "✕", label: "not achieved" },
        },
      ],
      scorecardVisible: true,
    },
    {
      kind: "recommendation",
      groups: [
        {
          sectionStableKey: "operating-rhythm",
          label: "Authored action group",
          items: [
            {
              stableKey: "weekly-measure",
              text: "Use the authored recommendation exactly.",
            },
          ],
        },
      ],
    },
    {
      kind: "additional-response",
      responses: [
        {
          stableKey: "reflection",
          label: "What would make the biggest difference?",
          answer: "A shared weekly decision rhythm.",
        },
      ],
    },
    {
      kind: "coach-cta",
      eligible: true,
      contactEmail: "coach@example.test",
      label: "Talk to a Coach →",
      href: "mailto:coach%40example.test",
      learnMoreHref: "https://scalingup.com",
    },
    {
      kind: "closing",
      greeting: "Safe",
      coach: { name: "Morgan Coach", logoUrl: null },
    },
  ],
};

const qualitativePresentation: IndividualReportPresentation = {
  identity: {
    ...identity,
    assessmentName: "Quarterly Reflection",
  },
  provenance: {
    ...provenance,
    templateName: "Quarterly Reflection",
  },
  blocks: [
    {
      kind: "metric-group",
      stableKey: "financials",
      label: "Future financials",
      role: "qualitative",
      description: "Authored metric description.",
      metrics: [
        {
          stableKey: "revenue",
          label: "Revenue in three years",
          type: "NUMBER",
          value: 0,
          valueLabel: "0",
        },
      ],
    },
    {
      kind: "qualitative-scale",
      stableKey: "confidence",
      label: "Leadership confidence",
      description: "Authored scale description.",
      items: [
        {
          stableKey: "confidence-item",
          label: "Confidence",
          type: "SLIDER_LIKERT",
          value: 2,
          valueLabel: "2",
          min: 1,
          max: 3,
        },
      ],
    },
    {
      kind: "theme",
      stableKey: "themes",
      label: "Themes",
      items: [
        {
          stableKey: "priorities",
          label: "Which themes matter?",
          type: "MULTI_CHOICE",
          value: ["cash", "people"],
          valueLabel: "Cash, People",
          chosenLabels: ["Cash", "People"],
        },
      ],
    },
    {
      kind: "narrative-response",
      stableKey: "mixed-focus",
      label: "Focus",
      description: "Authored mixed-section description.",
      responses: [
        {
          stableKey: "rehire-percentage",
          label: "What percentage would you rehire?",
          answer: "75",
          type: "NUMBER",
          value: 75,
          valueLabel: "75",
          min: 0,
          max: 100,
        },
        {
          stableKey: "focus-answer",
          label: "What deserves focus?",
          answer: "The leadership bench.",
          type: "TEXT",
          value: "The leadership bench.",
          valueLabel: "The leadership bench.",
        },
      ],
    },
    {
      kind: "finding",
      eyebrow: "What to work on next",
      label: "Your recommendations",
      groups: [
        {
          sectionName: "Authored finding section",
          items: [
            {
              stableKey: "focus-answer",
              text: "Protect the authored planning rhythm.",
            },
          ],
        },
      ],
    },
  ],
};

const sparsePresentation: IndividualReportPresentation = {
  identity: {
    ...identity,
    assessmentName: "Custom founder prompts",
    campaignLabel: null,
    campaignSubtitle: null,
  },
  provenance: {
    ...provenance,
    templateName: "Custom founder prompts",
  },
  blocks: [
    {
      kind: "narrative-response",
      stableKey: "founder-reflections",
      label: "Founder reflections",
      responses: [
        {
          stableKey: "attention",
          label: "What deserves attention?",
          answer: "Our onboarding handoff.",
          type: "TEXT",
          value: "Our onboarding handoff.",
          valueLabel: "Our onboarding handoff.",
        },
      ],
    },
  ],
};

const renderers = [
  ["Executive Boardroom", ExecutiveBoardroomReport, "executive-boardroom-report"],
  ["Modern Dashboard", ModernDashboardReport, "modern-dashboard-report"],
] as const;

function scalingUpFullReport(reportStyle: string): RespondentReport {
  return {
    respondentName: "Private Person Name",
    respondentEmail: "private-person@example.test",
    jobTitle: "CEO",
    companyName: "Private Company Name",
    assessmentName: "Scaling Up Full",
    templateAlias: "scaling-up-full",
    reportStyle: reportStyle as RespondentReport["reportStyle"],
    campaignLabel: "Planning",
    submittedAt: new Date("2026-01-15T12:00:00.000Z"),
    result: {
      perQuestion: [],
      perSection: [],
      overallTotal: 0,
      overallAverage: 0,
      countAchieved: 0,
      tier: null,
      tierMetricValue: 0,
      unansweredKeys: [],
    } as ScoreResult,
    sections: [],
    questionByKey: {},
    questionsByKey: {},
    rawAnswers: [],
    scoringConfig: {},
    provenance: {
      submissionId: "submission-safe-id",
      versionId: "version-safe-id",
      contentHash: "hash-safe",
      templateName: "Scaling Up Full",
    },
    degraded: false,
  };
}

describe("adaptive alternate report renderers", () => {
  it.each(renderers)(
    "%s renders every scored semantic block exactly once without renderer-authored score bands",
    (_, Renderer) => {
      const { container } = render(<Renderer presentation={scoredPresentation} />);
      const report = within(container);

      for (const kind of [
        "score-summary",
        "metric-group",
        "recommendation",
        "additional-response",
        "coach-cta",
        "closing",
      ]) {
        expect(
          container.querySelectorAll(`[data-report-block="${kind}"]`),
        ).toHaveLength(
          scoredPresentation.blocks.filter((block) => block.kind === kind).length,
        );
      }

      for (const authoredText of [
        "68 / 100",
        "ScaleUp",
        "People",
        "7.50",
        "Operating rhythm",
        "Authored section description.",
        "A visible weekly measure",
        "7 / 10",
        "not achieved",
        "Use the authored recommendation exactly.",
        "What would make the biggest difference?",
        "A shared weekly decision rhythm.",
      ]) {
        expect(report.getAllByText(authoredText)).toHaveLength(1);
      }

      expect(report.queryByText("Five Decisions")).not.toBeInTheDocument();
      expect(report.queryByText("Strength")).not.toBeInTheDocument();
      expect(report.queryByText("On track")).not.toBeInTheDocument();
      expect(report.queryByText("Watch area")).not.toBeInTheDocument();
      expect(report.queryByText("Priority")).not.toBeInTheDocument();
      expect(report.queryByText("Decision score matrix")).not.toBeInTheDocument();
      expect(report.queryByText("Section scorecard")).not.toBeInTheDocument();

      const recommendation = report
        .getByText("Use the authored recommendation exactly.")
        .closest('[data-report-block="recommendation"]');
      expect(recommendation).toHaveAttribute(
        "aria-labelledby",
        "report-style-actions-title",
      );
      expect(
        within(recommendation as HTMLElement).getByRole("heading", {
          name: "Recommendations",
        }),
      ).toHaveAttribute("id", "report-style-actions-title");
      expect(
        within(recommendation as HTMLElement).getByRole("heading", {
          name: "Authored action group",
        }).tagName,
      ).toBe("H3");

      const cta = report.getByRole("link", { name: "Talk to a Coach →" });
      expect(cta.closest("footer")).toHaveAttribute(
        "data-report-block",
        "coach-cta",
      );
    },
  );

  it.each(renderers)(
    "%s preserves qualitative metric, scale, theme, mixed narrative, and finding blocks without scored semantics",
    (_, Renderer) => {
      const { container } = render(
        <Renderer presentation={qualitativePresentation} />,
      );
      const report = within(container);

      for (const kind of [
        "metric-group",
        "qualitative-scale",
        "theme",
        "narrative-response",
        "finding",
      ]) {
        expect(
          container.querySelectorAll(`[data-report-block="${kind}"]`),
        ).toHaveLength(1);
      }

      for (const authoredText of [
        "Future financials",
        "Authored metric description.",
        "Revenue in three years",
        "0",
        "Leadership confidence",
        "Authored scale description.",
        "Confidence",
        "2",
        "Themes",
        "Which themes matter?",
        "Cash, People",
        "Focus",
        "Authored mixed-section description.",
        "What percentage would you rehire?",
        "75",
        "What deserves focus?",
        "The leadership bench.",
        "What to work on next",
        "Your recommendations",
        "Authored finding section",
        "Protect the authored planning rhythm.",
      ]) {
        expect(report.getAllByText(authoredText)).toHaveLength(1);
      }

      expect(report.queryByText("Five Decisions")).not.toBeInTheDocument();
      expect(report.queryByText(/total points/i)).not.toBeInTheDocument();
      expect(report.queryByText(/scorecard/i)).not.toBeInTheDocument();
      expect(report.queryByText(/overall result/i)).not.toBeInTheDocument();
      expect(report.queryByText(/not rated/i)).not.toBeInTheDocument();
    },
  );

  it.each(renderers)(
    "%s renders a sparse custom presentation without empty cards or placeholder headings",
    (_, Renderer) => {
      const { container } = render(<Renderer presentation={sparsePresentation} />);
      const report = within(container);

      expect(container.querySelectorAll("[data-report-block]")).toHaveLength(1);
      expect(
        container.querySelectorAll('[data-report-block="narrative-response"]'),
      ).toHaveLength(1);
      expect(report.getByText("Founder reflections")).toBeInTheDocument();
      expect(report.getByText("What deserves attention?")).toBeInTheDocument();
      expect(report.getByText("Our onboarding handoff.")).toBeInTheDocument();
      for (const inventedHeading of [
        "Overall result",
        "Decision score matrix",
        "Section scorecard",
        "Five Decisions",
        "Recommendations",
      ]) {
        expect(report.queryByText(inventedHeading)).not.toBeInTheDocument();
      }
      expect(container.querySelectorAll(".report-page")).toHaveLength(2);
      expect(container.querySelectorAll(".report-page:empty")).toHaveLength(0);
    },
  );
});

describe("BrandedReport explicit appearance dispatch", () => {
  it.each([
    ["EXECUTIVE_BOARDROOM", "executive-boardroom-report"],
    ["MODERN_DASHBOARD", "modern-dashboard-report"],
  ] as const)(
    "selects %s only with a server-authoritative availability decision",
    (reportStyle, renderer) => {
      const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
      const { rerender } = render(
        <BrandedReport
          report={scalingUpFullReport(reportStyle)}
          reportStylesAvailable
        />,
      );
      expect(screen.getByTestId(renderer)).toBeInTheDocument();

      rerender(<BrandedReport report={scalingUpFullReport(reportStyle)} />);
      expect(screen.queryByTestId(renderer)).toBeNull();
      expect(screen.getByTestId("report-cover")).toBeInTheDocument();
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalledWith(
        "assessment.report_style.fallback",
        {
          submissionId: "submission-safe-id",
          versionId: "version-safe-id",
          templateAlias: "scaling-up-full",
          archetype: "scored",
          requestedStyle: reportStyle,
          resolvedStyle: "CLASSIC",
          fallbackReason: "UNAVAILABLE",
        },
      );
      expect(JSON.stringify(warn.mock.calls)).not.toContain("Private Person Name");
      expect(JSON.stringify(warn.mock.calls)).not.toContain(
        "private-person@example.test",
      );
      warn.mockRestore();
    },
  );

  it("falls back malformed styles to byte-identical Classic and emits only privacy-safe diagnostics", () => {
    const report = scalingUpFullReport("NOT_A_STYLE");
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const { container, unmount } = render(
      <BrandedReport report={report} reportStylesAvailable />,
    );
    const fallbackHtml = container.innerHTML;
    unmount();

    const classic = render(<LegacyClassicReport report={report} />);
    expect(fallbackHtml).toBe(classic.container.innerHTML);
    expect(warn).toHaveBeenCalledWith(
      "assessment.report_style.fallback",
      {
        submissionId: "submission-safe-id",
        versionId: "version-safe-id",
        templateAlias: "scaling-up-full",
        archetype: "scored",
        requestedStyle: "INVALID",
        resolvedStyle: "CLASSIC",
        fallbackReason: "INVALID",
      },
    );
    expect(warn).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(warn.mock.calls)).not.toContain("Private Person Name");
    expect(JSON.stringify(warn.mock.calls)).not.toContain(
      "private-person@example.test",
    );
    expect(JSON.stringify(warn.mock.calls)).not.toContain("Private Company Name");
    warn.mockRestore();
  });

  it("keeps scored Classic byte-identical for available and unavailable style rollout", () => {
    const report = scalingUpFullReport("CLASSIC");
    const direct = render(<LegacyClassicReport report={report} />).container.innerHTML;
    const unavailable = render(<BrandedReport report={report} />).container.innerHTML;
    const available = render(
      <BrandedReport report={report} reportStylesAvailable />,
    ).container.innerHTML;

    expect(unavailable).toBe(direct);
    expect(available).toBe(direct);
  });
});

describe("enabled Classic surface fidelity", () => {
  it(
    "matches the real enabled surface to the preview harness at 393px",
    async () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { chromium } = require("playwright") as typeof import("playwright");
      const report = {
        ...buildReportStylePreviewReport("scored", "long-branding"),
        reportStyle: "CLASSIC" as const,
      };
      const realMarkup = renderToStaticMarkup(
        <ReportStyleScope report={report} reportStylesAvailable>
          <div className="su-report-page" data-testid="report-surface">
            <BrandedReport report={report} reportStylesAvailable />
          </div>
        </ReportStyleScope>,
      );
      const previewMarkup = renderToStaticMarkup(
        <ReportStyleScope report={report} reportStylesAvailable>
          <article
            className="su-report-page"
            data-preview-style="CLASSIC"
            data-testid="report-surface"
          >
            <BrandedReport report={report} reportStylesAvailable />
          </article>
        </ReportStyleScope>,
      );
      const css = [
        readFileSync(
          join(process.cwd(), "src", "styles", "su-public-brand.css"),
          "utf8",
        ),
        readFileSync(
          join(process.cwd(), "src", "styles", "su-report.css"),
          "utf8",
        ),
      ].join("\n");
      const originalSetImmediate = global.setImmediate;
      if (typeof global.setImmediate !== "function") {
        global.setImmediate = ((
          callback: (...args: unknown[]) => void,
          ...args: unknown[]
        ) => setTimeout(callback, 0, ...args)) as unknown as typeof setImmediate;
      }
      const browser = await chromium.launch({ headless: true });

      const inspect = async (markup: string) => {
        const page = await browser.newPage({
          viewport: { width: 393, height: 852 },
        });
        try {
          await page.setContent(`<style>${css}</style>${markup}`);
          return await page.getByTestId("report-surface").evaluate((surface) => {
            const parseRgb = (value: string) =>
              (value.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
            const luminance = (value: string) => {
              const [red, green, blue] = parseRgb(value).map((channel) => {
                const normalized = channel / 255;
                return normalized <= 0.04045
                  ? normalized / 12.92
                  : ((normalized + 0.055) / 1.055) ** 2.4;
              });
              return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
            };
            const contrast = (foreground: string, background: string) => {
              const light = Math.max(
                luminance(foreground),
                luminance(background),
              );
              const dark = Math.min(
                luminance(foreground),
                luminance(background),
              );
              return (light + 0.05) / (dark + 0.05);
            };
            const coach = surface.querySelector(".su-report-coach");
            const coachName = surface.querySelector(".su-report-coach-name");
            const eyebrow = surface.querySelector(".su-report-eyebrow");
            const orangeHeader = surface.querySelector(
              '.su-report-card-head[style*="background-color:#f7a600"]',
            );
            const orangeTitle =
              orangeHeader?.querySelector(".su-report-card-title");
            if (
              !(coach instanceof HTMLElement) ||
              !(coachName instanceof HTMLElement) ||
              !(eyebrow instanceof HTMLElement) ||
              !(orangeHeader instanceof HTMLElement) ||
              !(orangeTitle instanceof HTMLElement)
            ) {
              throw new Error("Enabled Classic fidelity fixture is incomplete");
            }
            const orangeTitleStyle = getComputedStyle(orangeTitle);
            const orangeHeaderStyle = getComputedStyle(orangeHeader);

            return {
              marker: surface.getAttribute("data-enabled-report-style"),
              documentScrollWidth: document.documentElement.scrollWidth,
              viewportWidth: window.innerWidth,
              coachFlexWrap: getComputedStyle(coach).flexWrap,
              coachNameWhiteSpace: getComputedStyle(coachName).whiteSpace,
              eyebrowColor: getComputedStyle(eyebrow).color,
              orangeTitleColor: orangeTitleStyle.color,
              orangeTitleContrast: contrast(
                orangeTitleStyle.color,
                orangeHeaderStyle.backgroundColor,
              ),
            };
          });
        } finally {
          await page.close();
        }
      };

      try {
        const real = await inspect(realMarkup);
        const preview = await inspect(previewMarkup);

        expect(real).toEqual(preview);
        expect(real).toEqual(
          expect.objectContaining({
            marker: "CLASSIC",
            documentScrollWidth: 393,
            viewportWidth: 393,
            coachFlexWrap: "wrap",
            coachNameWhiteSpace: "normal",
            eyebrowColor: "rgb(0, 107, 159)",
            orangeTitleColor: "rgb(26, 19, 34)",
          }),
        );
        expect(real.orangeTitleContrast).toBeGreaterThanOrEqual(4.5);
      } finally {
        await browser.close();
        global.setImmediate = originalSetImmediate;
      }
    },
    30_000,
  );

  it(
    "keeps the flag-off outer surface and Classic computed styles legacy-exact",
    async () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { chromium } = require("playwright") as typeof import("playwright");
      const report = {
        ...buildReportStylePreviewReport("scored", "long-branding"),
        reportStyle: "CLASSIC" as const,
      };
      const flagOffMarkup = renderToStaticMarkup(
        <ReportStyleScope report={report}>
          <div className="su-report-page" data-testid="report-surface">
            <BrandedReport report={report} />
          </div>
        </ReportStyleScope>,
      );
      const legacyMarkup = renderToStaticMarkup(
        <div className="su-report-page" data-testid="report-surface">
          <LegacyClassicReport report={report} />
        </div>,
      );
      expect(flagOffMarkup).toBe(legacyMarkup);

      const css = [
        readFileSync(
          join(process.cwd(), "src", "styles", "su-public-brand.css"),
          "utf8",
        ),
        readFileSync(
          join(process.cwd(), "src", "styles", "su-report.css"),
          "utf8",
        ),
      ].join("\n");
      const originalSetImmediate = global.setImmediate;
      if (typeof global.setImmediate !== "function") {
        global.setImmediate = ((
          callback: (...args: unknown[]) => void,
          ...args: unknown[]
        ) => setTimeout(callback, 0, ...args)) as unknown as typeof setImmediate;
      }
      const browser = await chromium.launch({ headless: true });

      try {
        const page = await browser.newPage({
          viewport: { width: 393, height: 852 },
        });
        await page.setContent(`<style>${css}</style>${flagOffMarkup}`);
        const computed = await page
          .getByTestId("report-surface")
          .evaluate((surface) => {
            const coach = surface.querySelector(".su-report-coach");
            const coachName = surface.querySelector(".su-report-coach-name");
            const eyebrow = surface.querySelector(".su-report-eyebrow");
            const orangeTitle = surface.querySelector(
              '.su-report-card-head[style*="background-color:#f7a600"] .su-report-card-title',
            );
            if (
              !(coach instanceof HTMLElement) ||
              !(coachName instanceof HTMLElement) ||
              !(eyebrow instanceof HTMLElement) ||
              !(orangeTitle instanceof HTMLElement)
            ) {
              throw new Error("Flag-off Classic fidelity fixture is incomplete");
            }
            return {
              marker: surface.getAttribute("data-enabled-report-style"),
              documentScrollWidth: document.documentElement.scrollWidth,
              coachFlexWrap: getComputedStyle(coach).flexWrap,
              coachNameWhiteSpace: getComputedStyle(coachName).whiteSpace,
              eyebrowColor: getComputedStyle(eyebrow).color,
              orangeTitleColor: getComputedStyle(orangeTitle).color,
            };
          });

        expect(computed).toEqual(
          expect.objectContaining({
            marker: null,
            coachFlexWrap: "nowrap",
            coachNameWhiteSpace: "nowrap",
            eyebrowColor: "rgb(0, 139, 210)",
            orangeTitleColor: "rgb(255, 255, 255)",
          }),
        );
        expect(computed.documentScrollWidth).toBeGreaterThan(393);
      } finally {
        await browser.close();
        global.setImmediate = originalSetImmediate;
      }
    },
    30_000,
  );
});
