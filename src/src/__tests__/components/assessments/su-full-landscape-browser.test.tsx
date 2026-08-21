/** @jest-environment node */

import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { chromium, type Browser, type Page } from "playwright";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { BrandedReport } from "@/components/assessments/BrandedReport";
import { ReportStyleScope } from "@/components/assessments/ReportStyleScope";
import {
  completeSuFullLandscapePresentation,
  completeSuFullLandscapeReport,
} from "@/__tests__/fixtures/su-full-landscape";
import {
  SU_FULL_PHASE_PEER_CONTENT_HASHES,
  SU_FULL_PHASE_PEER_SOURCE_ID,
  getGovernedPeerValue,
} from "@/lib/assessments/su-full-phase-peer-catalogue";
import type { GrowthPhaseNumber } from "@/lib/assessments/su-full-phase";
import { SU_FULL_LEGACY_PEER_SOURCE_ID } from "@/lib/assessments/su-full-question-benchmarks";

jest.setTimeout(60_000);

const ENABLED = "NEXT_PUBLIC_WAVE_SU_FULL_LANDSCAPE_REPORT_ENABLED";
const KILL = "NEXT_PUBLIC_WAVE_SU_FULL_LANDSCAPE_REPORT_KILL";
const OPENER_PAGES = [7, 11, 14, 19, 21] as const;
const CHART_PAGES = [...OPENER_PAGES, 26] as const;
const PEER_DISCLOSURE = "Peers are a governed benchmark snapshot selected by organizational phase and frozen when this result was scored. This is not an industry-, geography-, or cohort-matched comparison.";
const LEGACY_PEER_DISCLOSURE = "Peers use the governed historical baseline for reports scored before phase-aware peer snapshots were frozen. This is not an industry-, geography-, or cohort-matched comparison.";
const REPRESENTATIVE_482_CHARACTER_FEEDBACK = "In order to scale, smart application and linking of information technology is essential. Sales, marketing, project management, production,humanresources,reporting,etc.Thisgivesstructureand clarity, prevents mistakes and makes growing a lot easier. With the size of your company, a lot of systems likely still work independently of each other, or you primarily use Excel. This is customary, but in your next growth phase you will have to start thinking about smart solutions. Act now";

function stylesheet(): string {
  return ["su-public-brand.css", "su-report.css"]
    .map((name) => readFileSync(join(process.cwd(), "src", "styles", name), "utf8"))
    .join("\n")
    .replace(/@import[^;]+;\s*/g, "");
}

function routeMarkup(
  report = completeSuFullLandscapeReport(),
  presentation: ReturnType<typeof completeSuFullLandscapePresentation> | null = completeSuFullLandscapePresentation(report),
): { html: string; report: ReturnType<typeof completeSuFullLandscapeReport> } {
  report.suFullPeerPresentation = presentation;
  const html = renderToStaticMarkup(
    <main className="su-public-brand su-report" data-testid="route-wrapper">
      <ReportStyleScope report={report} reportStylesAvailable>
        <div className="su-report-page">
          <BrandedReport report={report} reportStylesAvailable contactEmail="coach@example.com" />
        </div>
      </ReportStyleScope>
    </main>,
  );
  return { html, report };
}

function reportForPhase(phase: GrowthPhaseNumber) {
  const report = completeSuFullLandscapeReport();
  return {
    ...report,
    result: {
      ...report.result,
      recommendationPhase: phase,
      peerBenchmarkSnapshot: {
        sourceId: SU_FULL_PHASE_PEER_SOURCE_ID,
        contentHash: SU_FULL_PHASE_PEER_CONTENT_HASHES[phase],
        phase,
      },
      perQuestion: report.result.perQuestion.map((question) => ({
        ...question,
        peerValue: getGovernedPeerValue(question.stableKey, phase) ?? undefined,
      })),
    },
  };
}

function historicalReport() {
  const report = completeSuFullLandscapeReport();
  return {
    ...report,
    result: {
      ...report.result,
      peerBenchmarkSnapshot: undefined,
      perQuestion: report.result.perQuestion.map((question) => {
        const historicalQuestion = { ...question };
        delete historicalQuestion.peerValue;
        return historicalQuestion;
      }),
    },
  };
}

function corruptReportWithStalePresentation() {
  const validReport = reportForPhase(4);
  const presentation = completeSuFullLandscapePresentation(validReport);
  return {
    presentation,
    report: {
      ...validReport,
      result: {
        ...validReport.result,
        perQuestion: validReport.result.perQuestion.map((question) => question.stableKey === "Q01"
          ? { ...question, peerValue: 6.5 }
          : question),
      },
    },
  };
}

async function horizontalOverflow(page: Page) {
  return page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth,
    offenders: [...document.querySelectorAll("body *")]
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return { selector: `${element.tagName}.${element.className}`, left: rect.left, right: rect.right };
      })
      .filter((item) => item.left < -1 || item.right > document.documentElement.clientWidth + 1)
      .slice(0, 10),
  }));
}

async function q01PeerValue(page: Page): Promise<string> {
  return page.locator("[data-testid='su-landscape-detail-bars-Q01'] .su-full-landscape-bar-measure")
    .filter({ hasText: "Peers" })
    .locator(".su-full-landscape-bar-value")
    .innerText();
}

async function saveVisualArtifact(page: Page, name: string, selector: string): Promise<void> {
  if (process.env.SU_FULL_LANDSCAPE_VISUAL_ARTIFACTS !== "1") return;
  const directory = join(process.cwd(), "tmp", "screenshots", "su-full-phase-peers");
  mkdirSync(directory, { recursive: true });
  await page.locator(selector).screenshot({
    path: join(directory, `${name}.png`),
    animations: "disabled",
  });
}

function reportWithRepresentativeDensityFeedback() {
  const report = completeSuFullLandscapeReport();
  return {
    ...report,
    result: {
      ...report.result,
      perQuestion: report.result.perQuestion.map((question) => question.stableKey === "Q35"
        ? { ...question, recommendation: REPRESENTATIVE_482_CHARACTER_FEEDBACK }
        : question),
    },
  };
}

async function labelFit(page: Page, pageNumbers: readonly number[]) {
  return page.locator(
    pageNumbers.map((number) => `[data-page-number="${number}"] .su-full-landscape-vertical-chart`).join(","),
  ).evaluateAll((charts) => charts.flatMap((chart) =>
    [...chart.querySelectorAll<HTMLElement>(".su-full-landscape-chart-row")].map((row) => {
      const label = row.querySelector<HTMLElement>(".su-full-landscape-chart-question");
      if (!label) throw new Error("Missing question label");
      const rowRect = row.getBoundingClientRect();
      const labelRect = label.getBoundingClientRect();
      const style = getComputedStyle(label);
      return {
        page: chart.closest<HTMLElement>("[data-page-number]")?.dataset.pageNumber ?? "unknown",
        label: label.textContent?.trim() ?? "",
        rowTop: rowRect.top,
        rowBottom: rowRect.bottom,
        labelTop: labelRect.top,
        labelBottom: labelRect.bottom,
        scrollHeight: label.scrollHeight,
        clientHeight: label.clientHeight,
        overflow: style.overflow,
        overflowY: style.overflowY,
        textOverflow: style.textOverflow,
        webkitLineClamp: style.webkitLineClamp,
      };
    }),
  ));
}

function expectLabelsToFit(rows: Awaited<ReturnType<typeof labelFit>>) {
  expect(rows).toHaveLength(122);
  expect(rows.filter((row) =>
    row.label === ""
    || row.scrollHeight > row.clientHeight + 1
    || row.labelTop < row.rowTop - 1
    || row.labelBottom > row.rowBottom + 1
    || row.overflow === "hidden"
    || row.overflowY === "hidden"
    || row.textOverflow === "ellipsis"
    || row.webkitLineClamp !== "none"
  )).toEqual([]);
}

function expectedChartMembership(report: ReturnType<typeof completeSuFullLandscapeReport>) {
  const keys = report.result.perQuestion.map((question) => question.stableKey);
  const chapters = [
    keys.slice(0, 13),
    keys.slice(13, 20),
    keys.slice(20, 40),
    keys.slice(40, 45),
    keys.slice(45, 61),
  ];
  return [
    { page: "7", charts: [chapters[0]] },
    { page: "11", charts: [chapters[1]] },
    { page: "14", charts: [chapters[2]] },
    { page: "19", charts: [chapters[3]] },
    { page: "21", charts: [chapters[4]] },
    { page: "26", charts: chapters },
  ];
}

async function chartMembership(page: Page) {
  return page.locator(CHART_PAGES.map((number) => `[data-page-number="${number}"]`).join(","))
    .evaluateAll((surfaces) => surfaces.map((surface) => ({
      page: (surface as HTMLElement).dataset.pageNumber ?? "unknown",
      charts: [...surface.querySelectorAll<HTMLElement>(".su-full-landscape-vertical-chart")]
        .map((chart) => [...chart.querySelectorAll<HTMLElement>(".su-full-landscape-chart-row")]
          .map((row) => (row.dataset.testid ?? "").replace("su-landscape-vertical-row-", ""))),
    })));
}

async function mobilePeerRows(page: Page, pageNumbers: readonly number[]) {
  return page.locator(
    pageNumbers.map((number) => `[data-page-number="${number}"] .su-full-landscape-chart-row`).join(","),
  ).evaluateAll((rows) => rows.map((row) => {
    const scale = row.querySelector<HTMLElement>(".su-full-landscape-mobile-peer-scale");
    const fill = scale?.querySelector<HTMLElement>(".su-full-landscape-bar-fill--peers");
    const label = row.querySelector<HTMLElement>(".su-full-landscape-mobile-peer-label");
    const value = row.querySelector<HTMLElement>(".su-full-landscape-mobile-peer-value");
    if (!scale || !fill || !label || !value) throw new Error("Missing mobile peer comparison");
    const scaleRect = scale.getBoundingClientRect();
    const fillRect = fill.getBoundingClientRect();
    const expected = Number((row as HTMLElement).dataset.peerScore);
    return {
      stableKey: ((row as HTMLElement).dataset.testid ?? "").replace("su-landscape-vertical-row-", ""),
      expected,
      labelVisible: getComputedStyle(label).display !== "none" && label.getBoundingClientRect().width > 0,
      scaleVisible: getComputedStyle(scale).display !== "none" && scaleRect.width > 0,
      valueVisible: getComputedStyle(value).display !== "none" && value.getBoundingClientRect().width > 0,
      value: Number(value.textContent?.trim()),
      widthError: Math.abs(fillRect.width - scaleRect.width * expected / 10),
    };
  }));
}

async function load(page: Page, html: string): Promise<void> {
  await page.setContent(
    `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0}${stylesheet()}</style></head><body>${html}</body></html>`,
    { waitUntil: "load" },
  );
  await page.evaluate(() => document.fonts.ready);
}

async function geometry(page: Page, pageNumber: number) {
  return page.locator(`[data-page-number="${pageNumber}"] .su-full-landscape-vertical-chart`).evaluateAll((charts) =>
    charts.map((chart) => {
      const svg = chart.querySelector<SVGSVGElement>(".su-full-landscape-peer-contour");
      const polyline = svg?.querySelector("polyline");
      const rows = [...chart.querySelectorAll<HTMLElement>(".su-full-landscape-chart-row")];
      if (!svg || !polyline || rows.length === 0) throw new Error("Incomplete vertical chart");
      const matrix = svg.getScreenCTM();
      if (!matrix) throw new Error("Missing SVG transform");
      const points = (polyline.getAttribute("points") ?? "").trim().split(/\s+/).map((pair) => pair.split(",").map(Number));
      return {
        display: getComputedStyle(svg).display,
        vectorEffect: getComputedStyle(polyline).vectorEffect,
        rows: rows.map((row, index) => {
          const track = row.querySelector<HTMLElement>(".su-full-landscape-vertical-scale");
          if (!track) throw new Error("Missing vertical scale");
          const [x, y] = points[index] ?? [];
          const svgPoint = svg.createSVGPoint();
          svgPoint.x = x;
          svgPoint.y = y;
          const rendered = svgPoint.matrixTransform(matrix);
          const trackRect = track.getBoundingClientRect();
          const rowRect = row.getBoundingClientRect();
          const peers = Number(row.dataset.peerScore);
          return {
            xError: Math.abs(rendered.x - (trackRect.left + peers / 10 * trackRect.width)),
            yError: Math.abs(rendered.y - (rowRect.top + rowRect.height / 2)),
          };
        }),
      };
    }),
  );
}

function normalize(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeWords(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

describe("SU Full landscape browser and PDF contract", () => {
  let browser: Browser;
  let savedEnabled: string | undefined;
  let savedKill: string | undefined;

  beforeAll(async () => {
    savedEnabled = process.env[ENABLED];
    savedKill = process.env[KILL];
    process.env[ENABLED] = "1";
    delete process.env[KILL];
    browser = await chromium.launch({ headless: true });
  });

  afterAll(async () => {
    await browser.close();
    if (savedEnabled === undefined) delete process.env[ENABLED];
    else process.env[ENABLED] = savedEnabled;
    if (savedKill === undefined) delete process.env[KILL];
    else process.env[KILL] = savedKill;
  });

  it("under print media keeps every opener and Appendix contour on its 0-10 track and row center", async () => {
    const { html, report } = routeMarkup();
    const page = await browser.newPage({ viewport: { width: 1123, height: 794 } });
    try {
      await load(page, html);
      await page.emulateMedia({ media: "print" });
      await expect(page.locator("[data-enabled-report-style]").getAttribute("data-enabled-report-style"))
        .resolves.toBe("CLASSIC");
      for (const pageNumber of OPENER_PAGES) {
        const charts = await geometry(page, pageNumber);
        expect(charts).toHaveLength(1);
        for (const chart of charts) {
          expect(chart.display).not.toBe("none");
          expect(chart.vectorEffect).toBe("non-scaling-stroke");
          for (const row of chart.rows) {
            expect(row.xError).toBeLessThanOrEqual(1);
            expect(row.yError).toBeLessThanOrEqual(1);
          }
        }
      }
      const appendixCharts = await geometry(page, 26);
      expect(appendixCharts).toHaveLength(5);
      for (const chart of appendixCharts) {
        expect(chart.display).not.toBe("none");
        expect(chart.vectorEffect).toBe("non-scaling-stroke");
        expect(chart.rows.every((row) => row.xError <= 1 && row.yError <= 1)).toBe(true);
      }
      const membership = await chartMembership(page);
      expect(membership).toEqual(expectedChartMembership(report));
      expect(membership.flatMap((surface) => surface.charts.flat())).toHaveLength(122);
      expectLabelsToFit(await labelFit(page, CHART_PAGES));
      await expect(page.locator("main").count()).resolves.toBe(1);
      await expect(page.locator("main[data-testid='route-wrapper']").count()).resolves.toBe(1);
      await expect(page.locator(".su-full-landscape-peer-contour").count()).resolves.toBe(10);
      await expect(page.locator(".su-full-landscape-peer-contour[stroke-dasharray]").count()).resolves.toBe(0);
    } finally {
      await page.close();
    }
  });

  it.each([375, 760])("has no horizontal overflow and uses governed visible peer bars with the contour hidden at %ipx", async (width) => {
    const { html, report } = routeMarkup();
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    try {
      await load(page, html);
      const dimensions = await page.evaluate(() => ({
        viewport: document.documentElement.clientWidth,
        document: document.documentElement.scrollWidth,
        offenders: [...document.querySelectorAll("body *")]
          .map((element) => {
            const rect = element.getBoundingClientRect();
            return { selector: `${element.tagName}.${element.className}`, left: rect.left, right: rect.right };
          })
          .filter((item) => item.left < -1 || item.right > document.documentElement.clientWidth + 1)
          .slice(0, 10),
      }));
      expect(dimensions.offenders).toEqual([]);
      expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport + 1);
      const contourVisibility = await page.locator(
        CHART_PAGES.map((number) => `[data-page-number="${number}"] .su-full-landscape-peer-contour`).join(","),
      ).evaluateAll((contours) => contours.map((contour) => getComputedStyle(contour).display));
      expect(contourVisibility).toHaveLength(10);
      expect(contourVisibility.every((display) => display === "none")).toBe(true);
      const peerRows = await mobilePeerRows(page, CHART_PAGES);
      expect(peerRows).toHaveLength(122);
      expect(peerRows.map((row) => row.stableKey)).toEqual(
        expectedChartMembership(report).flatMap((surface) => surface.charts.flat()),
      );
      expect(peerRows.every((row) => row.labelVisible && row.scaleVisible && row.valueVisible)).toBe(true);
      expect(peerRows.every((row) => row.value === row.expected && row.widthError <= 1)).toBe(true);
      await expect(page.locator("[data-page-number='7'] .su-full-landscape-chart-legend").isVisible())
        .resolves.toBe(true);
      expectLabelsToFit(await labelFit(page, CHART_PAGES));
    } finally {
      await page.close();
    }
  });

  it("keeps P3, P4, P5, and historical peer provenance, values, layout, and PDF pages stable while corrupt peers stay omitted", async () => {
    const cases = [
      { name: "p3", report: reportForPhase(3), provenance: `Phase P3 · ${SU_FULL_PHASE_PEER_SOURCE_ID}`, disclosure: PEER_DISCLOSURE, q01: "6.3" },
      { name: "p4", report: reportForPhase(4), provenance: `Phase P4 · ${SU_FULL_PHASE_PEER_SOURCE_ID}`, disclosure: PEER_DISCLOSURE, q01: "6.6" },
      { name: "p5", report: reportForPhase(5), provenance: `Phase P5 · ${SU_FULL_PHASE_PEER_SOURCE_ID}`, disclosure: PEER_DISCLOSURE, q01: "6.3" },
      { name: "historical", report: historicalReport(), provenance: `Legacy baseline · ${SU_FULL_LEGACY_PEER_SOURCE_ID}`, disclosure: LEGACY_PEER_DISCLOSURE, q01: "6.3" },
    ] as const;
    const directory = mkdtempSync(join(tmpdir(), "su-full-phase-peer-browser-"));

    try {
      for (const fixture of cases) {
        const { html } = routeMarkup(fixture.report);
        const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
        try {
          await load(page, html);
          await expect(page.locator("[data-testid^='su-full-landscape-page-']").count()).resolves.toBe(26);
          await expect(page.getByText(fixture.disclosure).count()).resolves.toBeGreaterThanOrEqual(2);
          if (fixture.name === "historical") {
            await expect(page.getByText(PEER_DISCLOSURE).count()).resolves.toBe(0);
            await expect(page.getByText(/selected by organizational phase|frozen when this result was scored/i).count()).resolves.toBe(0);
          }
          await expect(page.locator("[data-page-number='6']").innerText()).resolves.toContain(fixture.provenance);
          await expect(page.locator("[data-page-number='8']").innerText()).resolves.toContain(fixture.provenance);
          await expect(q01PeerValue(page)).resolves.toBe(fixture.q01);
          const desktop = await horizontalOverflow(page);
          expect(desktop.offenders).toEqual([]);
          expect(desktop.document).toBeLessThanOrEqual(desktop.viewport + 1);
          await saveVisualArtifact(page, `${fixture.name}-desktop-page-6`, "[data-page-number='6']");
          await saveVisualArtifact(page, `${fixture.name}-desktop-page-8`, "[data-page-number='8']");

          await page.setViewportSize({ width: 390, height: 844 });
          const mobile = await horizontalOverflow(page);
          expect(mobile.offenders).toEqual([]);
          expect(mobile.document).toBeLessThanOrEqual(mobile.viewport + 1);
          const mobileDetailColumns = await page.locator("[data-page-number='8'] .su-full-landscape-page-body")
            .evaluate((body) => getComputedStyle(body).gridTemplateColumns.split(" ").filter(Boolean).length);
          expect(mobileDetailColumns).toBe(1);
          await expect(q01PeerValue(page)).resolves.toBe(fixture.q01);
          await saveVisualArtifact(page, `${fixture.name}-mobile-page-8`, "[data-page-number='8']");

          await page.setViewportSize({ width: 1280, height: 720 });
          await page.emulateMedia({ media: "print" });
          await expect(q01PeerValue(page)).resolves.toBe(fixture.q01);
          const printDetail = await page.locator("[data-page-number='8']").evaluate((detail) => {
            const pageRect = detail.getBoundingClientRect();
            const feedback = [...detail.querySelectorAll<HTMLElement>(".su-full-landscape-feedback")];
            return {
              scrollWidth: (detail as HTMLElement).scrollWidth,
              clientWidth: (detail as HTMLElement).clientWidth,
              feedbackOutside: feedback.filter((paragraph) => {
                const rect = paragraph.getBoundingClientRect();
                return rect.left < pageRect.left - 1
                  || rect.right > pageRect.right + 1
                  || rect.bottom > pageRect.bottom + 1;
              }).length,
            };
          });
          expect(printDetail.scrollWidth).toBeLessThanOrEqual(printDetail.clientWidth + 1);
          expect(printDetail.feedbackOutside).toBe(0);
          await saveVisualArtifact(page, `${fixture.name}-print-page-8`, "[data-page-number='8']");

          const pdfPath = join(directory, `${fixture.name}.pdf`);
          await page.pdf({
            path: pdfPath,
            format: "A4",
            landscape: true,
            preferCSSPageSize: true,
            printBackground: true,
          });
          expect(execFileSync("pdfinfo", [pdfPath], { encoding: "utf8" })).toMatch(/^Pages:\s+26$/m);
          const pdfText = normalize(execFileSync("pdftotext", [pdfPath, "-"], { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 }));
          expect(pdfText).toContain(fixture.provenance);
          expect(pdfText).toContain(fixture.disclosure);
          if (fixture.name === "historical") expect(pdfText).not.toContain(PEER_DISCLOSURE);
        } finally {
          await page.close();
        }
      }

      const corrupt = corruptReportWithStalePresentation();
      const { html } = routeMarkup(corrupt.report, corrupt.presentation);
      const corruptPage = await browser.newPage({ viewport: { width: 1280, height: 720 } });
      try {
        await load(corruptPage, html);
        await expect(corruptPage.locator("[data-testid='su-full-landscape-report']").count()).resolves.toBe(0);
        await expect(corruptPage.locator("[data-testid='su-full-peer-sequence']").count()).resolves.toBe(0);
        await expect(corruptPage.getByText(PEER_DISCLOSURE).count()).resolves.toBe(0);
        await expect(corruptPage.getByText(/Phase P[1-5] ·|Legacy baseline ·/).count()).resolves.toBe(0);
        await saveVisualArtifact(corruptPage, "corrupt-desktop", ".su-report-page");
        await corruptPage.setViewportSize({ width: 390, height: 844 });
        const mobile = await horizontalOverflow(corruptPage);
        expect(mobile.offenders).toEqual([]);
        expect(mobile.document).toBeLessThanOrEqual(mobile.viewport + 1);
        await saveVisualArtifact(corruptPage, "corrupt-mobile", ".su-report-page");
        await corruptPage.setViewportSize({ width: 1280, height: 720 });
        await corruptPage.emulateMedia({ media: "print" });
        await saveVisualArtifact(corruptPage, "corrupt-print", ".su-report-page");
        await expect(corruptPage.getByText(PEER_DISCLOSURE).count()).resolves.toBe(0);
      } finally {
        await corruptPage.close();
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("meets all five chapter contrast contracts and produces a complete 26-page A4 landscape PDF", async () => {
    const { html, report } = routeMarkup(reportWithRepresentativeDensityFeedback());
    const page = await browser.newPage({ viewport: { width: 1123, height: 794 } });
    const directory = mkdtempSync(join(tmpdir(), "su-full-landscape-browser-"));
    const pdfPath = join(directory, "report.pdf");
    try {
      await load(page, html);
      await page.emulateMedia({ media: "print" });
      const contrast = await page.locator(
        OPENER_PAGES.map((number) => `[data-page-number="${number}"]`).join(","),
      ).evaluateAll((roots) => {
        const rgb = (value: string) => (value.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
        const luminance = (value: string) => {
          const [red, green, blue] = rgb(value).map((channel) => {
            const normalized = channel / 255;
            return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
          });
          return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
        };
        const ratio = (foreground: string, background: string) => {
          const first = luminance(foreground);
          const second = luminance(background);
          return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
        };
        return roots.map((root) => {
          const kicker = root.querySelector<HTMLElement>(".su-full-landscape-chapter-kicker");
          const contour = root.querySelector<SVGSVGElement>(".su-full-landscape-peer-contour");
          if (!kicker || !contour) throw new Error("Missing contrast targets");
          return {
            page: (root as HTMLElement).dataset.pageNumber,
            kicker: ratio(getComputedStyle(kicker).color, "rgb(255, 255, 255)"),
            contour: ratio(getComputedStyle(contour).color, "rgb(255, 255, 255)"),
          };
        });
      });
      expect(contrast).toHaveLength(5);
      expect(contrast.every((chapter) => chapter.kicker >= 4.5)).toBe(true);
      expect(contrast.every((chapter) => chapter.contour >= 3)).toBe(true);

      const barContrast = await page.locator(
        [8, 12, 15, 20, 22].map((number) => `[data-page-number="${number}"] .su-full-landscape-detail`).join(","),
      ).evaluateAll((details) => {
        const rgb = (value: string) => (value.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
        const luminance = (value: string) => {
          const [red, green, blue] = rgb(value).map((channel) => {
            const normalized = channel / 255;
            return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
          });
          return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
        };
        const ratio = (firstColor: string, secondColor: string) => {
          const first = luminance(firstColor);
          const second = luminance(secondColor);
          return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
        };
        return details.map((detail) => {
          const track = detail.querySelector<HTMLElement>(".su-full-landscape-bar-track");
          const you = detail.querySelector<HTMLElement>(".su-full-landscape-bar-fill--you");
          const peers = detail.querySelector<HTMLElement>(".su-full-landscape-bar-fill--peers");
          const value = detail.querySelector<HTMLElement>(".su-full-landscape-bar-value");
          if (!track || !you || !peers || !value) throw new Error("Missing detail contrast targets");
          const trackColor = getComputedStyle(track).backgroundColor;
          return {
            you: ratio(getComputedStyle(you).backgroundColor, trackColor),
            peers: ratio(getComputedStyle(peers).backgroundColor, trackColor),
            value: ratio(getComputedStyle(value).color, "rgb(255, 255, 255)"),
          };
        });
      });
      expect(barContrast).toHaveLength(27);
      expect(barContrast.every((row) => row.you >= 3 && row.peers >= 3 && row.value >= 4.5)).toBe(true);

      const profileFit = await page.locator("[data-page-number='5']").evaluate((profile) => {
        const footer = profile.querySelector<HTMLElement>(".su-full-landscape-page-footer");
        const rows = [...profile.querySelectorAll<HTMLElement>("tbody tr")];
        if (!footer) throw new Error("Missing page 5 footer");
        return {
          count: rows.length,
          lastRowBottom: rows.at(-1)?.getBoundingClientRect().bottom ?? Number.POSITIVE_INFINITY,
          footerTop: footer.getBoundingClientRect().top,
        };
      });
      expect(profileFit.count).toBe(15);
      expect(profileFit.lastRowBottom).toBeLessThan(profileFit.footerTop);
      expect(REPRESENTATIVE_482_CHARACTER_FEEDBACK).toHaveLength(482);
      const densityFit = await page.locator("[data-testid='su-full-landscape-detail-Q35']").evaluate((detail) => {
        const paragraph = detail.querySelector<HTMLElement>("p");
        const footer = detail.closest<HTMLElement>("[data-page-number]")
          ?.querySelector<HTMLElement>(".su-full-landscape-page-footer");
        if (!paragraph || !footer) throw new Error("Missing Q35 density targets");
        const paragraphStyle = getComputedStyle(paragraph);
        return {
          characters: (paragraph.textContent ?? "").replace(/^Frozen feedback\s*/, "").length,
          paragraphBottom: paragraph.getBoundingClientRect().bottom,
          footerTop: footer.getBoundingClientRect().top,
          scrollHeight: paragraph.scrollHeight,
          clientHeight: paragraph.clientHeight,
          overflow: paragraphStyle.overflow,
          overflowY: paragraphStyle.overflowY,
          textOverflow: paragraphStyle.textOverflow,
          webkitLineClamp: paragraphStyle.webkitLineClamp,
        };
      });
      expect(densityFit).toMatchObject({
        characters: 482,
        overflow: "visible",
        overflowY: "visible",
        textOverflow: "clip",
        webkitLineClamp: "none",
      });
      expect(densityFit.scrollHeight).toBeLessThanOrEqual(densityFit.clientHeight + 1);
      expect(densityFit.paragraphBottom).toBeLessThan(densityFit.footerTop);
      await page.pdf({
        path: pdfPath,
        format: "A4",
        landscape: true,
        preferCSSPageSize: true,
        printBackground: true,
      });
      const info = execFileSync("pdfinfo", [pdfPath], { encoding: "utf8" });
      expect(info).toMatch(/^Pages:\s+26$/m);
      expect(info).toMatch(/^Page size:\s+841\.9\d* x 594\.9\d* pts \(A4\)$/m);
      const text = normalize(execFileSync("pdftotext", [pdfPath, "-"], { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 }));
      expect(text).toContain("ScaleUp Score 55 / 100");
      expect(text.match(/Frozen feedback/g)).toHaveLength(61);
      const searchableWords = normalizeWords(text);
      expect(searchableWords).toContain(normalizeWords(REPRESENTATIVE_482_CHARACTER_FEEDBACK));
      for (const frozen of report.result.perQuestion) {
        expect(searchableWords).toContain(normalizeWords(report.questionByKey[frozen.stableKey]));
        expect(searchableWords).toContain(normalizeWords(frozen.recommendation ?? ""));
      }
    } finally {
      await page.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
