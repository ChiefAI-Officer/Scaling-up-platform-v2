import { mkdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";

import { chromium } from "playwright";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { BrandedReport } from "@/components/assessments/BrandedReport";
import { ReportStyleScope } from "@/components/assessments/ReportStyleScope";
import {
  completeSuFullLandscapePresentation,
  completeSuFullLandscapeReport,
} from "@/__tests__/fixtures/su-full-landscape";
import { prepareReportHtmlForStorage, loadSafeReportHtml } from "@/lib/assessments/report-html";
import {
  SU_FULL_PHASE_PEER_CONTENT_HASHES,
  SU_FULL_PHASE_PEER_SOURCE_ID,
  getGovernedPeerValue,
} from "@/lib/assessments/su-full-phase-peer-catalogue";

const appRoot = process.cwd();
export const REPORT_HTML_PEER_OUTPUT_DIRECTORY = join(appRoot, "output", "report-html-peers-integration");

const SU_FULL_LANDSCAPE_ENABLED_ENV = "NEXT_PUBLIC_WAVE_SU_FULL_LANDSCAPE_REPORT_ENABLED";
const SU_FULL_LANDSCAPE_KILL_ENV = "NEXT_PUBLIC_WAVE_SU_FULL_LANDSCAPE_REPORT_KILL";

export const LONG_WELCOME_VISIBLE_CHARACTERS = 2_100;
export const LONG_CLOSING_VISIBLE_CHARACTERS = 850;

const longWelcome = "W".repeat(LONG_WELCOME_VISIBLE_CHARACTERS);
const longClosing = "C".repeat(LONG_CLOSING_VISIBLE_CHARACTERS);

type AuthoringCase = "default" | "welcome-only" | "closing-only" | "both" | "long" | "adversarial";
type PeerReference = "current" | "historical";

type CaptureFixture = {
  id: `${AuthoringCase}-${PeerReference}`;
  authoringCase: AuthoringCase;
  peerReference: PeerReference;
  introductionHtml: string | null;
  conclusionHtml: string | null;
  welcomeVisibleCharacters: number;
  closingVisibleCharacters: number;
};

const authoringCases: ReadonlyArray<Omit<CaptureFixture, "id" | "peerReference">> = [
  {
    authoringCase: "default",
    introductionHtml: null,
    conclusionHtml: null,
    welcomeVisibleCharacters: 0,
    closingVisibleCharacters: 0,
  },
  {
    authoringCase: "welcome-only",
    introductionHtml: "<h2>Welcome to your report</h2><p>Use these results to plan your next conversation.</p>",
    conclusionHtml: null,
    welcomeVisibleCharacters: "Welcome to your reportUse these results to plan your next conversation.".length,
    closingVisibleCharacters: 0,
  },
  {
    authoringCase: "closing-only",
    introductionHtml: null,
    conclusionHtml: "<h2>Keep moving</h2><p>Choose one next step and agree an owner.</p>",
    welcomeVisibleCharacters: 0,
    closingVisibleCharacters: "Keep movingChoose one next step and agree an owner.".length,
  },
  {
    authoringCase: "both",
    introductionHtml: "<h2>Welcome to your report</h2><p>Use these results to plan your next conversation.</p>",
    conclusionHtml: "<h2>Keep moving</h2><p>Choose one next step and agree an owner.</p>",
    welcomeVisibleCharacters: "Welcome to your reportUse these results to plan your next conversation.".length,
    closingVisibleCharacters: "Keep movingChoose one next step and agree an owner.".length,
  },
  {
    authoringCase: "long",
    introductionHtml: `<p>${longWelcome}</p>`,
    conclusionHtml: `<p>${longClosing}</p>`,
    welcomeVisibleCharacters: LONG_WELCOME_VISIBLE_CHARACTERS,
    closingVisibleCharacters: LONG_CLOSING_VISIBLE_CHARACTERS,
  },
  {
    authoringCase: "adversarial",
    introductionHtml: `<div class="su-full-landscape-page" id="authored-page" data-region="welcome" role="status" aria-labelledby="report-style-actions-title" style="white-space:nowrap;font-size:9999px;line-height:9999px;letter-spacing:9999px;padding:9999px;margin:9999px;gap:9999px"><p>${"W".repeat(2_200)}</p></div>`,
    conclusionHtml: `<div class="su-full-landscape-page" id="authored-page" data-region="closing" role="status" aria-labelledby="report-style-actions-title" style="white-space:nowrap;font-size:9999px;line-height:9999px;letter-spacing:9999px;padding:9999px;margin:9999px;gap:9999px"><p>${"C".repeat(900)}</p></div>`,
    welcomeVisibleCharacters: 2_200,
    closingVisibleCharacters: 900,
  },
];

export const REPORT_HTML_PEER_FIXTURES: readonly CaptureFixture[] = authoringCases.flatMap((authoring) => [
  { ...authoring, id: `${authoring.authoringCase}-current` as const, peerReference: "current" as const },
  { ...authoring, id: `${authoring.authoringCase}-historical` as const, peerReference: "historical" as const },
]);

export function artifactPathsFor(fixture: CaptureFixture) {
  const directory = join(REPORT_HTML_PEER_OUTPUT_DIRECTORY, fixture.id);
  return {
    desktopPage2: join(directory, "desktop-page-2.png"),
    desktopPage25: join(directory, "desktop-page-25.png"),
    mobilePage2: join(directory, "mobile-page-2.png"),
    mobilePage25: join(directory, "mobile-page-25.png"),
    pdf: join(directory, "full-report.pdf"),
  };
}

async function productionReportCss(): Promise<string> {
  const stylesRoot = join(appRoot, "src", "styles");
  const [brand, report] = await Promise.all([
    readFile(join(stylesRoot, "su-public-brand.css"), "utf8"),
    readFile(join(stylesRoot, "su-report.css"), "utf8"),
  ]);
  return `${brand.replace(/@import[^;]+;\s*/g, "")}\n${report}`;
}

function currentReport() {
  const report = completeSuFullLandscapeReport();
  return {
    ...report,
    result: {
      ...report.result,
      peerBenchmarkSnapshot: {
        sourceId: SU_FULL_PHASE_PEER_SOURCE_ID,
        contentHash: SU_FULL_PHASE_PEER_CONTENT_HASHES[4],
        phase: 4 as const,
      },
      perQuestion: report.result.perQuestion.map((question) => ({
        ...question,
        peerValue: getGovernedPeerValue(question.stableKey, 4) ?? undefined,
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
        const withoutPeerValue = { ...question };
        delete withoutPeerValue.peerValue;
        return withoutPeerValue;
      }),
    },
  };
}

export function renderCaptureMarkup(fixture: CaptureFixture): string {
  const prepared = prepareReportHtmlForStorage({
    reportHtml: {
      schemaVersion: 1,
      introductionHtml: fixture.introductionHtml,
      conclusionHtml: fixture.conclusionHtml,
    },
  });
  if (!prepared.ok) throw new Error(`Fixture ${fixture.id} violates report HTML storage limits`);

  const sourceReport = fixture.peerReference === "current" ? currentReport() : historicalReport();
  const report = {
    ...sourceReport,
    reportHtml: loadSafeReportHtml(prepared.reportConfig),
  };
  const presentation = completeSuFullLandscapePresentation(report);
  report.suFullPeerPresentation = presentation;

  const previousEnabled = process.env[SU_FULL_LANDSCAPE_ENABLED_ENV];
  const previousKill = process.env[SU_FULL_LANDSCAPE_KILL_ENV];
  process.env[SU_FULL_LANDSCAPE_ENABLED_ENV] = "1";
  delete process.env[SU_FULL_LANDSCAPE_KILL_ENV];
  try {
    return renderToStaticMarkup(
      <main className="su-public-brand su-report" data-testid="route-wrapper">
        <ReportStyleScope report={report} reportStylesAvailable>
          <div className="su-report-page">
            <BrandedReport
              report={{ ...report, coachName: "Coach Example" }}
              reportStylesAvailable
              reportFindingsAvailable
              contactEmail="coach@example.com"
            />
          </div>
        </ReportStyleScope>
      </main>,
    );
  } finally {
    if (previousEnabled === undefined) delete process.env[SU_FULL_LANDSCAPE_ENABLED_ENV];
    else process.env[SU_FULL_LANDSCAPE_ENABLED_ENV] = previousEnabled;
    if (previousKill === undefined) delete process.env[SU_FULL_LANDSCAPE_KILL_ENV];
    else process.env[SU_FULL_LANDSCAPE_KILL_ENV] = previousKill;
  }
}

async function captureFixture(
  fixture: CaptureFixture,
  css: string,
  browser: Awaited<ReturnType<typeof chromium.launch>>,
): Promise<void> {
  const artifacts = artifactPathsFor(fixture);
  await mkdir(join(REPORT_HTML_PEER_OUTPUT_DIRECTORY, fixture.id), { recursive: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  try {
    await page.setContent(
      `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0}${css}</style></head><body>${renderCaptureMarkup(fixture)}</body></html>`,
      { waitUntil: "load" },
    );
    await page.evaluate(() => document.fonts.ready);
    await page.locator("[data-page-number='2']").screenshot({ path: artifacts.desktopPage2, animations: "disabled" });
    await page.locator("[data-page-number='25']").screenshot({ path: artifacts.desktopPage25, animations: "disabled" });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator("[data-page-number='2']").screenshot({ path: artifacts.mobilePage2, animations: "disabled" });
    await page.locator("[data-page-number='25']").screenshot({ path: artifacts.mobilePage25, animations: "disabled" });

    await page.setViewportSize({ width: 1280, height: 720 });
    await page.emulateMedia({ media: "print" });
    await page.pdf({
      path: artifacts.pdf,
      format: "A4",
      landscape: true,
      preferCSSPageSize: true,
      printBackground: true,
      displayHeaderFooter: false,
    });
  } finally {
    await page.close();
  }
}

export async function captureReportHtmlPeersPreviews(): Promise<void> {
  await rm(REPORT_HTML_PEER_OUTPUT_DIRECTORY, { recursive: true, force: true });
  await mkdir(REPORT_HTML_PEER_OUTPUT_DIRECTORY, { recursive: true });
  const [css, browser] = await Promise.all([
    productionReportCss(),
    chromium.launch({ headless: true }),
  ]);
  try {
    for (const fixture of REPORT_HTML_PEER_FIXTURES) {
      await captureFixture(fixture, css, browser);
    }
  } finally {
    await browser.close();
  }
}

if (require.main === module) {
  captureReportHtmlPeersPreviews().catch((error: unknown) => {
    console.error("Report HTML Peers visual capture failed:", error);
    process.exitCode = 1;
  });
}
