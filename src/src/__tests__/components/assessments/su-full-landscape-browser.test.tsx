/** @jest-environment node */

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
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

const ENABLED = "NEXT_PUBLIC_WAVE_SU_FULL_LANDSCAPE_REPORT_ENABLED";
const KILL = "NEXT_PUBLIC_WAVE_SU_FULL_LANDSCAPE_REPORT_KILL";

function stylesheet(): string {
  return ["su-public-brand.css", "su-report.css"]
    .map((name) => readFileSync(join(process.cwd(), "src", "styles", name), "utf8"))
    .join("\n")
    .replace(/@import[^;]+;\s*/g, "");
}

function routeMarkup(): { html: string; report: ReturnType<typeof completeSuFullLandscapeReport> } {
  const report = completeSuFullLandscapeReport();
  report.suFullPeerPresentation = completeSuFullLandscapePresentation(report);
  const html = renderToStaticMarkup(
    <ReportStyleScope report={report} reportStylesAvailable>
      <div className="su-report-page" data-testid="route-wrapper">
        <BrandedReport report={report} reportStylesAvailable contactEmail="coach@example.com" />
      </div>
    </ReportStyleScope>,
  );
  return { html, report };
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

  it("keeps contour points on the 0-10 tracks and rendered row centers on opener and Appendix layouts", async () => {
    const { html } = routeMarkup();
    const page = await browser.newPage({ viewport: { width: 1123, height: 794 } });
    try {
      await load(page, html);
      await expect(page.locator("[data-testid='route-wrapper']").getAttribute("data-enabled-report-style"))
        .resolves.toBe("CLASSIC");
      for (const pageNumber of [7, 11, 21]) {
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
      await page.emulateMedia({ media: "print" });
      const appendixCharts = await geometry(page, 26);
      expect(appendixCharts).toHaveLength(5);
      for (const chart of appendixCharts) {
        expect(chart.display).not.toBe("none");
        expect(chart.vectorEffect).toBe("non-scaling-stroke");
        expect(chart.rows.every((row) => row.xError <= 1 && row.yError <= 1)).toBe(true);
      }
      await expect(page.locator("main").count()).resolves.toBe(0);
      await expect(page.locator(".su-full-landscape-peer-contour").count()).resolves.toBe(10);
      await expect(page.locator(".su-full-landscape-peer-contour[stroke-dasharray]").count()).resolves.toBe(0);
    } finally {
      await page.close();
    }
  });

  it.each([375, 760])("has no horizontal overflow and retains a visible truthful contour at %ipx", async (width) => {
    const { html } = routeMarkup();
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
      const charts = await geometry(page, 7);
      expect(charts).toHaveLength(1);
      expect(charts[0].display).not.toBe("none");
      expect(charts[0].rows.every((row) => row.xError <= 1 && row.yError <= 1)).toBe(true);
      await expect(page.locator("[data-page-number='7'] .su-full-landscape-chart-legend").isVisible())
        .resolves.toBe(true);
    } finally {
      await page.close();
    }
  });

  it("meets visible text and peer-line contrast and produces a complete 26-page A4 landscape PDF", async () => {
    const { html, report } = routeMarkup();
    const page = await browser.newPage({ viewport: { width: 1123, height: 794 } });
    const directory = mkdtempSync(join(tmpdir(), "su-full-landscape-browser-"));
    const pdfPath = join(directory, "report.pdf");
    try {
      await load(page, html);
      const contrast = await page.locator("[data-page-number='7']").evaluate((root) => {
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
        const kicker = root.querySelector<HTMLElement>(".su-full-landscape-chapter-kicker");
        const contour = root.querySelector<SVGSVGElement>(".su-full-landscape-peer-contour");
        if (!kicker || !contour) throw new Error("Missing contrast targets");
        return {
          kicker: ratio(getComputedStyle(kicker).color, "rgb(255, 255, 255)"),
          contour: ratio(getComputedStyle(contour).color, "rgb(255, 255, 255)"),
        };
      });
      expect(contrast.kicker).toBeGreaterThanOrEqual(4.5);
      expect(contrast.contour).toBeGreaterThanOrEqual(3);

      await page.emulateMedia({ media: "print" });
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
      for (const frozen of report.result.perQuestion) {
        expect(searchableWords).toContain(normalizeWords(report.questionByKey[frozen.stableKey]));
        expect(searchableWords).toContain(normalizeWords(frozen.recommendation ?? ""));
      }
    } finally {
      await page.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });
}, 60_000);
