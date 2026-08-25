/** @jest-environment node */

import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { chromium, type Browser, type Page } from "playwright";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { REPORT_HTML_PEER_FIXTURES } from "../../../../scripts/capture-report-html-peers-previews";
import { BrandedReport } from "@/components/assessments/BrandedReport";
import { ReportStyleScope } from "@/components/assessments/ReportStyleScope";
import {
  completeSuFullLandscapePresentation,
  completeSuFullLandscapeReport,
  restoredScalingUpFullCtaReport,
} from "@/__tests__/fixtures/su-full-landscape";
import {
  SU_FULL_PHASE_PEER_CONTENT_HASHES,
  SU_FULL_PHASE_PEER_SOURCE_ID,
  getGovernedPeerValue,
} from "@/lib/assessments/su-full-phase-peer-catalogue";
import {
  SU_FULL_GOVERNED_PEER_DISCLOSURE,
  SU_FULL_LEGACY_PEER_DISCLOSURE,
} from "@/lib/assessments/su-full-peer-disclosure";
import type { GrowthPhaseNumber } from "@/lib/assessments/su-full-phase";
import { prepareReportHtmlForStorage } from "@/lib/assessments/report-html";

jest.setTimeout(60_000);

const ENABLED = "NEXT_PUBLIC_WAVE_SU_FULL_LANDSCAPE_REPORT_ENABLED";
const KILL = "NEXT_PUBLIC_WAVE_SU_FULL_LANDSCAPE_REPORT_KILL";
const OPENER_PAGES = [5, 9, 12, 17, 19] as const;
const CHART_PAGES = [...OPENER_PAGES, 24] as const;
const PEER_DISCLOSURE = "Peers shows the benchmark associated with your organizational phase when you completed this assessment. It is not matched by industry, geography, or a custom peer group.";
const HISTORICAL_PEER_DISCLOSURE = "Peers shows the historical benchmark used for this report. It is not matched by industry, geography, or a custom peer group.";
const LEGACY_FALSE_FREEZE_CLAIM = /frozen governed snapshot|peer values[^.]{0,120}frozen (?:when|at) (?:this result was )?scored/i;
const ENGINEERING_LANGUAGE = /governed|snapshot|sourceId|source id|catalogue|provenance|legacy baseline|phase-aware|esperto-five-phase-peers|esperto-controlled/i;
const REPRESENTATIVE_482_CHARACTER_FEEDBACK = "In order to scale, smart application and linking of information technology is essential. Sales, marketing, project management, production,humanresources,reporting,etc.Thisgivesstructureand clarity, prevents mistakes and makes growing a lot easier. With the size of your company, a lot of systems likely still work independently of each other, or you primarily use Excel. This is customary, but in your next growth phase you will have to start thinking about smart solutions. Act now";

const SEMANTIC_ESCAPE_CASES = [
  {
    id: "exact-limit-pre",
    introductionHtml: `<pre>${"x".repeat(2_200)}</pre>`,
    conclusionHtml: null,
    rejectedIssue: /preformatted/i,
  },
  {
    id: "maximum-line-breaks",
    introductionHtml: "<br>".repeat(64),
    conclusionHtml: null,
    rejectedIssue: /line break/i,
  },
  {
    id: "maximum-headings",
    introductionHtml: null,
    conclusionHtml: Array.from({ length: 36 }, () => "<h1>x</h1>").join(""),
    rejectedIssue: /heading/i,
  },
  {
    id: "maximum-welcome-figcaptions",
    introductionHtml: "<figcaption>x</figcaption>".repeat(64),
    conclusionHtml: null,
    rejectedIssue: /figure caption/i,
  },
  {
    id: "maximum-closing-figcaptions",
    introductionHtml: null,
    conclusionHtml: "<figcaption>x</figcaption>".repeat(36),
    rejectedIssue: /figure caption/i,
  },
  {
    id: "maximum-table-cells",
    introductionHtml: `<table><tbody>${Array.from({ length: 8 }, (_, rowIndex) => `<tr>${"<td>x</td>".repeat(rowIndex === 0 ? 47 : 1)}</tr>`).join("")}</tbody></table>`,
    conclusionHtml: null,
    rejectedIssue: /table (?:column|cell)/i,
  },
  {
    id: "maximum-table-captions",
    introductionHtml: `<table>${"<caption>x</caption>".repeat(63)}</table>`,
    conclusionHtml: null,
    rejectedIssue: /table caption/i,
  },
  {
    id: "direct-table-td-children",
    introductionHtml: `<table>${"<td>x</td>".repeat(24)}</table>`,
    conclusionHtml: null,
    rejectedIssue: /valid table structure/i,
  },
  {
    id: "direct-table-th-children",
    introductionHtml: `<table>${"<th>x</th>".repeat(24)}</table>`,
    conclusionHtml: null,
    rejectedIssue: /valid table structure/i,
  },
] as const;

type SemanticAuditPosition = "introduction" | "conclusion";

const TALL_PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAA+gCAIAAAC0f+F8AAAALUlEQVR42u3DAQ0AAAgDoM8uFrKSxQ0ibGR6K4mqqqqqqqqqqqqqqqqqqqq/H9OeIDkSuu58AAAAAElFTkSuQmCC";
const SEMANTIC_AUDIT_LIMITS = {
  introduction: { elements: 64, text: 2_200, rows: 8, columns: 4, cells: 24, headings: 4, breaks: 8, lines: 32 },
  conclusion: { elements: 36, text: 900, rows: 6, columns: 3, cells: 12, headings: 2, breaks: 4, lines: 16 },
} as const;

function auditTextChunks(
  position: SemanticAuditPosition,
  count: number,
  totalText = SEMANTIC_AUDIT_LIMITS[position].text,
): string[] {
  const text = "x".repeat(totalText);
  return Array.from({ length: count }, (_, index) => {
    const start = Math.floor(index * text.length / count);
    const end = Math.floor((index + 1) * text.length / count);
    return text.slice(start, end);
  });
}

function repeatedInlineAuditTag(tag: string, position: SemanticAuditPosition): string {
  return auditTextChunks(position, SEMANTIC_AUDIT_LIMITS[position].elements)
    .map((text) => `<${tag}>${text}</${tag}>`)
    .join("");
}

function weightedAuditTag(tag: string, weight: number, position: SemanticAuditPosition): string {
  const { elements, lines } = SEMANTIC_AUDIT_LIMITS[position];
  const count = Math.min(elements, Math.floor(lines / (weight + 1)));
  const textLines = lines - count * weight;
  return auditTextChunks(position, count, textLines * 100)
    .map((text) => `<${tag}>${text}</${tag}>`)
    .join("");
}

function headingAuditHtml(tag: string, weight: number, position: SemanticAuditPosition): string {
  const { headings } = SEMANTIC_AUDIT_LIMITS[position];
  const textCharacters = position === "introduction"
    ? (weight === 5 ? 400 : weight === 4 ? 500 : 650)
    : (weight === 5 ? 200 : weight === 4 ? 250 : 300);
  return auditTextChunks(position, headings, textCharacters)
    .map((text) => `<${tag}>${text}</${tag}>`)
    .join("");
}

function listAuditHtml(tag: "ul" | "ol", position: SemanticAuditPosition): string {
  const { lines } = SEMANTIC_AUDIT_LIMITS[position];
  const items = Math.floor((lines - 1) / 2);
  const textLines = lines - 1 - items;
  return `<${tag}>${auditTextChunks(position, items, textLines * 100)
    .map((text) => `<li>${text}</li>`)
    .join("")}</${tag}>`;
}

function descriptionListAuditHtml(position: SemanticAuditPosition): string {
  const { lines } = SEMANTIC_AUDIT_LIMITS[position];
  const items = Math.floor((lines - 1) / 2);
  const textLines = lines - 1 - items;
  return `<dl>${auditTextChunks(position, items, textLines * 100)
    .map((text, index) => index % 2 === 0 ? `<dt>${text}</dt>` : `<dd>${text}</dd>`)
    .join("")}</dl>`;
}

function figureCaptionAuditHtml(position: SemanticAuditPosition): string {
  const textLength = position === "introduction" ? 1_100 : 500;
  return `<figcaption>${"x".repeat(textLength)}</figcaption>`;
}

function figureImageAuditHtml(position: SemanticAuditPosition): string {
  const textLength = position === "introduction" ? 700 : 150;
  return `<figure><img src="${TALL_PNG}" alt="Tall image"><figcaption>${"x".repeat(textLength)}</figcaption></figure>`;
}

function imageAuditHtml(position: SemanticAuditPosition): string {
  return `<img src="${TALL_PNG}" alt="Tall image">${"x".repeat(SEMANTIC_AUDIT_LIMITS[position].text)}`;
}

function tableAuditHtml(position: SemanticAuditPosition): string {
  const limits = SEMANTIC_AUDIT_LIMITS[position];
  const rowColumns = position === "introduction" ? 3 : 2;
  const cellTextLength = position === "introduction" ? 300 : 40;
  const chunks = auditTextChunks(position, limits.cells, cellTextLength);
  let cellIndex = 0;
  const rows = Array.from({ length: limits.rows }, (_, rowIndex) => {
    const tag = rowIndex === 0 ? "th" : "td";
    return `<tr>${Array.from({ length: rowColumns }, () => `<${tag}>${chunks[cellIndex++] ?? ""}</${tag}>`).join("")}</tr>`;
  });
  const head = rows.shift() ?? "";
  const foot = rows.pop() ?? "";
  const caption = position === "introduction" ? "<caption>Cap</caption>" : "";
  return `<table>${caption}<colgroup>${"<col>".repeat(limits.columns)}</colgroup><thead>${head}</thead><tbody>${rows.join("")}</tbody><tfoot>${foot}</tfoot></table>`;
}

function tableCaptionAuditHtml(): string {
  const text = "C".repeat(60);
  return `<table><caption>${text}</caption><tbody><tr><td>x</td></tr></tbody></table>`;
}

const SAFE_INLINE_TAGS = ["span", "code", "strong", "em", "b", "i", "u", "s", "small", "sup", "sub", "a"] as const;
const POSITIVE_LAYOUT_TAGS = [
  "section", "article", "header", "main", "aside", "div", "p", "br", "hr", "h1", "h2", "h3", "h4", "h5", "h6",
  "ul", "ol", "li", "dl", "dt", "dd", "blockquote", "figure", "figcaption", "table", "caption", "thead", "tbody",
  "tfoot", "tr", "th", "td", "colgroup", "col", "img",
] as const;

const SEMANTIC_ACCEPTED_CAP_CASES = [
  ...SAFE_INLINE_TAGS.map((tag) => ({ id: `inline-${tag}`, tags: [tag], html: (position: SemanticAuditPosition) => repeatedInlineAuditTag(tag, position) })),
  ...[
    ["section", 1], ["article", 1], ["header", 1], ["main", 1], ["aside", 1], ["div", 1], ["p", 2], ["blockquote", 3], ["figure", 3],
  ].map(([tag, weight]) => ({ id: `weighted-${tag}`, tags: [tag as string], html: (position: SemanticAuditPosition) => weightedAuditTag(tag as string, weight as number, position) })),
  { id: "break-cap", tags: ["br"], html: (position: SemanticAuditPosition) => `${"x".repeat(SEMANTIC_AUDIT_LIMITS[position].text)}${"<br>".repeat(SEMANTIC_AUDIT_LIMITS[position].breaks)}` },
  { id: "rule-budget", tags: ["hr"], html: (position: SemanticAuditPosition) => "<hr>".repeat(SEMANTIC_AUDIT_LIMITS[position].lines / 2) },
  ...[["h1", 5], ["h2", 4], ["h3", 3], ["h4", 3], ["h5", 3], ["h6", 3]]
    .map(([tag, weight]) => ({ id: `heading-${tag}`, tags: [tag as string], html: (position: SemanticAuditPosition) => headingAuditHtml(tag as string, weight as number, position) })),
  { id: "unordered-list", tags: ["ul", "li"], html: (position: SemanticAuditPosition) => listAuditHtml("ul", position) },
  { id: "ordered-list", tags: ["ol", "li"], html: (position: SemanticAuditPosition) => listAuditHtml("ol", position) },
  { id: "description-list", tags: ["dl", "dt", "dd"], html: descriptionListAuditHtml },
  { id: "figure-caption-cap", tags: ["figcaption"], html: figureCaptionAuditHtml },
  { id: "figure-image-nesting", tags: ["figure", "figcaption", "img"], html: figureImageAuditHtml },
  { id: "image-text-cap", tags: ["img"], html: imageAuditHtml },
  { id: "table-maxima", tags: ["table", "caption", "colgroup", "col", "thead", "tbody", "tfoot", "tr", "th", "td"], html: tableAuditHtml },
  { id: "table-caption", tags: ["caption"], html: tableCaptionAuditHtml },
] as const;

const SEMANTIC_REJECTED_CASES = [
  { id: "maximum-line-breaks", position: "introduction", html: "<br>".repeat(64), issue: /line break/i },
  { id: "maximum-headings", position: "conclusion", html: "<h1>x</h1>".repeat(36), issue: /heading/i },
  { id: "maximum-welcome-figcaptions", position: "introduction", html: "<figcaption>x</figcaption>".repeat(64), issue: /figure caption/i },
  { id: "maximum-closing-figcaptions", position: "conclusion", html: "<figcaption>x</figcaption>".repeat(36), issue: /figure caption/i },
  { id: "maximum-table-cells", position: "introduction", html: `<table><tbody>${Array.from({ length: 8 }, (_, rowIndex) => `<tr>${"<td>x</td>".repeat(rowIndex === 0 ? 47 : 1)}</tr>`).join("")}</tbody></table>`, issue: /table columns/i },
  { id: "maximum-table-captions", position: "introduction", html: `<table>${"<caption>x</caption>".repeat(63)}</table>`, issue: /table caption/i },
  { id: "closing-caption-with-max-rows", position: "conclusion", html: `<table><caption>Cap</caption><tbody>${"<tr><td>x</td><td>x</td></tr>".repeat(6)}</tbody></table>`, issue: /estimated lines/i },
  { id: "table-direct-td", position: "introduction", html: `<table>${"<td>x</td>".repeat(24)}</table>`, issue: /valid table structure/i },
  { id: "table-direct-th", position: "introduction", html: `<table>${"<th>x</th>".repeat(24)}</table>`, issue: /valid table structure/i },
  { id: "thead-without-tr", position: "introduction", html: "<table><thead><th>x</th></thead></table>", issue: /valid table structure/i },
  { id: "tbody-without-tr", position: "introduction", html: "<table><tbody><td>x</td></tbody></table>", issue: /valid table structure/i },
  { id: "tfoot-without-tr", position: "introduction", html: "<table><tfoot><td>x</td></tfoot></table>", issue: /valid table structure/i },
  { id: "table-div-cells", position: "introduction", html: "<table><div><td>x</td><th>y</th></div></table>", issue: /valid table structure/i },
  { id: "direct-col", position: "introduction", html: "<table><col><tr><td>x</td></tr></table>", issue: /valid table structure/i },
  { id: "mixed-explicit-implicit-cells", position: "introduction", html: "<table><tr><td>x</td></tr><td>y</td></table>", issue: /valid table structure/i },
  { id: "case-attribute-comment-direct-cell", position: "introduction", html: '<TABLE summary="Summary"><!-- comment --><TD title="Cell">x</TD></TABLE>', issue: /valid table structure/i },
  { id: "self-closing-direct-cell", position: "introduction", html: "<table><td/>x</table>", issue: /valid table structure/i },
  { id: "caption-outside-table", position: "introduction", html: "<caption>x</caption><table><tr><td>y</td></tr></table>", issue: /valid table structure/i },
  { id: "tr-outside-table", position: "introduction", html: "<tr><td>x</td></tr><table><tr><td>y</td></tr></table>", issue: /valid table structure/i },
  { id: "row-group-outside-table", position: "introduction", html: "<tbody><tr><td>x</td></tr></tbody>", issue: /valid table structure/i },
  { id: "colgroup-outside-table", position: "introduction", html: "<colgroup><col></colgroup>", issue: /valid table structure/i },
  { id: "direct-table-div", position: "introduction", html: "<table><div>x</div></table>", issue: /valid table structure/i },
  { id: "direct-table-text", position: "introduction", html: "<table>x<tr><td>y</td></tr></table>", issue: /valid table structure/i },
  { id: "late-caption", position: "introduction", html: "<table><tbody><tr><td>x</td></tr></tbody><caption>Late</caption></table>", issue: /valid table structure/i },
  { id: "late-colgroup", position: "introduction", html: "<table><tbody><tr><td>x</td></tr></tbody><colgroup><col></colgroup></table>", issue: /valid table structure/i },
  { id: "duplicate-thead", position: "introduction", html: "<table><thead><tr><th>x</th></tr></thead><thead><tr><th>y</th></tr></thead></table>", issue: /valid table structure/i },
  { id: "duplicate-tfoot", position: "introduction", html: "<table><tfoot><tr><td>x</td></tr></tfoot><tfoot><tr><td>y</td></tr></tfoot></table>", issue: /valid table structure/i },
  { id: "mixed-direct-group-rows", position: "introduction", html: "<table><tr><td>x</td></tr><tbody><tr><td>y</td></tr></tbody></table>", issue: /valid table structure/i },
  { id: "nested-table", position: "introduction", html: "<table><tr><td><table><tr><td>x</td></tr></table></td></tr></table>", issue: /valid table structure/i },
  ...(["introduction", "conclusion"] as const).flatMap((position) => [
    { id: `over-figure-caption-cap-${position}`, position, html: "<figcaption>One</figcaption><figcaption>Two</figcaption>", issue: /figure caption/i },
    { id: `over-table-caption-cap-${position}`, position, html: "<table><caption>One</caption><caption>Two</caption></table>", issue: /table caption/i },
    { id: `over-table-columns-${position}`, position, html: `<table><tbody><tr>${"<td>x</td>".repeat(SEMANTIC_AUDIT_LIMITS[position].columns + 1)}</tr></tbody></table>`, issue: /table columns/i },
  ]),
] as const;

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

async function authoredContentOutsidePhysicalPage(page: Page) {
  return page.locator("[data-testid^='report-html-']").evaluateAll((sections) => sections.flatMap((section) => {
    const physicalPage = section.closest<HTMLElement>("[data-page-number]");
    if (!physicalPage) throw new Error("Authored report content is missing its physical page");
    const pageRect = physicalPage.getBoundingClientRect();
    return [section, ...section.querySelectorAll<HTMLElement>("*")].flatMap((element) => {
      const rect = element.getBoundingClientRect();
      const outside = rect.left < pageRect.left - 1
        || rect.right > pageRect.right + 1
        || rect.top < pageRect.top - 1
        || rect.bottom > pageRect.bottom + 1;
      return outside ? [{
        page: physicalPage.dataset.pageNumber,
        tag: element.tagName,
        className: element.className,
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
      }] : [];
    });
  }));
}

async function authoredClipping(page: Page) {
  return page.locator("[data-testid^='report-html-']").evaluateAll((sections) => sections.flatMap((section) =>
    [section, ...section.querySelectorAll<HTMLElement>("*")].flatMap((element) => {
      const style = getComputedStyle(element);
      const clipsWidth = element.scrollWidth > element.clientWidth + 1
        && style.overflowX !== "visible";
      const clipsHeight = element.scrollHeight > element.clientHeight + 1
        && style.overflowY !== "visible";
      return clipsWidth || clipsHeight ? [{
        tag: element.tagName,
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
        clientHeight: element.clientHeight,
        scrollHeight: element.scrollHeight,
        overflowX: style.overflowX,
        overflowY: style.overflowY,
      }] : [];
    }),
  ));
}

function reportWithAuthoringCase(
  fixture: (typeof REPORT_HTML_PEER_FIXTURES)[number],
) {
  const prepared = prepareReportHtmlForStorage({
    reportHtml: {
      schemaVersion: 1,
      introductionHtml: fixture.introductionHtml,
      conclusionHtml: fixture.conclusionHtml,
    },
  });
  if (!prepared.ok) {
    throw new Error(`${fixture.id} fixture must remain within the stored authoring limits`);
  }
  const report = fixture.peerReference === "current" ? reportForPhase(4) : historicalReport();
  return {
    ...report,
    reportHtml: (prepared.reportConfig as { reportHtml: typeof report.reportHtml }).reportHtml,
  };
}

function prepareSemanticEscapeReport(
  fixture: (typeof SEMANTIC_ESCAPE_CASES)[number],
  peerReference: "current" | "historical",
) {
  const prepared = prepareReportHtmlForStorage({
    reportHtml: {
      schemaVersion: 1,
      introductionHtml: fixture.introductionHtml,
      conclusionHtml: fixture.conclusionHtml,
    },
  });
  if (!prepared.ok) return prepared;
  const report = peerReference === "current" ? reportForPhase(4) : historicalReport();
  return {
    ...report,
    reportHtml: (prepared.reportConfig as { reportHtml: typeof report.reportHtml }).reportHtml,
  };
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
    { page: "5", charts: [chapters[0]] },
    { page: "9", charts: [chapters[1]] },
    { page: "12", charts: [chapters[2]] },
    { page: "17", charts: [chapters[3]] },
    { page: "19", charts: [chapters[4]] },
    { page: "24", charts: chapters },
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

  it("restores the approved Scaling Up Full CTA hierarchy and button treatment", async () => {
    const { html } = routeMarkup(restoredScalingUpFullCtaReport());
    const page = await browser.newPage({ viewport: { width: 1123, height: 794 } });
    try {
      await load(page, html);
      await page.emulateMedia({ media: "print" });
      const cta = page.locator('[aria-label="Scaling Up Full next steps"]');
      const layout = await cta.evaluate((element) => {
        const paragraph = element.querySelector("p");
        const image = element.querySelector("img");
        const followup = element.querySelectorAll("p")[1];
        const actions = element.querySelectorAll("a");
        if (!paragraph || !image || !followup || actions.length !== 2) {
          throw new Error("Incomplete Scaling Up Full CTA fixture");
        }
        const rect = (value: Element) => value.getBoundingClientRect();
        const sectionRect = rect(element);
        return {
          order: [rect(paragraph).bottom, rect(image).top, rect(image).bottom, rect(followup).top, rect(followup).bottom, rect(actions[0]).top, rect(actions[0]).bottom, rect(actions[1]).top],
          imageWidth: rect(image).width,
          imageCenterError: Math.abs((rect(image).left + rect(image).right) / 2 - (sectionRect.left + sectionRect.right) / 2),
          buttons: [...actions].map((action) => {
            const style = getComputedStyle(action);
            const actionRect = rect(action);
            return {
              background: style.backgroundColor,
              color: style.color,
              display: style.display,
              href: action.getAttribute("href"),
              minHeight: Number.parseFloat(style.minHeight),
              centerError: Math.abs((actionRect.left + actionRect.right) / 2 - (sectionRect.left + sectionRect.right) / 2),
            };
          }),
        };
      });

      expect(layout.order.every((value, index, values) => index === 0 || value >= values[index - 1])).toBe(true);
      expect(layout.imageWidth).toBeGreaterThanOrEqual(300);
      expect(layout.imageCenterError).toBeLessThanOrEqual(1);
      expect(layout.buttons).toHaveLength(2);
      expect(layout.buttons.map((button) => button.href)).toEqual([
        "https://coaches.scalingup.com/coach-match-after-assessment-form",
        "https://scalingup.com/book/",
      ]);
      expect(layout.buttons.every((button) =>
        button.background === "rgb(247, 166, 0)"
        && button.color === "rgb(255, 255, 255)"
        && button.display === "flex"
        && button.minHeight === 44
        && button.centerError <= 1
      )).toBe(true);
      expect(await authoredContentOutsidePhysicalPage(page)).toEqual([]);
    } finally {
      await page.close();
    }
  });

  it("renders the recovered Classic cover with legible reversed brand typography", async () => {
    const { html } = routeMarkup(restoredScalingUpFullCtaReport());
    const page = await browser.newPage({ viewport: { width: 1123, height: 794 } });
    try {
      await load(page, html);
      await page.emulateMedia({ media: "print" });
      const cover = page.locator('[data-page-number="1"]');
      const result = await cover.evaluate((element) => {
        const title = element.querySelector("h1");
        const logo = element.querySelector<HTMLImageElement>('img[alt="Scaling Up"]');
        if (!title || !logo) throw new Error("Incomplete recovered cover");
        return {
          background: getComputedStyle(element).backgroundColor,
          titleColor: getComputedStyle(title).color,
          titleSize: Number.parseFloat(getComputedStyle(title).fontSize),
          logoWidth: logo.getBoundingClientRect().width,
        };
      });

      expect(result).toEqual({
        background: "rgb(82, 37, 131)",
        titleColor: "rgb(255, 255, 255)",
        titleSize: 52,
        logoWidth: 180,
      });
    } finally {
      await page.close();
    }
  });

  it("restores the source Verne Harnish preface composition", async () => {
    const { html } = routeMarkup(restoredScalingUpFullCtaReport());
    const page = await browser.newPage({ viewport: { width: 1123, height: 794 } });
    try {
      await load(page, html);
      await page.emulateMedia({ media: "print" });
      const layout = await page.locator('[aria-label="Verne Harnish preface"]').evaluate((element) => {
        const copy = element.querySelector("p");
        const image = element.querySelector("img");
        const signature = element.querySelector<HTMLElement>('[aria-label="Verne Harnish signature"]');
        const attribution = element.querySelector("aside");
        if (!copy || !image || !signature || !attribution) throw new Error("Incomplete preface fixture");
        const copyRect = copy.getBoundingClientRect();
        const imageRect = image.getBoundingClientRect();
        const signatureRect = signature.getBoundingClientRect();
        const attributionRect = attribution.getBoundingClientRect();
        return {
          copyBeforePortrait: copyRect.right < imageRect.left,
          portraitWidth: imageRect.width,
          attributionBelowPortrait: attributionRect.top >= imageRect.bottom,
          signatureBelowCopy: signatureRect.top >= copyRect.bottom,
          signatureWidth: signatureRect.width,
          signatureBackground: getComputedStyle(signature).backgroundImage,
        };
      });

      expect(layout).toMatchObject({
        copyBeforePortrait: true,
        attributionBelowPortrait: true,
        signatureBelowCopy: true,
      });
      expect(layout.portraitWidth).toBeGreaterThanOrEqual(180);
      expect(layout.signatureWidth).toBeGreaterThanOrEqual(180);
      expect(layout.signatureBackground).toContain("verne-harnish-signature.png");
      expect(await authoredContentOutsidePhysicalPage(page)).toEqual([]);
    } finally {
      await page.close();
    }
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
      const appendixCharts = await geometry(page, 24);
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
      await expect(page.locator("[data-page-number='5'] .su-full-landscape-chart-legend").isVisible())
        .resolves.toBe(true);
      expectLabelsToFit(await labelFit(page, CHART_PAGES));
    } finally {
      await page.close();
    }
  });

  it("keeps P3, P4, P5, and historical peer provenance, values, layout, and PDF pages stable while corrupt peers stay omitted", async () => {
    const cases = [
      { name: "p3", report: reportForPhase(3), provenance: "Phase 3 · Management", disclosure: PEER_DISCLOSURE, q01: "6.3" },
      { name: "p4", report: reportForPhase(4), provenance: "Phase 4 · Delegation", disclosure: PEER_DISCLOSURE, q01: "6.6" },
      { name: "p5", report: reportForPhase(5), provenance: "Phase 5 · Standardization", disclosure: PEER_DISCLOSURE, q01: "6.3" },
      { name: "historical", report: historicalReport(), provenance: "Historical benchmark", disclosure: HISTORICAL_PEER_DISCLOSURE, q01: "6.3" },
    ] as const;
    const directory = mkdtempSync(join(tmpdir(), "su-full-phase-peer-browser-"));

    try {
      for (const fixture of cases) {
        const { html } = routeMarkup(fixture.report);
        const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
        try {
          await load(page, html);
          await expect(page.locator("[data-testid^='su-full-landscape-page-']").count()).resolves.toBe(24);
          await expect(page.getByText(fixture.disclosure).count()).resolves.toBeGreaterThanOrEqual(2);
          await expect(page.locator("body").innerText()).resolves.not.toMatch(ENGINEERING_LANGUAGE);
          if (fixture.name === "historical") {
            await expect(page.getByText(PEER_DISCLOSURE).count()).resolves.toBe(0);
            await expect(page.getByText(/selected by organizational phase|frozen when this result was scored/i).count()).resolves.toBe(0);
            await expect(page.locator("body").innerText()).resolves.not.toMatch(LEGACY_FALSE_FREEZE_CLAIM);
          }
          await expect(page.locator("[data-page-number='6']").innerText()).resolves.toContain(fixture.provenance);
          await expect(q01PeerValue(page)).resolves.toBe(fixture.q01);
          const desktop = await horizontalOverflow(page);
          expect(desktop.offenders).toEqual([]);
          expect(desktop.document).toBeLessThanOrEqual(desktop.viewport + 1);
          await saveVisualArtifact(page, `${fixture.name}-desktop-page-5`, "[data-page-number='5']");
          await saveVisualArtifact(page, `${fixture.name}-desktop-page-6`, "[data-page-number='6']");

          await page.setViewportSize({ width: 390, height: 844 });
          const mobile = await horizontalOverflow(page);
          expect(mobile.offenders).toEqual([]);
          expect(mobile.document).toBeLessThanOrEqual(mobile.viewport + 1);
          const mobileDetailColumns = await page.locator("[data-page-number='6'] .su-full-landscape-page-body")
            .evaluate((body) => getComputedStyle(body).gridTemplateColumns.split(" ").filter(Boolean).length);
          expect(mobileDetailColumns).toBe(1);
          await expect(q01PeerValue(page)).resolves.toBe(fixture.q01);
          await saveVisualArtifact(page, `${fixture.name}-mobile-page-6`, "[data-page-number='6']");

          await page.setViewportSize({ width: 1280, height: 720 });
          await page.emulateMedia({ media: "print" });
          await expect(q01PeerValue(page)).resolves.toBe(fixture.q01);
          const printDetail = await page.locator("[data-page-number='6']").evaluate((detail) => {
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
          await saveVisualArtifact(page, `${fixture.name}-print-page-6`, "[data-page-number='6']");

          const pdfPath = join(directory, `${fixture.name}.pdf`);
          await page.pdf({
            path: pdfPath,
            format: "A4",
            landscape: true,
            preferCSSPageSize: true,
            printBackground: true,
          });
          expect(execFileSync("pdfinfo", [pdfPath], { encoding: "utf8" })).toMatch(/^Pages:\s+24$/m);
          const pdfText = normalize(execFileSync("pdftotext", [pdfPath, "-"], { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 }));
          expect(pdfText).toContain(fixture.provenance);
          expect(pdfText).toContain(fixture.disclosure);
          expect(pdfText).not.toMatch(ENGINEERING_LANGUAGE);
          if (fixture.name === "historical") {
            expect(pdfText).not.toContain(PEER_DISCLOSURE);
            expect(pdfText).not.toMatch(LEGACY_FALSE_FREEZE_CLAIM);
          }
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
        await expect(corruptPage.getByText(/Phase [1-5] ·|Historical benchmark/).count()).resolves.toBe(0);
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

  it("meets all five chapter contrast contracts and produces a complete 24-page A4 landscape PDF", async () => {
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
        [6, 10, 13, 18, 20].map((number) => `[data-page-number="${number}"] .su-full-landscape-detail`).join(","),
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
            peers: ratio(getComputedStyle(peers).borderColor, trackColor),
            value: ratio(getComputedStyle(value).color, "rgb(255, 255, 255)"),
          };
        });
      });
      expect(barContrast).toHaveLength(27);
      expect(barContrast.every((row) => row.you >= 3 && row.peers >= 3 && row.value >= 4.5)).toBe(true);

      const profileFit = await page.locator("[data-page-number='4']").evaluate((profile) => {
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
          characters: (paragraph.textContent ?? "").length,
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
      expect(info).toMatch(/^Pages:\s+24$/m);
      expect(info).toMatch(/^Page size:\s+841\.9\d* x 594\.9\d* pts \(A4\)$/m);
      const text = normalize(execFileSync("pdftotext", [pdfPath, "-"], { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 }));
      expect(text).toContain("ScaleUp Score: 55 / 100");
      expect(text).not.toContain("Frozen feedback");
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

  it.each(REPORT_HTML_PEER_FIXTURES)("keeps the $authoringCase/$peerReference authored-report matrix inside its sequential physical-page contract", async (fixture) => {
    const provenance = fixture.peerReference === "current" ? "Phase 4 · Delegation" : "Historical benchmark";
    const disclosure = fixture.peerReference === "current"
      ? SU_FULL_GOVERNED_PEER_DISCLOSURE
      : SU_FULL_LEGACY_PEER_DISCLOSURE;
    const report = reportWithAuthoringCase(fixture);
    const expectedPageCount = report.reportHtml?.introductionHtml ? 25 : 24;
    if (fixture.authoringCase === "adversarial") {
      for (const storedHtml of [
        report.reportHtml?.introductionHtml,
        report.reportHtml?.conclusionHtml,
      ]) {
        expect(storedHtml).toBeTruthy();
        expect(storedHtml).not.toMatch(/\s(?:class|id|data-[a-z0-9_-]+|role|aria-[a-z0-9_-]+|style)=/i);
      }
    }
    if (fixture.authoringCase === "table-max") {
      for (const storedHtml of [report.reportHtml?.introductionHtml, report.reportHtml?.conclusionHtml]) {
        expect(storedHtml).toBeTruthy();
        expect(storedHtml).not.toMatch(/(?:colspan|rowspan|<col[^>]+span)/i);
      }
    }
    const { html } = routeMarkup(report);
    const directory = mkdtempSync(join(tmpdir(), "report-html-peers-matrix-"));
    const pdfPath = join(directory, `${fixture.id}.pdf`);
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    try {
      await load(page, html);
      const renderedPages = await page.locator("[data-testid^='su-full-landscape-page-']").all();
      const renderedPageNumbers = await page.locator("[data-page-number]").evaluateAll((pages) =>
        pages.map((renderedPage) => Number((renderedPage as HTMLElement).dataset.pageNumber)),
      );
      expect(renderedPages).toHaveLength(expectedPageCount);
      expect(renderedPageNumbers).toEqual(
        Array.from({ length: expectedPageCount }, (_, index) => index + 1),
      );
      expect(await page.locator(".su-full-landscape-page").count()).toBe(expectedPageCount);
      await expect(page.locator("body").innerText()).resolves.toContain(provenance);
      await expect(page.getByText(disclosure, { exact: true }).count()).resolves.toBeGreaterThanOrEqual(2);
      await expect(page.locator("body").innerText()).resolves.not.toMatch(ENGINEERING_LANGUAGE);

      if (fixture.authoringCase === "adversarial") {
        const authoredLayout = await page.locator("[data-testid^='report-html-']").evaluateAll((sections) =>
          sections.map((section) => {
            const authored = section.firstElementChild as HTMLElement | null;
            if (!authored) throw new Error("Missing adversarial authored element");
            const style = getComputedStyle(authored);
            return {
              selectorAttributes: [...authored.attributes]
                .map((attribute) => attribute.name)
                .filter((name) =>
                  name === "class"
                  || name === "id"
                  || name === "role"
                  || name.startsWith("data-")
                  || name.startsWith("aria-"),
                ),
              whiteSpace: style.whiteSpace,
              fontSize: style.fontSize,
              letterSpacing: style.letterSpacing,
              padding: style.padding,
              margin: style.margin,
            };
          }),
        );
        expect(authoredLayout).toEqual([
          {
            selectorAttributes: [],
            whiteSpace: "normal",
            fontSize: "16px",
            letterSpacing: "normal",
            padding: "0px",
            margin: "0px",
          },
          {
            selectorAttributes: [],
            whiteSpace: "normal",
            fontSize: "16px",
            letterSpacing: "normal",
            padding: "0px",
            margin: "0px",
          },
        ]);
      }

      const desktop = await horizontalOverflow(page);
      expect(desktop.offenders).toEqual([]);
      expect(desktop.document).toBeLessThanOrEqual(desktop.viewport + 1);

      await page.setViewportSize({ width: 390, height: 844 });
      const mobile = await horizontalOverflow(page);
      expect(mobile.offenders).toEqual([]);
      expect(mobile.document).toBeLessThanOrEqual(mobile.viewport + 1);

      await page.setViewportSize({ width: 1280, height: 720 });
      await page.emulateMedia({ media: "print" });
      expect(await authoredContentOutsidePhysicalPage(page)).toEqual([]);
      const conclusionPage = page.locator(`[data-page-number='${expectedPageCount - 1}']`);
      await expect(conclusionPage.innerText()).resolves.toContain("55 / 100");
      await expect(conclusionPage.innerText()).resolves.toContain("You scored highest on");
      await expect(conclusionPage.innerText()).resolves.toContain("and lowest on");

      await page.pdf({
        path: pdfPath,
        format: "A4",
        landscape: true,
        preferCSSPageSize: true,
        printBackground: true,
      });
      const pdfinfo = execFileSync("pdfinfo", [pdfPath], { encoding: "utf8" });
      expect(pdfinfo).toMatch(new RegExp(`^Pages:\\s+${expectedPageCount}$`, "m"));
      const pdfText = normalize(execFileSync("pdftotext", [pdfPath, "-"], { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 }));
      expect(pdfText).toContain(provenance);
      expect(pdfText).toContain(disclosure);
      expect(pdfText).toContain("ScaleUp Score of 55 / 100");
      expect(pdfText).toContain("You scored highest on");
      expect(pdfText).toContain("and lowest on");
      expect(pdfText).not.toMatch(ENGINEERING_LANGUAGE);
    } finally {
      await page.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it.each(SEMANTIC_ESCAPE_CASES.flatMap((fixture) => [
    { ...fixture, peerReference: "current" as const },
    { ...fixture, peerReference: "historical" as const },
  ]))("rejects or physically contains $id/$peerReference semantic-limit content", async (fixture) => {
    const prepared = prepareSemanticEscapeReport(fixture, fixture.peerReference);
    if ("ok" in prepared && prepared.ok === false) {
      expect(prepared.issues.map((issue) => issue.message).join(" ")).toMatch(fixture.rejectedIssue);
      return;
    }

    const { html } = routeMarkup(prepared);
    const expectedPageCount = prepared.reportHtml?.introductionHtml ? 25 : 24;
    const directory = mkdtempSync(join(tmpdir(), "report-html-semantic-escape-"));
    const pdfPath = join(directory, `${fixture.id}-${fixture.peerReference}.pdf`);
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    try {
      await load(page, html);
      const desktop = await horizontalOverflow(page);
      const desktopClipping = await authoredClipping(page);
      await page.setViewportSize({ width: 390, height: 844 });
      const mobile = await horizontalOverflow(page);
      const mobileClipping = await authoredClipping(page);
      await page.setViewportSize({ width: 1280, height: 720 });
      await page.emulateMedia({ media: "print" });
      const outside = await authoredContentOutsidePhysicalPage(page);
      await page.pdf({
        path: pdfPath,
        format: "A4",
        landscape: true,
        preferCSSPageSize: true,
        printBackground: true,
      });
      const pdfinfo = execFileSync("pdfinfo", [pdfPath], { encoding: "utf8" });
      const pages = Number(pdfinfo.match(/^Pages:\s+(\d+)$/m)?.[1]);

      expect({
        desktopDocumentWidth: desktop.document,
        desktopViewportWidth: desktop.viewport,
        desktopOffenders: desktop.offenders,
        desktopClipping,
        mobileDocumentWidth: mobile.document,
        mobileViewportWidth: mobile.viewport,
        mobileOffenders: mobile.offenders,
        mobileClipping,
        authoredOutsidePhysicalPage: {
          count: outside.length,
          first: outside.at(0) ?? null,
          last: outside.at(-1) ?? null,
        },
        physicalPdfPages: pages,
      }).toEqual({
        desktopDocumentWidth: 1280,
        desktopViewportWidth: 1280,
        desktopOffenders: [],
        desktopClipping: [],
        mobileDocumentWidth: 390,
        mobileViewportWidth: 390,
        mobileOffenders: [],
        mobileClipping: [],
        authoredOutsidePhysicalPage: {
          count: 0,
          first: null,
          last: null,
        },
        physicalPdfPages: expectedPageCount,
      });
    } finally {
      await page.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("renders every allowed semantic tag at an accepted boundary without counting rejections as coverage", async () => {
    expect([...new Set(SEMANTIC_ACCEPTED_CAP_CASES.flatMap((fixture) => fixture.tags))].sort())
      .toEqual([...SAFE_INLINE_TAGS, ...POSITIVE_LAYOUT_TAGS].sort());

    const unsafe: unknown[] = [];
    const acceptedSafe: string[] = [];
    const unexpectedlyRejected: Array<{ id: string; issues: string[] }> = [];

    for (const fixture of SEMANTIC_ACCEPTED_CAP_CASES) {
      for (const position of ["introduction", "conclusion"] as const) {
        const id = `${fixture.id}/${position}`;
        const prepared = prepareReportHtmlForStorage({
          reportHtml: {
            schemaVersion: 1,
            introductionHtml: position === "introduction" ? fixture.html(position) : null,
            conclusionHtml: position === "conclusion" ? fixture.html(position) : null,
          },
        });
        if (!prepared.ok) {
          unexpectedlyRejected.push({ id, issues: prepared.issues.map((issue) => issue.message) });
          continue;
        }

        const source = reportForPhase(4);
        const report = {
          ...source,
          reportHtml: (prepared.reportConfig as { reportHtml: typeof source.reportHtml }).reportHtml,
        };
        const { html } = routeMarkup(report);
        const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
        try {
          await load(page, html);
          const desktop = await horizontalOverflow(page);
          const desktopClipping = await authoredClipping(page);
          await page.setViewportSize({ width: 390, height: 844 });
          const mobile = await horizontalOverflow(page);
          const mobileClipping = await authoredClipping(page);
          await page.setViewportSize({ width: 1280, height: 720 });
          await page.emulateMedia({ media: "print" });
          const outside = await authoredContentOutsidePhysicalPage(page);
          const isUnsafe = desktop.document > desktop.viewport + 1
            || desktop.offenders.length > 0
            || mobile.document > mobile.viewport + 1
            || mobile.offenders.length > 0
            || desktopClipping.length > 0
            || mobileClipping.length > 0
            || outside.length > 0;
          if (isUnsafe) {
            unsafe.push({
              id,
              desktop: { document: desktop.document, viewport: desktop.viewport, offenders: desktop.offenders.length },
              mobile: { document: mobile.document, viewport: mobile.viewport, offenders: mobile.offenders.length },
              desktopClipping: desktopClipping.slice(0, 2).map((item) => item.tag),
              mobileClipping: mobileClipping.slice(0, 2).map((item) => item.tag),
              authoredOutsidePhysicalPage: {
                count: outside.length,
                firstTag: outside.at(0)?.tag ?? null,
                lastTag: outside.at(-1)?.tag ?? null,
                lastBottom: outside.at(-1)?.bottom ?? null,
              },
            });
          } else {
            acceptedSafe.push(id);
          }
        } finally {
          await page.close();
        }
      }
    }

    if (unsafe.length > 0 || unexpectedlyRejected.length > 0) {
      throw new Error(JSON.stringify({ unsafe, acceptedSafe, unexpectedlyRejected }, null, 2));
    }
    expect(acceptedSafe).toHaveLength(SEMANTIC_ACCEPTED_CAP_CASES.length * 2);
  });

  it("rejects every former escape and explicit over-cap semantic composition with a plain issue", () => {
    const accepted: string[] = [];
    for (const fixture of SEMANTIC_REJECTED_CASES) {
      const prepared = prepareReportHtmlForStorage({
        reportHtml: {
          schemaVersion: 1,
          introductionHtml: fixture.position === "introduction" ? fixture.html : null,
          conclusionHtml: fixture.position === "conclusion" ? fixture.html : null,
        },
      });
      if (prepared.ok) {
        accepted.push(fixture.id);
        continue;
      }
      expect(prepared.issues.map((issue) => issue.message).join(" ")).toMatch(fixture.issue);
    }
    expect(accepted).toEqual([]);
  });
});
