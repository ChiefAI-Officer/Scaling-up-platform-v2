import { mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { chromium } from "playwright";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { SuFullLandscapeReport } from "@/components/assessments/su-full-landscape/SuFullLandscapeReport";
import {
  completeSuFullLandscapePresentation,
  completeSuFullLandscapeReport,
  restoredScalingUpFullCtaReport,
} from "@/__tests__/fixtures/su-full-landscape";
import { buildSuFullLandscapeReportModel } from "@/lib/assessments/su-full-landscape-report";

const appRoot = process.cwd();
const defaultOutputPath = join(appRoot, "tmp/pdfs/su-full-landscape-fixture.pdf");

type CaptureVariant = "edition-6" | "null-preface";

function captureVariant(): CaptureVariant {
  const variant = process.env.SU_FULL_LANDSCAPE_CAPTURE_VARIANT ?? "null-preface";
  if (variant !== "edition-6" && variant !== "null-preface") {
    throw new Error(`Unsupported SU Full landscape capture variant: ${variant}`);
  }
  return variant;
}

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

async function localBrandAssets(): Promise<{ logo: string; signature: string }> {
  const brandRoot = join(appRoot, "public", "brand");
  const [logo, signature] = await Promise.all([
    readFile(join(brandRoot, "su-logo-white.svg")),
    readFile(join(brandRoot, "verne-harnish-signature.png")),
  ]);
  return {
    logo: `data:image/svg+xml;base64,${logo.toString("base64")}`,
    signature: `data:image/png;base64,${signature.toString("base64")}`,
  };
}

async function main(): Promise<void> {
  const outputPath = process.env.SU_FULL_LANDSCAPE_CAPTURE_OUTPUT ?? defaultOutputPath;
  const report = captureVariant() === "edition-6"
    ? restoredScalingUpFullCtaReport()
    : completeSuFullLandscapeReport();
  const presentation = completeSuFullLandscapePresentation(report);
  const model = buildSuFullLandscapeReportModel({ report, presentation, resolvedStyle: "CLASSIC" });
  if (!model) throw new Error("Canonical SU Full landscape model is unavailable");

  const [rawStyles, assets] = await Promise.all([
    reportCss(),
    localBrandAssets(),
    mkdir(dirname(outputPath), { recursive: true }),
  ]);
  const styles = rawStyles.replace(
    'url("/brand/verne-harnish-signature.png")',
    `url("${assets.signature}")`,
  );
  const markup = renderToStaticMarkup(
    <SuFullLandscapeReport
      report={{ ...report, coachName: "Coach Example" }}
      model={model}
      contactEmail="coach@example.com"
    />,
  ).replace('src="/brand/su-logo-white.svg"', `src="${assets.logo}"`);

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

if (require.main === module) {
  main().catch((error: unknown) => {
    console.error("SU Full landscape PDF capture failed:", error);
    process.exitCode = 1;
  });
}
