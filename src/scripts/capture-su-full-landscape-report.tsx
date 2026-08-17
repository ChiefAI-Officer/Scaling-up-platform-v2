import { mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { chromium } from "playwright";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { SuFullLandscapeReport } from "@/components/assessments/su-full-landscape/SuFullLandscapeReport";
import {
  completeSuFullLandscapePresentation,
  completeSuFullLandscapeReport,
} from "@/__tests__/fixtures/su-full-landscape";
import { buildSuFullLandscapeReportModel } from "@/lib/assessments/su-full-landscape-report";

const appRoot = process.cwd();
const outputPath = join(appRoot, "tmp/pdfs/su-full-landscape-fixture.pdf");

async function reportCss(): Promise<string> {
  const stylesRoot = join(appRoot, "src/styles");
  const [brand, report] = await Promise.all([
    readFile(join(stylesRoot, "su-public-brand.css"), "utf8"),
    readFile(join(stylesRoot, "su-report.css"), "utf8"),
  ]);

  // The canonical capture is offline/deterministic; Helvetica/Arial provide
  // the same local fallback that production uses when the hosted font is absent.
  return `${brand.replace(/@import[^;]+;\\s*/g, "")}\n${report}`;
}

async function main(): Promise<void> {
  const report = completeSuFullLandscapeReport();
  const presentation = completeSuFullLandscapePresentation(report);
  const model = buildSuFullLandscapeReportModel({ report, presentation });
  if (!model) throw new Error("Canonical SU Full landscape model is unavailable");

  const [styles] = await Promise.all([reportCss(), mkdir(dirname(outputPath), { recursive: true })]);
  const markup = renderToStaticMarkup(
    <SuFullLandscapeReport
      report={{ ...report, coachName: "Coach Example" }}
      model={model}
      contactEmail="coach@example.com"
    />,
  );

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1123, height: 794 }, deviceScaleFactor: 1 });
    await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0}${styles}</style></head><body>${markup}</body></html>`, { waitUntil: "load" });
    await page.evaluate(async () => { await document.fonts.ready; });
    await page.emulateMedia({ media: "print" });
    await page.pdf({
      path: outputPath,
      format: "A4",
      preferCSSPageSize: true,
      landscape: true,
      printBackground: true,
      displayHeaderFooter: false,
    });
  } finally {
    await browser.close();
  }
}

main().catch((error: unknown) => {
  console.error("SU Full landscape PDF capture failed:", error);
  process.exitCode = 1;
});
