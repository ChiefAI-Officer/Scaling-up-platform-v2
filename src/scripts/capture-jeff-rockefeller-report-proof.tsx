import { execFileSync } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { chromium, type Page } from "playwright";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { BrandedReport } from "@/components/assessments/BrandedReport";
import { ReportStyleScope } from "@/components/assessments/ReportStyleScope";
import { ExecutiveBoardroomReport } from "@/components/assessments/report-styles/ExecutiveBoardroomReport";
import { ModernDashboardReport } from "@/components/assessments/report-styles/ModernDashboardReport";
import { SuFullLandscapeReport } from "@/components/assessments/su-full-landscape/SuFullLandscapeReport";
import {
  completeSuFullLandscapePresentation,
  completeSuFullLandscapeReport,
} from "@/__tests__/fixtures/su-full-landscape";
import { ROCKEFELLER_BOOK_OFFER_REPORT_HTML } from "@/__tests__/fixtures/report-html";
import { buildIndividualReportPresentation } from "@/lib/assessments/individual-report-presentation";
import { prepareReportHtmlForStorage } from "@/lib/assessments/report-html";
import { buildReportStylePreviewReport } from "@/lib/assessments/report-style-preview-fixture";
import { buildSuFullLandscapeReportModel } from "@/lib/assessments/su-full-landscape-report";
import type { RespondentReport } from "@/lib/assessments/respondent-report";

const appRoot = process.cwd();
const pdfDirectory = join(appRoot, "output", "pdf");
const proofDirectory = join(appRoot, "output", "jeff-rockefeller-proof");
const bookImageUrl = "https://m.media-amazon.com/images/P/0978774957.01.LZZZZZZZ.jpg";

type ProofCase = {
  id: string;
  label: string;
  landscape: boolean;
  markup: () => string;
};

function reportHtml() {
  const prepared = prepareReportHtmlForStorage({
    reportHtml: {
      schemaVersion: 1,
      introductionHtml: ROCKEFELLER_BOOK_OFFER_REPORT_HTML,
      conclusionHtml: ROCKEFELLER_BOOK_OFFER_REPORT_HTML,
    },
  });
  if (!prepared.ok) {
    throw new Error(prepared.issues.map((issue) => issue.message).join("; "));
  }
  return (prepared.reportConfig as { reportHtml: NonNullable<RespondentReport["reportHtml"]> }).reportHtml;
}

function alternateStyleMarkup(
  style: "CLASSIC_SCORED" | "CLASSIC_QUALITATIVE" | "EXECUTIVE_BOARDROOM" | "MODERN_DASHBOARD",
): string {
  const anatomy = style === "CLASSIC_QUALITATIVE" ? "qualitative" : "scored";
  const report = {
    ...buildReportStylePreviewReport(anatomy, "normal"),
    reportStyle: "CLASSIC" as const,
    reportHtml: reportHtml(),
  };
  const presentation = buildIndividualReportPresentation(report);
  const rendered = style === "EXECUTIVE_BOARDROOM"
    ? <ExecutiveBoardroomReport presentation={presentation} reportHtml={report.reportHtml} reportHtmlPersonalization={report} />
    : style === "MODERN_DASHBOARD"
      ? <ModernDashboardReport presentation={presentation} reportHtml={report.reportHtml} reportHtmlPersonalization={report} />
      : (
        <ReportStyleScope report={report} reportStylesAvailable>
          <div className="su-report-page">
            <BrandedReport report={report} reportStylesAvailable />
          </div>
        </ReportStyleScope>
      );
  return renderToStaticMarkup(<main className="su-public-brand su-report">{rendered}</main>);
}

function suFullMarkup(historical: boolean): string {
  const source = completeSuFullLandscapeReport();
  const report = {
    ...source,
    reportHtml: reportHtml(),
    result: historical
      ? {
        ...source.result,
        peerBenchmarkSnapshot: undefined,
        perQuestion: source.result.perQuestion.map((question) => {
          const historicalQuestion = { ...question };
          delete historicalQuestion.peerValue;
          return historicalQuestion;
        }),
      }
      : source.result,
  };
  const presentation = completeSuFullLandscapePresentation(report);
  const model = buildSuFullLandscapeReportModel({ report, presentation, resolvedStyle: "CLASSIC" });
  if (!model) throw new Error("Scaling Up Full proof model is unavailable");
  return renderToStaticMarkup(
    <main className="su-public-brand su-report">
      <SuFullLandscapeReport
        report={{ ...report, coachName: historical ? "Historical pinned version" : "Current version" }}
        model={model}
        contactEmail="coach@example.com"
      />
    </main>,
  );
}

async function stylesheet(): Promise<string> {
  return (await Promise.all([
    "su-public-brand.css",
    "su-report.css",
    "su-report-executive.css",
    "su-report-dashboard.css",
  ].map((name) => readFile(join(appRoot, "src", "styles", name), "utf8"))))
    .join("\n")
    .replace(/@import[^;]+;\s*/g, "");
}

async function dataUrl(path: string, mimeType: string): Promise<string> {
  return `data:${mimeType};base64,${(await readFile(path)).toString("base64")}`;
}

async function settleImages(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map((image) => {
      if (image.complete) return Promise.resolve();
      return new Promise<void>((resolve) => {
        image.addEventListener("load", () => resolve(), { once: true });
        image.addEventListener("error", () => resolve(), { once: true });
      });
    }));
  });
}

async function authoredLayoutAudit(page: Page) {
  return page.locator("[data-testid^='report-html-']").evaluateAll((sections) => sections.map((section) => {
    const rect = section.getBoundingClientRect();
    const images = [...section.querySelectorAll("img")];
    const offerCell = section.querySelector<HTMLTableCellElement>('td[aria-label="Book offer"]');
    const offerImage = offerCell?.querySelector<HTMLImageElement>("img");
    const offerCopy = offerCell?.querySelector<HTMLParagraphElement>("p");
    return {
      region: section.getAttribute("data-testid"),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      horizontalOverflow: section.scrollWidth > section.clientWidth + 1,
      verticalOverflow: section.scrollHeight > section.clientHeight + 1,
      imageFailures: images.filter((image) => !image.complete || image.naturalWidth === 0).length,
      bookImageNaturalWidth: offerImage?.naturalWidth ?? 0,
      bookImageRenderedWidth: Math.round(offerImage?.getBoundingClientRect().width ?? 0),
      bookOfferColumnWidth: Math.round(offerCell?.getBoundingClientRect().width ?? 0),
      bookOfferCopyWidth: Math.round(offerCopy?.getBoundingClientRect().width ?? 0),
      links: [...section.querySelectorAll<HTMLAnchorElement>("a")].map((anchor) => anchor.href),
      hasConclusion: section.textContent?.includes("Conclusion") ?? false,
      hasBookOffer: section.textContent?.includes("Order your own personal copy") ?? false,
      hasVerne: section.textContent?.includes("Verne Harnish") ?? false,
    };
  }));
}

async function main(): Promise<void> {
  const cases: ProofCase[] = [
    { id: "classic-scored-current", label: "Classic scored - current", landscape: false, markup: () => alternateStyleMarkup("CLASSIC_SCORED") },
    { id: "classic-qualitative-current", label: "Classic qualitative - current", landscape: false, markup: () => alternateStyleMarkup("CLASSIC_QUALITATIVE") },
    { id: "executive-boardroom-current", label: "Executive Boardroom - current", landscape: false, markup: () => alternateStyleMarkup("EXECUTIVE_BOARDROOM") },
    { id: "modern-dashboard-current", label: "Modern Dashboard - current", landscape: false, markup: () => alternateStyleMarkup("MODERN_DASHBOARD") },
    { id: "scaling-up-full-current", label: "Scaling Up Full - current", landscape: true, markup: () => suFullMarkup(false) },
    { id: "scaling-up-full-historical", label: "Scaling Up Full - historical pinned", landscape: true, markup: () => suFullMarkup(true) },
  ];

  await rm(proofDirectory, { recursive: true, force: true });
  await mkdir(proofDirectory, { recursive: true });
  await mkdir(pdfDirectory, { recursive: true });

  const [css, logo, diagram, signature, book] = await Promise.all([
    stylesheet(),
    dataUrl(join(appRoot, "public", "brand", "su-logo-white.svg"), "image/svg+xml"),
    dataUrl(join(appRoot, "public", "brand", "su-esperto-five-decisions.png"), "image/png"),
    dataUrl(join(appRoot, "public", "brand", "verne-harnish-signature.png"), "image/png"),
    fetch(bookImageUrl).then(async (response) => {
      if (!response.ok) throw new Error(`Book image request failed with ${response.status}`);
      return `data:image/jpeg;base64,${Buffer.from(await response.arrayBuffer()).toString("base64")}`;
    }),
  ]);
  const proofCss = css.replace('url("/brand/verne-harnish-signature.png")', `url("${signature}")`);
  const browser = await chromium.launch({ headless: true });
  const metrics = [];
  try {
    for (const proof of cases) {
      const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
      const pdfPath = join(pdfDirectory, `jeff-rockefeller-${proof.id}.pdf`);
      try {
        const markup = proof.markup()
          .replaceAll('src="/brand/su-logo-white.svg"', `src="${logo}"`)
          .replaceAll('src="/brand/su-esperto-five-decisions.png"', `src="${diagram}"`)
          .replaceAll(`src="${bookImageUrl}"`, `src="${book}"`);
        await page.setContent(
          `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0}${proofCss}</style></head><body>${markup}</body></html>`,
          { waitUntil: "load" },
        );
        await settleImages(page);
        const screenAudit = await authoredLayoutAudit(page);
        for (const region of ["introduction", "conclusion"] as const) {
          const locator = page.locator(`[data-testid='report-html-${region}']`);
          await locator.scrollIntoViewIfNeeded();
          await locator.screenshot({
            path: join(proofDirectory, `${proof.id}-${region}.png`),
            animations: "disabled",
          });
        }
        await page.emulateMedia({ media: "print" });
        const printAudit = await authoredLayoutAudit(page);
        await page.pdf({
          path: pdfPath,
          format: proof.landscape ? "A4" : "Letter",
          landscape: proof.landscape,
          preferCSSPageSize: true,
          printBackground: true,
          displayHeaderFooter: false,
        });
        const info = execFileSync("pdfinfo", [pdfPath], { encoding: "utf8" });
        const text = execFileSync("pdftotext", [pdfPath, "-"], { encoding: "utf8" });
        metrics.push({
          id: proof.id,
          label: proof.label,
          pdfPath,
          physicalPages: Number(info.match(/^Pages:\s+(\d+)$/m)?.[1]),
          prefaceOfferCount: Number(screenAudit[0]?.hasBookOffer),
          closingOfferCount: Number(screenAudit[1]?.hasBookOffer),
          pdfOfferOccurrences: text.match(/\bOrder\b/g)?.length ?? 0,
          screenAudit,
          printAudit,
        });
      } finally {
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }
  const failures = metrics.flatMap((proof) => {
    const regions = [...proof.screenAudit, ...proof.printAudit];
    const invalidRegion = regions.some((region) =>
      region.horizontalOverflow
      || region.verticalOverflow
      || region.imageFailures !== 0
      || region.bookImageNaturalWidth === 0
      || region.bookImageRenderedWidth < 100
      || region.bookOfferColumnWidth < 160
      || region.bookOfferCopyWidth < 140
      || !region.links.includes("https://scalingup.com/")
      || !region.links.includes("https://amzn.to/4xtRFrS")
      || !region.hasConclusion
      || !region.hasBookOffer
      || !region.hasVerne
    );
    return proof.physicalPages < 1
      || proof.prefaceOfferCount !== 1
      || proof.closingOfferCount !== 1
      || proof.pdfOfferOccurrences !== 2
      || regions.length !== 4
      || invalidRegion
      ? [proof.id]
      : [];
  });
  if (metrics.length !== cases.length || failures.length > 0) {
    throw new Error(`Rockefeller proof audit failed: ${failures.join(", ") || "missing case"}`);
  }
  await writeFile(join(proofDirectory, "verification.json"), `${JSON.stringify(metrics, null, 2)}\n`);
  console.log(JSON.stringify(metrics, null, 2));
}

main().catch((error: unknown) => {
  console.error("Jeff Rockefeller report proof capture failed:", error);
  process.exitCode = 1;
});
