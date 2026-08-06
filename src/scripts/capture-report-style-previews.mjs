#!/usr/bin/env node

/**
 * Captures the committed, synthetic-only report-style preview manifest.
 *
 * Run against a local application with WAVE_REPORT_STYLES_ENABLED=1. The
 * route remains admin-protected, so this signs in through the normal login
 * form using explicit E2E_ADMIN_EMAIL/E2E_ADMIN_PASSWORD values.
 */
import { execFile, execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { copyFile, mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { promisify } from "node:util";

const appRoot = resolve(import.meta.dirname, "..");
const previewRoot = join(appRoot, "public", "report-style-previews");
const registryPath = join(appRoot, "src", "lib", "assessments", "report-style-registry.ts");
const baseUrl = (process.env.REPORT_STYLE_PREVIEW_BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);
const { loadReportStyleFontSeam } = require("./report-style-font-seam.cjs");
const {
  assertMeaningfulImage,
  assertNoAncestorClipping,
  assertSinglePagePdf,
  assertWebpContainer,
} = require("./report-style-capture-integrity.cjs");

const anatomies = Object.freeze(["scored", "qualitative", "sparse-custom"]);
const pages = Object.freeze(["cover", "summary", "detail"]);
const appearances = Object.freeze([
  { style: "CLASSIC", rendererKey: "classic", width: 794, format: "A4" },
  { style: "EXECUTIVE_BOARDROOM", rendererKey: "executive-boardroom", width: 816, format: "Letter" },
  { style: "MODERN_DASHBOARD", rendererKey: "modern-dashboard", width: 816, format: "Letter" },
]);

const manifest = Object.freeze(
  anatomies.flatMap((anatomy) =>
    appearances.flatMap((appearance) =>
      pages.map((page) => Object.freeze({
        anatomy,
        ...appearance,
        page,
        output: `${anatomy}/${appearance.rendererKey}/${page}.webp`,
      })),
    ),
  ),
);

function assert(value, message) {
  if (!value) throw new Error(message);
}

async function assertRegistryManifest() {
  const registry = await readFile(registryPath, "utf8");
  for (const rendererKey of new Set(manifest.map((entry) => entry.rendererKey))) {
    assert(registry.includes(`"${rendererKey}"`), `Registry does not declare renderer key ${rendererKey}`);
  }
  for (const page of ["cover", "summary", "detail"]) {
    assert(registry.includes(`${page}.webp`), `Registry does not declare ${page}.webp preview paths`);
  }
}

async function assertWebp(path, expected = {}) {
  assertWebpContainer(path);
  return assertMeaningfulImage(path, expected);
}

function convertPngToWebp(input, output) {
  // `cwebp` produces a real RIFF/WebP file; verify that below before keeping it.
  // It is available in the project developer toolchain, so no runtime package is added.
  execFileSync("cwebp", ["-quiet", "-q", "88", input, "-o", output], { stdio: "pipe" });
}

function representativeContentMarker(entry) {
  if (entry.page === "cover") {
    return entry.anatomy === "scored"
      ? "Scaling Up Full"
      : entry.anatomy === "qualitative"
        ? "Quarterly Reflection"
        : "Custom Founder Prompts";
  }
  if (entry.anatomy === "scored") {
    return entry.page === "summary"
      ? entry.style === "CLASSIC" ? "Total points" : "People"
      : entry.style === "CLASSIC" ? "Your recommendations" : "Recommendations";
  }
  if (entry.anatomy === "qualitative") {
    return entry.page === "summary"
      ? entry.style === "CLASSIC" ? "Dear Alex" : "Operating facts"
      : "Reflection";
  }
  return entry.page === "summary"
    ? "Founder reflections"
    : "Operating reflections";
}

async function assertCaptureDom(page, root, entry) {
  const marker = representativeContentMarker(entry);
  const matches = root.getByText(marker, { exact: false });
  let markerVisible = false;
  for (let index = 0; index < await matches.count(); index += 1) {
    if (await matches.nth(index).isVisible()) {
      markerVisible = true;
      break;
    }
  }
  assert(
    markerVisible,
    `Representative content "${marker}" is not visible for ${entry.anatomy}/${entry.style}/${entry.page}`,
  );

  if (entry.style !== "CLASSIC") {
    const provenance = root.getByTestId("report-style-provenance");
    let provenanceVisible = false;
    for (let index = 0; index < await provenance.count(); index += 1) {
      if (await provenance.nth(index).isVisible()) {
        provenanceVisible = true;
        break;
      }
    }
    assert(
      provenanceVisible,
      `Renderer provenance is not visible for ${entry.anatomy}/${entry.style}/${entry.page}`,
    );
  }

  const geometry = await root.evaluate((canvas) => {
    const rootElement = canvas;
    const rootRect = rootElement.getBoundingClientRect();
    const rootStyle = window.getComputedStyle(rootElement);
    const violations = [];
    for (const node of rootElement.querySelectorAll("*")) {
      const element = node;
      const style = window.getComputedStyle(element);
      if (
        style.display === "none" ||
        style.visibility === "hidden" ||
        Number(style.opacity) === 0
      ) {
        continue;
      }
      const rect = element.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      if (
        rect.left < rootRect.left - 1 ||
        rect.right > rootRect.right + 1 ||
        rect.top < rootRect.top - 1 ||
        rect.bottom > rootRect.bottom + 1
      ) {
        violations.push({
          tag: element.tagName,
          testId: element.getAttribute("data-testid"),
          left: Math.round(rect.left - rootRect.left),
          top: Math.round(rect.top - rootRect.top),
          right: Math.round(rect.right - rootRect.right),
          bottom: Math.round(rect.bottom - rootRect.bottom),
        });
      }
    }
    return {
      clientWidth: rootElement.clientWidth,
      clientHeight: rootElement.clientHeight,
      scrollWidth: rootElement.scrollWidth,
      scrollHeight: rootElement.scrollHeight,
      overflowX: rootStyle.overflowX,
      overflowY: rootStyle.overflowY,
      violations: violations.slice(0, 12),
    };
  });
  assert(
    geometry.overflowX !== "hidden" && geometry.overflowY !== "hidden",
    `Capture root hides overflow for ${entry.anatomy}/${entry.style}/${entry.page}`,
  );
  assert(
    geometry.scrollWidth <= geometry.clientWidth + 1 &&
      geometry.scrollHeight <= geometry.clientHeight + 1,
    `Selected content exceeds its capture canvas for ${entry.anatomy}/${entry.style}/${entry.page}: ${JSON.stringify(geometry)}`,
  );
  assert(
    geometry.violations.length === 0,
    `Visible renderer content is clipped for ${entry.anatomy}/${entry.style}/${entry.page}: ${JSON.stringify(geometry.violations)}`,
  );
  try {
    await assertNoAncestorClipping(root);
  } catch (error) {
    throw new Error(
      `Visible renderer content is clipped for ${entry.anatomy}/${entry.style}/${entry.page}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  return marker;
}

async function login(page, credentials) {
  await page.goto(`${baseUrl}/login`, { waitUntil: "networkidle" });
  await page.getByLabel(/email/i).fill(credentials.email);
  await page.getByLabel(/password/i).fill(credentials.password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 15_000 });
}

async function rendererCss() {
  const stylesRoot = join(appRoot, "src", "styles");
  const styles = await Promise.all([
    readFile(join(stylesRoot, "su-public-brand.css"), "utf8"),
    readFile(join(stylesRoot, "su-report.css"), "utf8"),
    readFile(join(stylesRoot, "su-report-executive.css"), "utf8"),
    readFile(join(stylesRoot, "su-report-dashboard.css"), "utf8"),
  ]);
  const fontSeam = loadReportStyleFontSeam(appRoot);
  return `${fontSeam.css}\n${styles.join("\n")}`;
}

const selectionCss = String.raw`
  [data-preview-style="CLASSIC"][data-preview-page="cover"] .su-report > :not(.su-report-cover),
  [data-preview-style="CLASSIC"][data-preview-anatomy="scored"][data-preview-page="summary"] .su-report > :not(.su-report-overall),
  [data-preview-style="CLASSIC"][data-preview-anatomy="scored"][data-preview-page="detail"] .su-report > :not(.su-report-recs),
  [data-preview-style="CLASSIC"][data-preview-anatomy="qualitative"][data-preview-page="summary"] .su-report > :not([data-testid="qual-preface"]),
  [data-preview-style="CLASSIC"][data-preview-anatomy="qualitative"][data-preview-page="detail"] .su-report > :not([data-testid="qual-section-reflection"]),
  [data-preview-style="CLASSIC"][data-preview-anatomy="sparse-custom"][data-preview-page="summary"] .su-report > :not([data-testid="qual-section-founder-reflections"]),
  [data-preview-style="CLASSIC"][data-preview-anatomy="sparse-custom"][data-preview-page="detail"] .su-report > :not([data-testid="qual-section-operating-reflections"]) { display: none; }

  [data-preview-style="EXECUTIVE_BOARDROOM"][data-preview-page="cover"] .su-report--executive > .report-page:not(.report-page--executive-cover),
  [data-preview-style="MODERN_DASHBOARD"][data-preview-page="cover"] .su-report--dashboard > .report-page:not(.report-page--dashboard-cover),
  [data-preview-style="EXECUTIVE_BOARDROOM"][data-preview-anatomy="scored"][data-preview-page="summary"] .su-report--executive > .report-page:not(.report-page--executive-summary),
  [data-preview-style="MODERN_DASHBOARD"][data-preview-anatomy="scored"][data-preview-page="summary"] .su-report--dashboard > .report-page:not(.report-page--dashboard-summary),
  [data-preview-style="EXECUTIVE_BOARDROOM"][data-preview-page="detail"] .su-report--executive > .report-page:not(.report-page--executive-detail),
  [data-preview-style="MODERN_DASHBOARD"][data-preview-page="detail"] .su-report--dashboard > .report-page:not(.report-page--dashboard-detail),
  [data-preview-style="EXECUTIVE_BOARDROOM"][data-preview-anatomy]:not([data-preview-anatomy="scored"])[data-preview-page="summary"] .su-report--executive > .report-page:not(.report-page--executive-detail),
  [data-preview-style="MODERN_DASHBOARD"][data-preview-anatomy]:not([data-preview-anatomy="scored"])[data-preview-page="summary"] .su-report--dashboard > .report-page:not(.report-page--dashboard-detail) { display: none; }

  [data-preview-anatomy="scored"][data-preview-page="detail"] .report-page--executive-detail [data-report-role="section"] ~ [data-report-role="section"],
  [data-preview-anatomy="scored"][data-preview-page="detail"] .report-page--dashboard-detail [data-report-role="section"] ~ [data-report-role="section"],
  [data-preview-anatomy="scored"][data-preview-page="summary"] .report-page--executive-summary [data-report-role="domain"] ~ [data-report-role="domain"] ~ [data-report-role="domain"],
  [data-preview-anatomy="scored"][data-preview-page="summary"] .report-page--dashboard-summary [data-report-role="domain"] ~ [data-report-role="domain"] ~ [data-report-role="domain"],
  [data-preview-anatomy="scored"][data-preview-page="detail"] .report-page--executive-detail .report-action-group ~ .report-action-group,
  [data-preview-anatomy="scored"][data-preview-page="detail"] .report-page--dashboard-detail .report-action-group ~ .report-action-group,
  [data-preview-anatomy="scored"][data-preview-page="detail"] .report-page--executive-detail [data-report-block="additional-response"],
  [data-preview-anatomy="scored"][data-preview-page="detail"] .report-page--dashboard-detail [data-report-block="additional-response"],
  [data-preview-anatomy="scored"][data-preview-page="detail"] .report-page--executive-detail [data-report-block="coach-cta"],
  [data-preview-anatomy="scored"][data-preview-page="detail"] .report-page--dashboard-detail [data-report-block="coach-cta"],
  [data-preview-anatomy="scored"][data-preview-page="detail"] .report-page--executive-detail [data-report-block="closing"],
  [data-preview-anatomy="scored"][data-preview-page="detail"] .report-page--dashboard-detail [data-report-block="closing"],
  [data-preview-anatomy="qualitative"][data-preview-page="summary"] .report-page--executive-detail [data-report-block="narrative-response"],
  [data-preview-anatomy="qualitative"][data-preview-page="summary"] .report-page--executive-detail [data-report-block="finding"],
  [data-preview-anatomy="qualitative"][data-preview-page="summary"] .report-page--dashboard-detail [data-report-block="narrative-response"],
  [data-preview-anatomy="qualitative"][data-preview-page="summary"] .report-page--dashboard-detail [data-report-block="finding"],
  [data-preview-anatomy="qualitative"][data-preview-page="detail"] .report-page--executive-detail [data-report-block]:not([data-report-block="narrative-response"]):not([data-report-block="finding"]),
  [data-preview-anatomy="qualitative"][data-preview-page="detail"] .report-page--dashboard-detail [data-report-block]:not([data-report-block="narrative-response"]):not([data-report-block="finding"]),
  [data-preview-anatomy="sparse-custom"][data-preview-page="summary"] [data-testid="report-style-narrative-operating-reflections"],
  [data-preview-anatomy="sparse-custom"][data-preview-page="detail"] [data-testid="report-style-narrative-founder-reflections"] { display: none; }
`;

async function setDatabaseFreeContent(page, entry, styles) {
  const [{ stdout: markup }, logo] = await Promise.all([
    execFileAsync(
    process.execPath,
    [
      join(appRoot, "scripts", "render-report-style-qa.cjs"),
      entry.style,
      entry.anatomy,
      "normal",
    ],
      { cwd: appRoot, encoding: "utf8", maxBuffer: 4 * 1024 * 1024 },
    ),
    readFile(join(appRoot, "public", "brand", "su-logo-white.svg")),
  ]);
  const markupWithAssets = markup.replaceAll(
    "/brand/su-logo-white.svg",
    `data:image/svg+xml;base64,${logo.toString("base64")}`,
  );
  const height = entry.rendererKey === "classic" ? 1123 : 1056;
  await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>
    html, body { margin: 0; padding: 0; background: #fff; }
    #report-style-preview-root { box-sizing: border-box; width: ${entry.width}px; height: ${height}px; }
    #report-style-preview-root > .su-report,
    #report-style-preview-root > .su-report--executive,
    #report-style-preview-root > .su-report--dashboard,
    #report-style-preview-root .report-page--executive-cover,
    #report-style-preview-root .report-page--dashboard-cover { box-sizing: border-box; height: 100%; min-height: 100%; }
    #report-style-preview-root[data-preview-style="CLASSIC"][data-preview-page="cover"] .su-report-cover { box-sizing: border-box; height: 100%; min-height: 100%; }
    ${styles}
    ${selectionCss}
    @media print {
      html, body, #report-style-preview-root { width: 100% !important; height: auto !important; max-height: none !important; overflow: visible !important; }
      #report-style-preview-root > .su-report,
      #report-style-preview-root > .su-report--executive,
      #report-style-preview-root > .su-report--dashboard { height: auto !important; min-height: 0 !important; }
      #report-style-preview-root .report-page { height: auto !important; min-height: 0 !important; padding: 0 !important; position: relative !important; }
      #report-style-preview-root[data-preview-style="EXECUTIVE_BOARDROOM"] .report-page { height: 9.5in !important; }
      #report-style-preview-root[data-preview-style="MODERN_DASHBOARD"] .report-page { height: 9.7in !important; }
      #report-style-preview-root .report-page section { margin-bottom: .75rem !important; }
      #report-style-preview-root .report-page > .report-provenance { bottom: 0; left: 0; margin-top: .5rem !important; padding-top: .5rem !important; position: absolute; right: 0; }
      #report-style-preview-root .report-page-break { break-before: auto !important; page-break-before: auto !important; }
      #report-style-preview-root .su-report-cover { break-after: auto !important; page-break-after: auto !important; }
      #report-style-preview-root .report-page { break-before: auto !important; break-after: auto !important; page-break-before: auto !important; page-break-after: auto !important; }
    }
  </style></head><body><main id="report-style-preview-root" data-testid="report-style-preview-root" data-preview-anatomy="${entry.anatomy}" data-preview-style="${entry.style}" data-preview-page="${entry.page}">${markupWithAssets}</main></body></html>`);
  await page.evaluate(async () => { await document.fonts.ready; });
}

async function main() {
  if (process.argv.includes("--print-manifest")) {
    process.stdout.write(`${JSON.stringify(manifest)}\n`);
    return;
  }

  const databaseFree = process.argv.includes("--db-free");
  const email = process.env.E2E_ADMIN_EMAIL?.trim();
  const password = process.env.E2E_ADMIN_PASSWORD;
  if (!databaseFree && (!email || !password)) {
    process.stderr.write(
      "Report style preview capture requires explicit admin credentials.\n",
    );
    process.exitCode = 1;
    return;
  }

  const { chromium } = await import("playwright");
  await assertRegistryManifest();
  const temporaryRoot = await mkdtemp(join(tmpdir(), "report-style-preview-"));
  const browser = await chromium.launch({ headless: true });

  try {
    const context = await browser.newContext({ deviceScaleFactor: 1, viewport: { width: 1000, height: 1300 } });
    const page = await context.newPage();
    const styles = databaseFree ? await rendererCss() : null;
    if (!databaseFree) await login(page, { email, password });

    for (const entry of manifest) {
      await page.setViewportSize({ width: entry.width + 80, height: 1300 });
      if (databaseFree) {
        await setDatabaseFreeContent(page, entry, styles);
      } else {
        const params = new URLSearchParams({
          anatomy: entry.anatomy,
          style: entry.style,
          page: entry.page,
          capture: "1",
        });
        await page.goto(`${baseUrl}/admin/surveys/report-style-preview?${params}`, { waitUntil: "networkidle" });
        assert(!page.url().includes("/login"), `Preview route redirected to login for ${entry.style}/${entry.page}`);
        await page.evaluate(async () => { await document.fonts.ready; });
        // Next dev mounts its badge in a <nextjs-portal> outside the renderer.
        // The portal is never report content, and hiding its host keeps a local
        // capture deterministic without altering the admin shell or preview route.
        await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
      }

      const root = databaseFree
        ? page.locator("#report-style-preview-root")
        : page.getByTestId("report-style-preview-root");
      await root.waitFor({ state: "visible" });
      const bounds = await root.boundingBox();
      assert(bounds, `Capture root has no bounding box for ${entry.style}/${entry.page}`);
      assert(
        Math.round(bounds.width) === entry.width && Math.round(bounds.height) === (entry.rendererKey === "classic" ? 1123 : 1056),
        `Capture root has unexpected geometry for ${entry.style}/${entry.page}: ${bounds.width}x${bounds.height}`,
      );
      if (!databaseFree) {
        const safeBottom = page.getByTestId("report-style-preview-safe-bottom");
        await safeBottom.waitFor({ state: "visible" });
        const safeBounds = await safeBottom.boundingBox();
        assert(
          safeBounds && safeBounds.y >= bounds.y && safeBounds.y + safeBounds.height <= bounds.y + bounds.height + 1,
          `Preview content crosses its canvas bottom for ${entry.style}/${entry.page}`,
        );
      }
      const representativeMarker = await assertCaptureDom(
        page,
        root,
        entry,
      );
      const output = join(previewRoot, entry.output);
      const temporaryPng = join(temporaryRoot, `${entry.anatomy}-${entry.rendererKey}-${entry.page}.png`);
      const temporaryPdf = join(temporaryRoot, `${entry.anatomy}-${entry.rendererKey}-${entry.page}.pdf`);
      await mkdir(dirname(output), { recursive: true });
      await root.screenshot({ path: temporaryPng, type: "png", animations: "disabled" });
      await assertMeaningfulImage(temporaryPng, {
        width: entry.width,
        height: entry.rendererKey === "classic" ? 1123 : 1056,
      });
      convertPngToWebp(temporaryPng, output);
      await assertWebp(output, {
        width: entry.width,
        height: entry.rendererKey === "classic" ? 1123 : 1056,
      });
      await page.pdf({
        format: entry.format,
        path: temporaryPdf,
        preferCSSPageSize: false,
        printBackground: true,
        scale: 1,
      });
      await assertSinglePagePdf(temporaryPdf, entry.format, {
        markers: [
          representativeMarker,
          ...(entry.style === "CLASSIC"
            ? []
            : ["Confidential assessment report"]),
        ],
        rasterDirectory: temporaryRoot,
      });
      if (entry.anatomy === "scored") {
        const compatibilityOutput = join(
          previewRoot,
          entry.rendererKey,
          `${entry.page}.webp`,
        );
        await mkdir(dirname(compatibilityOutput), { recursive: true });
        await copyFile(output, compatibilityOutput);
        await assertWebp(compatibilityOutput, {
          width: entry.width,
          height: entry.rendererKey === "classic" ? 1123 : 1056,
        });
      }
      process.stdout.write(`${basename(output)} ${entry.anatomy}/${entry.style}/${entry.page}\n`);
    }
    await context.close();
  } finally {
    await browser.close();
    if (process.env.REPORT_STYLE_PREVIEW_KEEP_TEMP === "1") {
      process.stderr.write(`Kept preview diagnostics at ${temporaryRoot}\n`);
    } else {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  }

  for (const entry of manifest) {
    await assertWebp(join(previewRoot, entry.output));
  }
}

main().catch((error) => {
  console.error("Report style preview capture failed:", error);
  process.exitCode = 1;
});
