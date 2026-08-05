#!/usr/bin/env node

/**
 * Captures the committed, synthetic-only report-style preview manifest.
 *
 * Run against a local application with WAVE_REPORT_STYLES_ENABLED=1. The
 * route remains admin-protected, so this signs in through the normal login
 * form using E2E_ADMIN_EMAIL/E2E_ADMIN_PASSWORD (or the local demo defaults).
 */
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";

const appRoot = resolve(import.meta.dirname, "..");
const previewRoot = join(appRoot, "public", "report-style-previews");
const registryPath = join(appRoot, "src", "lib", "assessments", "report-style-registry.ts");
const baseUrl = (process.env.REPORT_STYLE_PREVIEW_BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
const email = process.env.E2E_ADMIN_EMAIL || "jverdun@scalingup.com";
const password = process.env.E2E_ADMIN_PASSWORD || "demo123";

const manifest = Object.freeze([
  { style: "CLASSIC", rendererKey: "classic", page: "cover", width: 794 },
  { style: "CLASSIC", rendererKey: "classic", page: "summary", width: 794 },
  { style: "CLASSIC", rendererKey: "classic", page: "detail", width: 794 },
  { style: "EXECUTIVE_BOARDROOM", rendererKey: "executive-boardroom", page: "cover", width: 816 },
  { style: "EXECUTIVE_BOARDROOM", rendererKey: "executive-boardroom", page: "summary", width: 816 },
  { style: "EXECUTIVE_BOARDROOM", rendererKey: "executive-boardroom", page: "detail", width: 816 },
  { style: "MODERN_DASHBOARD", rendererKey: "modern-dashboard", page: "cover", width: 816 },
  { style: "MODERN_DASHBOARD", rendererKey: "modern-dashboard", page: "summary", width: 816 },
  { style: "MODERN_DASHBOARD", rendererKey: "modern-dashboard", page: "detail", width: 816 },
]);

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

async function assertWebp(path) {
  const [info, bytes] = await Promise.all([stat(path), readFile(path)]);
  assert(info.size > 0, `Generated preview is empty: ${path}`);
  assert(bytes.length >= 12 && bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP", `Preview is not a true WebP: ${path}`);
}

function convertPngToWebp(input, output) {
  // `cwebp` produces a real RIFF/WebP file; verify that below before keeping it.
  // It is available in the project developer toolchain, so no runtime package is added.
  execFileSync("cwebp", ["-quiet", "-q", "88", input, "-o", output], { stdio: "pipe" });
}

async function login(page) {
  await page.goto(`${baseUrl}/login`, { waitUntil: "networkidle" });
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 15_000 });
}

async function main() {
  await assertRegistryManifest();
  const temporaryRoot = await mkdtemp(join(tmpdir(), "report-style-preview-"));
  const browser = await chromium.launch({ headless: true });

  try {
    const context = await browser.newContext({ deviceScaleFactor: 1, viewport: { width: 1000, height: 1300 } });
    const page = await context.newPage();
    await login(page);

    for (const entry of manifest) {
      const params = new URLSearchParams({ style: entry.style, page: entry.page, capture: "1" });
      await page.setViewportSize({ width: entry.width + 80, height: 1300 });
      await page.goto(`${baseUrl}/admin/surveys/report-style-preview?${params}`, { waitUntil: "networkidle" });
      assert(!page.url().includes("/login"), `Preview route redirected to login for ${entry.style}/${entry.page}`);
      await page.evaluate(async () => { await document.fonts.ready; });
      // Next dev mounts its badge in a <nextjs-portal> outside the renderer.
      // The portal is never report content, and hiding its host keeps a local
      // capture deterministic without altering the admin shell or preview route.
      await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });

      const root = page.getByTestId("report-style-preview-root");
      await root.waitFor({ state: "visible" });
      const bounds = await root.boundingBox();
      assert(bounds, `Capture root has no bounding box for ${entry.style}/${entry.page}`);
      assert(
        Math.round(bounds.width) === entry.width && Math.round(bounds.height) === (entry.rendererKey === "classic" ? 1123 : 1056),
        `Capture root has unexpected geometry for ${entry.style}/${entry.page}: ${bounds.width}x${bounds.height}`,
      );
      const safeBottom = page.getByTestId("report-style-preview-safe-bottom");
      await safeBottom.waitFor({ state: "visible" });
      const safeBounds = await safeBottom.boundingBox();
      assert(
        safeBounds && safeBounds.y >= bounds.y && safeBounds.y + safeBounds.height <= bounds.y + bounds.height + 1,
        `Preview content crosses its canvas bottom for ${entry.style}/${entry.page}`,
      );
      const output = join(previewRoot, entry.rendererKey, `${entry.page}.webp`);
      const temporaryPng = join(temporaryRoot, `${entry.rendererKey}-${entry.page}.png`);
      await mkdir(dirname(output), { recursive: true });
      await root.screenshot({ path: temporaryPng, type: "png", animations: "disabled" });
      convertPngToWebp(temporaryPng, output);
      await assertWebp(output);
      process.stdout.write(`${basename(output)} ${entry.style}/${entry.page}\n`);
    }
    await context.close();
  } finally {
    await browser.close();
    await rm(temporaryRoot, { recursive: true, force: true });
  }

  for (const entry of manifest) {
    await assertWebp(join(previewRoot, entry.rendererKey, `${entry.page}.webp`));
  }
}

main().catch((error) => {
  console.error("Report style preview capture failed:", error);
  process.exitCode = 1;
});
