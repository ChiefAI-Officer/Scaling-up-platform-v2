import { expect, test, type Page, type TestInfo } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { encode } from "next-auth/jwt";
import { PrismaClient } from "@prisma/client";
import {
  REPORT_STYLE_PREVIEW_ANATOMIES,
  REPORT_STYLE_PREVIEW_VARIANTS,
} from "../src/lib/assessments/report-style-preview-fixture";
import { loginAs } from "./helpers/auth";

/* eslint-disable @typescript-eslint/no-require-imports */
const {
  assertDisposableReportStyleDatabase,
  expectedRaceReportStyle,
} = require("../scripts/report-style-e2e-server-contract.cjs") as {
  assertDisposableReportStyleDatabase: (options: {
    env: NodeJS.ProcessEnv;
    createClient: (databaseUrl: string) => PrismaClient;
  }) => Promise<void>;
  expectedRaceReportStyle: (status: number) => "CLASSIC" | "MODERN_DASHBOARD";
};
const { loadReportStyleFontSeam } = require("../scripts/report-style-font-seam.cjs") as {
  loadReportStyleFontSeam: (appRoot: string) => {
    css: string;
    variables: Record<string, { variable: string }>;
  };
};
/* eslint-enable @typescript-eslint/no-require-imports */

const execFileAsync = promisify(execFile);

/**
 * This suite is intentionally opt-in. It must run only against a disposable,
 * migrated database. Its fixture provisioner creates uniquely named source
 * organizations/respondents/invitations and deletes the database afterwards;
 * this test itself creates and deletes an inheritance-check campaign through
 * the authenticated product API.
 */
const requiredEnvironment = [
  "E2E_REPORT_STYLES_DATABASE_URL",
  "E2E_REPORT_STYLES_DISPOSABLE_SENTINEL_ID",
  "E2E_REPORT_STYLES_DISPOSABLE_SENTINEL_VALUE",
  "E2E_REPORT_STYLES_ADMIN_SETTINGS_PATH",
  "E2E_REPORT_STYLES_CREATE_CAMPAIGN_BODY",
  "E2E_REPORT_STYLES_EXECUTIVE_CAMPAIGN_PATH",
  "E2E_REPORT_STYLES_EXECUTIVE_REPORT_PATH",
  "E2E_REPORT_STYLES_EXECUTIVE_EXCHANGE_PATH",
  "E2E_REPORT_STYLES_EXECUTIVE_INVITATION_TOKEN",
  "E2E_REPORT_STYLES_EXECUTIVE_SUBMIT_BODY",
  "E2E_REPORT_STYLES_DASHBOARD_CAMPAIGN_PATH",
  "E2E_REPORT_STYLES_DASHBOARD_REPORT_PATH",
  "E2E_REPORT_STYLES_DASHBOARD_EXCHANGE_PATH",
  "E2E_REPORT_STYLES_DASHBOARD_INVITATION_TOKEN",
  "E2E_REPORT_STYLES_DASHBOARD_SUBMIT_BODY",
  "E2E_REPORT_STYLES_RACE_CAMPAIGN_PATH",
  "E2E_REPORT_STYLES_RACE_EXCHANGE_PATH",
  "E2E_REPORT_STYLES_RACE_INVITATION_TOKEN",
  "E2E_REPORT_STYLES_RACE_SUBMIT_BODY",
  "E2E_REPORT_STYLES_RACE_PATCH_PATH",
] as const;

const missingEnvironment = requiredEnvironment.filter((key) => !process.env[key]);
const managedServerEnabled = process.env.PLAYWRIGHT_SKIP_WEBSERVER !== "1";
const canRunWorkflow = missingEnvironment.length === 0 && managedServerEnabled;

const admin = {
  email: process.env.E2E_ADMIN_EMAIL || "admin@scalingup.com",
  password: process.env.E2E_ADMIN_PASSWORD || "demo123",
};
const coach = {
  email: process.env.E2E_COACH_EMAIL || "coach@example.com",
  password: process.env.E2E_COACH_PASSWORD || "demo123",
};

function requiredValue(key: (typeof requiredEnvironment)[number]) {
  const value = process.env[key];
  if (!value) throw new Error(`${key} must be set when report-style E2E is enabled.`);
  return value;
}

function jsonValue(key: (typeof requiredEnvironment)[number]): Record<string, unknown> {
  const raw = requiredValue(key);
  const value = JSON.parse(raw) as unknown;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${key} must contain one JSON object.`);
  }
  return value as Record<string, unknown>;
}

async function assertNoAxeViolations(page: Page, selector: string) {
  const results = await new AxeBuilder({ page })
    .include(selector)
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(results.violations).toEqual([]);
}

async function assertNoEmptyReportComposition(page: Page, selector: string) {
  const emptyBlocks = await page.locator(`${selector} [data-report-block]`).evaluateAll(
    (blocks) =>
      blocks
        .filter((block) => (block.textContent ?? "").trim() === "")
        .map((block) => block.getAttribute("data-report-block")),
  );
  expect(emptyBlocks).toEqual([]);

  const emptyVisiblePages = await page.locator(`${selector} .report-page`).evaluateAll(
    (pages) =>
      pages.filter((candidate) => {
        const element = candidate as HTMLElement;
        const style = window.getComputedStyle(element);
        return style.display !== "none" && (element.textContent ?? "").trim() === "";
      }).length,
  );
  expect(emptyVisiblePages).toBe(0);
}

async function assertNoColorOnlyStatus(page: Page, selector: string) {
  const colorOnlyStatuses = await page
    .locator(`${selector} [data-achievement-status]`)
    .evaluateAll((statuses) =>
      statuses
        .filter((status) => !/achieved/i.test(status.textContent ?? ""))
        .map((status) => status.getAttribute("data-achievement-status")),
    );
  expect(colorOnlyStatuses).toEqual([]);
}

async function assertProductionFontIntent(
  page: Page,
  selector: string,
  style: "CLASSIC" | "EXECUTIVE_BOARDROOM" | "MODERN_DASHBOARD",
) {
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  const rootFamily = await page
    .locator(selector)
    .evaluate((root) => window.getComputedStyle(root).fontFamily);

  if (style === "CLASSIC") {
    expect(rootFamily).toMatch(/Roboto/i);
    expect(await page.evaluate(() => document.fonts.check("16px Roboto"))).toBe(true);
    return;
  }

  expect(rootFamily).toMatch(/Inter/i);
  expect(await page.evaluate(() => document.fonts.check("16px Inter"))).toBe(true);
  if (style === "EXECUTIVE_BOARDROOM") {
    const displayFamily = await page
      .locator(`${selector} .report-page--executive-cover h1`)
      .evaluate((heading) => window.getComputedStyle(heading).fontFamily);
    expect(displayFamily).toMatch(/Playfair Display/i);
    expect(
      await page.evaluate(() => document.fonts.check('700 16px "Playfair Display"')),
    ).toBe(true);
  }
}

async function captureViewportEvidence(page: Page, testInfo: TestInfo, name: string) {
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  await page.screenshot({ path: testInfo.outputPath(`${name}.png`), fullPage: true });
}

async function assertReportPdf(
  page: Page,
  testInfo: TestInfo,
  name: string,
  options: {
    format: "A4" | "Letter";
    style: "CLASSIC" | "EXECUTIVE_BOARDROOM" | "MODERN_DASHBOARD";
    expectedPages?: number;
  },
) {
  const path = testInfo.outputPath(`${name}.pdf`);
  await page.emulateMedia({ media: "print" });
  const pdf = await page.pdf({
    format: options.format,
    printBackground: true,
    path,
  });
  expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  const { stdout: info } = await execFileAsync("pdfinfo", [path]);
  const physicalPageCount = Number(info.match(/^Pages:\s+(\d+)$/m)?.[1]);
  const pageSize = info.match(/^Page size:\s+([\d.]+) x ([\d.]+) pts/m);
  expect(physicalPageCount).toBeGreaterThan(0);
  expect(pageSize).not.toBeNull();
  const [, width, height] = pageSize ?? [];
  const expectedSize =
    options.format === "A4" ? [595.28, 841.89] : [612, 792];
  expect(Math.abs(Number(width) - expectedSize[0])).toBeLessThan(2);
  expect(Math.abs(Number(height) - expectedSize[1])).toBeLessThan(2);
  if (options.expectedPages !== undefined) expect(physicalPageCount).toBe(options.expectedPages);

  for (let pageNumber = 1; pageNumber <= physicalPageCount; pageNumber += 1) {
    const { stdout } = await execFileAsync("pdftotext", ["-f", String(pageNumber), "-l", String(pageNumber), path, "-"]);
    expect(stdout.trim()).not.toBe("");
    // Alternate styles declare recurring CSS margin-box provenance and a page
    // counter. Classic predates margin-box text, so its every-page nonblank
    // assertion is the trailing-page guard while A4 geometry remains exact.
    if (options.style !== "CLASSIC") {
      expect(stdout).toMatch(/confidential assessment report/i);
      expect(stdout).toMatch(
        new RegExp(`Page\\s+${pageNumber}\\s+of\\s+${physicalPageCount}`, "i"),
      );
    }
  }
  await testInfo.attach(`${name}-pdf-metadata`, {
    body: JSON.stringify({ pageCount: physicalPageCount, pageSize: [Number(width), Number(height)] }),
    contentType: "application/json",
  });
  await page.emulateMedia({ media: "screen" });
}

async function rendererCss() {
  const stylesRoot = resolve(process.cwd(), "src/styles");
  const styles = await Promise.all([
    readFile(resolve(stylesRoot, "su-public-brand.css"), "utf8"),
    readFile(resolve(stylesRoot, "su-report.css"), "utf8"),
    readFile(resolve(stylesRoot, "su-report-executive.css"), "utf8"),
    readFile(resolve(stylesRoot, "su-report-dashboard.css"), "utf8"),
  ]);
  const fontSeam = loadReportStyleFontSeam(process.cwd());
  return `${fontSeam.css}\n${styles.join("\n")}`;
}

async function setSupplementalRendererContent(
  page: Page,
  style: "CLASSIC" | "EXECUTIVE_BOARDROOM" | "MODERN_DASHBOARD",
  anatomy: (typeof REPORT_STYLE_PREVIEW_ANATOMIES)[number],
  variant: (typeof REPORT_STYLE_PREVIEW_VARIANTS)[number],
) {
  const [{ stdout: markup }, logo] = await Promise.all([
    execFileAsync(
      process.execPath,
      [
        resolve(process.cwd(), "scripts/render-report-style-qa.cjs"),
        style,
        anatomy,
        variant,
      ],
      { encoding: "utf8" },
    ),
    readFile(resolve(process.cwd(), "public/brand/su-logo-white.svg")),
  ]);
  const markupWithAssets = markup.replaceAll(
    "/brand/su-logo-white.svg",
    `data:image/svg+xml;base64,${logo.toString("base64")}`,
  );
  await page.setContent(
    `<!doctype html><html><head><style>${await rendererCss()}</style></head><body><main data-preview-style="${style}" data-preview-anatomy="${anatomy}">${markupWithAssets}</main></body></html>`,
  );
}

function rendererTestId(
  style: "CLASSIC" | "EXECUTIVE_BOARDROOM" | "MODERN_DASHBOARD",
  anatomy: (typeof REPORT_STYLE_PREVIEW_ANATOMIES)[number],
) {
  if (style === "EXECUTIVE_BOARDROOM") return "executive-boardroom-report";
  if (style === "MODERN_DASHBOARD") return "modern-dashboard-report";
  return anatomy === "scored" ? "branded-report" : "qualitative-report";
}

const previewBaseUrl = process.env.E2E_REPORT_STYLES_PREVIEW_BASE_URL?.replace(/\/$/, "");
const previewAdmin = {
  email: process.env.E2E_PREVIEW_ADMIN_EMAIL || "e2e-preview-admin@example.test",
};

async function seedPreviewAdminSession(page: Page) {
  if (!previewBaseUrl) throw new Error("E2E_REPORT_STYLES_PREVIEW_BASE_URL is required.");
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("NEXTAUTH_SECRET is required for the local signed preview session.");
  const baseUrl = new URL(previewBaseUrl);
  const token = await encode({
    secret,
    maxAge: 60 * 10,
    token: {
      sub: "e2e-preview-admin",
      id: "e2e-preview-admin",
      email: previewAdmin.email,
      name: "E2E Preview Admin",
      role: "ADMIN",
    },
  });
  await page.context().addCookies([{
    name: baseUrl.protocol === "https:" ? "__Secure-next-auth.session-token" : "next-auth.session-token",
    value: token,
    domain: baseUrl.hostname,
    path: "/",
    httpOnly: true,
    secure: baseUrl.protocol === "https:",
    sameSite: "Lax",
  }]);
}

async function browserFetch(
  page: Page,
  url: string,
  init: { method: "POST" | "PATCH" | "DELETE"; body?: Record<string, unknown> },
) {
  return page.evaluate(async ({ url: target, request }) => {
    const response = await fetch(target, {
      method: request.method,
      headers: request.body ? { "Content-Type": "application/json" } : undefined,
      body: request.body ? JSON.stringify(request.body) : undefined,
      credentials: "include",
    });
    const body = await response.json().catch(() => null);
    return { status: response.status, body };
  }, { url, request: init });
}

async function exchangeAndSubmit(
  page: Page,
  exchangePath: string,
  invitationToken: string,
  submitBody: Record<string, unknown>,
) {
  const exchange = await browserFetch(page, exchangePath, {
    method: "POST",
    body: { token: invitationToken },
  });
  expect(exchange.status).toBe(204);
  const submitPath = exchangePath.replace(/\/exchange$/, "/submit");
  return browserFetch(page, submitPath, { method: "POST", body: submitBody });
}

async function selectAndSaveStyle(page: Page, styleName: RegExp) {
  const picker = page.getByTestId("campaign-report-style-card");
  await expect(picker).toBeVisible();
  await assertNoAxeViolations(page, '[data-testid="campaign-report-style-card"]');
  // The isolated fixture provisioner creates each real submission campaign
  // with Classic. Choosing either new presentation here is therefore a true
  // coach override, not merely a no-op save of an inherited choice.
  await expect(picker.getByRole("radio", { name: /classic/i })).toBeChecked();
  const choice = picker.getByRole("radio", { name: styleName });
  await choice.focus();
  await page.keyboard.press("Space");
  await expect(choice).toBeChecked();
  await picker.getByRole("button", { name: /save report appearance/i }).click();
  await expect(page.getByText(/report appearance saved/i)).toBeVisible();
}

test.describe("Report styles — isolated-database acceptance", () => {
  test.skip(
    !canRunWorkflow,
    `requires managed isolated fixture environment: ${[
      ...missingEnvironment,
      ...(managedServerEnabled ? [] : ["PLAYWRIGHT_SKIP_WEBSERVER must not be 1"]),
    ].join(", ")}`,
  );

  test.beforeAll(async () => {
    if (!canRunWorkflow) return;
    const databaseUrl = requiredValue("E2E_REPORT_STYLES_DATABASE_URL");
    await assertDisposableReportStyleDatabase({
      env: { ...process.env, DATABASE_URL: databaseUrl },
      createClient: (url) => new PrismaClient({ datasourceUrl: url, log: [] }),
    });
  });

  test("admin default copies into a newly created campaign, coach overrides, then each real submission locks and renders", async ({
    page,
  }, testInfo) => {
    await loginAs(page, { ...admin, expectedUrl: /\/admin/ });
    await page.goto(requiredValue("E2E_REPORT_STYLES_ADMIN_SETTINGS_PATH"));

    const adminPicker = page.getByTestId("settings-default-report-style-card");
    await expect(adminPicker).toBeVisible();
    await assertNoAxeViolations(page, '[data-testid="settings-default-report-style-card"]');
    const classic = adminPicker.getByRole("radio", { name: /classic/i });
    await classic.focus();
    await page.keyboard.press("ArrowRight");
    await expect(adminPicker.getByRole("radio", { name: /executive boardroom/i })).toBeChecked();
    await adminPicker.getByRole("button", { name: "Save default" }).click();
    await expect(adminPicker.getByText(/default saved|saved default/i)).toBeVisible();
    await captureViewportEvidence(page, testInfo, "admin-default-boardroom-desktop");

    await loginAs(page, { ...coach, expectedUrl: /\/portal/ });
    const creation = jsonValue("E2E_REPORT_STYLES_CREATE_CAMPAIGN_BODY");
    const uniqueName = `e2e-report-style-inheritance-${Date.now()}`;
    let createdCampaignId: string | null = null;
    try {
      const created = await browserFetch(page, "/api/assessment-campaigns", {
        method: "POST",
        body: { ...creation, name: uniqueName },
      });
      expect(created.status).toBe(201);
      expect(created.body).toEqual(expect.objectContaining({ success: true }));
      const createdData = (created.body as { data?: { id?: string; reportStyle?: string } }).data;
      expect(createdData?.reportStyle).toBe("EXECUTIVE_BOARDROOM");
      expect(createdData?.id).toEqual(expect.any(String));
      createdCampaignId = createdData?.id ?? null;
    } finally {
      if (createdCampaignId) {
        const deleted = await browserFetch(page, `/api/assessment-campaigns/${createdCampaignId}`, {
          method: "DELETE",
        });
        expect([200, 204]).toContain(deleted.status);
      }
    }

    for (const scenario of [
      {
        key: "executive",
        campaignPath: requiredValue("E2E_REPORT_STYLES_EXECUTIVE_CAMPAIGN_PATH"),
        reportPath: requiredValue("E2E_REPORT_STYLES_EXECUTIVE_REPORT_PATH"),
        exchangePath: requiredValue("E2E_REPORT_STYLES_EXECUTIVE_EXCHANGE_PATH"),
        invitationToken: requiredValue("E2E_REPORT_STYLES_EXECUTIVE_INVITATION_TOKEN"),
        submitBody: jsonValue("E2E_REPORT_STYLES_EXECUTIVE_SUBMIT_BODY"),
        overrideName: /executive boardroom/i,
        expectedRenderer: "executive-boardroom-report",
      },
      {
        key: "dashboard",
        campaignPath: requiredValue("E2E_REPORT_STYLES_DASHBOARD_CAMPAIGN_PATH"),
        reportPath: requiredValue("E2E_REPORT_STYLES_DASHBOARD_REPORT_PATH"),
        exchangePath: requiredValue("E2E_REPORT_STYLES_DASHBOARD_EXCHANGE_PATH"),
        invitationToken: requiredValue("E2E_REPORT_STYLES_DASHBOARD_INVITATION_TOKEN"),
        submitBody: jsonValue("E2E_REPORT_STYLES_DASHBOARD_SUBMIT_BODY"),
        overrideName: /modern dashboard/i,
        expectedRenderer: "modern-dashboard-report",
      },
    ]) {
      await page.goto(scenario.campaignPath);
      await selectAndSaveStyle(page, scenario.overrideName);
      await captureViewportEvidence(page, testInfo, `${scenario.key}-coach-picker-desktop`);

      const submitted = await exchangeAndSubmit(
        page,
        scenario.exchangePath,
        scenario.invitationToken,
        scenario.submitBody,
      );
      expect(submitted.status).toBe(200);
      expect(submitted.body).toEqual(expect.objectContaining({ success: true }));

      await page.goto(scenario.campaignPath);
      const lockedPicker = page.getByTestId("campaign-report-style-card");
      await expect(lockedPicker.getByText(/changes are unavailable after the first completed response/i)).toBeVisible();
      await expect(lockedPicker.getByRole("radio", { name: scenario.overrideName })).toBeDisabled();

      await page.goto(scenario.reportPath);
      const report = page.getByTestId(scenario.expectedRenderer);
      await expect(report).toBeVisible();
      await assertNoAxeViolations(page, `[data-testid="${scenario.expectedRenderer}"]`);
      await expect(report).toContainText(/confidential assessment report/i);
      await captureViewportEvidence(page, testInfo, `${scenario.key}-report-desktop`);
      await assertReportPdf(page, testInfo, `${scenario.key}-report-letter`, {
        format: "Letter",
        style:
          scenario.key === "executive"
            ? "EXECUTIVE_BOARDROOM"
            : "MODERN_DASHBOARD",
      });

      await page.setViewportSize({ width: 393, height: 852 });
      await page.goto(scenario.reportPath);
      await expect(page.getByTestId(scenario.expectedRenderer)).toBeVisible();
      const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      expect(horizontalOverflow).toBe(false);
      await captureViewportEvidence(page, testInfo, `${scenario.key}-report-mobile`);
      await page.setViewportSize({ width: 1280, height: 900 });
    }
  });

  test("completion and coach PATCH race serialize to a final immutable picker", async ({ page }) => {
    await loginAs(page, { ...coach, expectedUrl: /\/portal/ });
    const campaignPath = requiredValue("E2E_REPORT_STYLES_RACE_CAMPAIGN_PATH");
    const exchangePath = requiredValue("E2E_REPORT_STYLES_RACE_EXCHANGE_PATH");
    const invitationToken = requiredValue("E2E_REPORT_STYLES_RACE_INVITATION_TOKEN");
    const submitBody = jsonValue("E2E_REPORT_STYLES_RACE_SUBMIT_BODY");

    await page.goto(campaignPath);
    const unlockedPicker = page.getByTestId("campaign-report-style-card");
    await expect(unlockedPicker.getByRole("radio", { name: /classic/i })).toBeChecked();
    await expect(unlockedPicker.getByRole("button", { name: /save report appearance/i })).toBeVisible();
    const exchange = await browserFetch(page, exchangePath, { method: "POST", body: { token: invitationToken } });
    expect(exchange.status).toBe(204);

    const submitPath = exchangePath.replace(/\/exchange$/, "/submit");
    const [submitted, patched] = await Promise.all([
      browserFetch(page, submitPath, { method: "POST", body: submitBody }),
      browserFetch(page, requiredValue("E2E_REPORT_STYLES_RACE_PATCH_PATH"), {
        method: "PATCH",
        body: { reportStyle: "MODERN_DASHBOARD" },
      }),
    ]);
    expect(submitted.status).toBe(200);
    expect([200, 409]).toContain(patched.status);
    if (patched.status === 409) {
      expect(patched.body).toEqual(expect.objectContaining({ error: "REPORT_STYLE_LOCKED" }));
    } else {
      expect(patched.body).toEqual(expect.objectContaining({
        success: true,
        data: expect.objectContaining({ reportStyle: "MODERN_DASHBOARD" }),
      }));
    }

    await page.goto(campaignPath);
    const lockedPicker = page.getByTestId("campaign-report-style-card");
    const expectedStyle = expectedRaceReportStyle(patched.status);
    const expectedChoice = expectedStyle === "MODERN_DASHBOARD" ? /modern dashboard/i : /classic/i;
    await expect(lockedPicker.getByText(/changes are unavailable after the first completed response/i)).toBeVisible();
    await expect(lockedPicker.getByRole("radio", { name: expectedChoice })).toBeChecked();
    await expect(lockedPicker.getByRole("radio", { name: expectedChoice })).toBeDisabled();
    await expect(lockedPicker.getByRole("button", { name: /save report appearance/i })).toHaveCount(0);
  });
});

test.describe("Report styles — fixture-only renderer visual evidence", () => {
  test.setTimeout(15 * 60_000);
  test.skip(
    !previewBaseUrl,
    "requires the authenticated local preview server used by Task 15 (E2E_REPORT_STYLES_PREVIEW_BASE_URL)",
  );

  test("Classic, Boardroom, and Dashboard remain readable across all safe variants", async ({ page }, testInfo) => {
    await seedPreviewAdminSession(page);

    for (const anatomy of REPORT_STYLE_PREVIEW_ANATOMIES) {
      for (const style of [
        { key: "CLASSIC" as const, format: "A4" as const },
        { key: "EXECUTIVE_BOARDROOM" as const, format: "Letter" as const },
        { key: "MODERN_DASHBOARD" as const, format: "Letter" as const },
      ]) {
        const rendererTestIdValue = rendererTestId(style.key, anatomy);
        for (const variant of REPORT_STYLE_PREVIEW_VARIANTS) {
          const previewPage = variant === "max-length" ? "detail" : "summary";
          const screenQuery = new URLSearchParams({
            anatomy,
            style: style.key,
            page: previewPage,
            variant,
          });

          await page.setViewportSize({ width: 1280, height: 900 });
          await page.goto(`${previewBaseUrl}/admin/surveys/report-style-preview?${screenQuery}`);
          const root = page.getByTestId("report-style-preview-root");
          const renderer = page.getByTestId(rendererTestIdValue);
          await expect(root).toHaveAttribute("data-preview-anatomy", anatomy);
          await expect(root).toHaveAttribute("data-preview-variant", variant);
          await expect(renderer).toBeVisible();
          await assertProductionFontIntent(
            page,
            `[data-testid="${rendererTestIdValue}"]`,
            style.key,
          );
          await assertNoAxeViolations(page, `[data-testid="${rendererTestIdValue}"]`);
          await assertNoEmptyReportComposition(page, `[data-testid="${rendererTestIdValue}"]`);
          await assertNoColorOnlyStatus(page, `[data-testid="${rendererTestIdValue}"]`);
          if (style.key !== "CLASSIC") {
            await expect(renderer).toContainText(/confidential assessment report/i);
          }
          const desktopOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
          expect(desktopOverflow).toBe(false);
          await captureViewportEvidence(page, testInfo, `${anatomy}-${style.key}-${variant}-desktop`);

          await page.setViewportSize({ width: 393, height: 852 });
          await page.goto(`${previewBaseUrl}/admin/surveys/report-style-preview?${screenQuery}`);
          await expect(page.getByTestId(rendererTestIdValue)).toBeVisible();
          const mobileOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
          expect(mobileOverflow).toBe(false);
          await captureViewportEvidence(page, testInfo, `${anatomy}-${style.key}-${variant}-mobile`);

          // Print is a deliberately separate, fixed A4/Letter canvas. Every safe
          // fixture uses the same representative page as its screen review, so
          // long and incomplete data can surface a real pagination regression.
          const printQuery = new URLSearchParams({
            anatomy,
            style: style.key,
            page: previewPage,
            variant,
            capture: "1",
          });
          await page.setViewportSize({ width: 1280, height: 900 });
          await page.goto(`${previewBaseUrl}/admin/surveys/report-style-preview?${printQuery}`);
          await expect(page.getByTestId(rendererTestIdValue)).toBeVisible();
          await assertReportPdf(
            page,
            testInfo,
            `${anatomy}-${style.key}-${variant}-${style.format.toLowerCase()}`,
            {
              expectedPages: 1,
              format: style.format,
              style: style.key,
            },
          );
        }
      }
    }
  });
});

test.describe("Report styles — DB-free supplemental component renderer evidence", () => {
  // This deliberately exercises every anatomy/style/variant through the real
  // server renderer and produces both screenshot and PDF evidence per case.
  test.setTimeout(15 * 60_000);

  test("Classic, Boardroom, and Dashboard render all safe fixtures responsively and print complete reports", async ({ page }, testInfo) => {
    for (const anatomy of REPORT_STYLE_PREVIEW_ANATOMIES) {
      for (const style of [
        { key: "CLASSIC" as const, format: "A4" as const },
        { key: "EXECUTIVE_BOARDROOM" as const, format: "Letter" as const },
        { key: "MODERN_DASHBOARD" as const, format: "Letter" as const },
      ]) {
        const rendererTestIdValue = rendererTestId(style.key, anatomy);
        for (const variant of REPORT_STYLE_PREVIEW_VARIANTS) {
          await page.setViewportSize({ width: 1280, height: 900 });
          await setSupplementalRendererContent(page, style.key, anatomy, variant);
          const renderer = page.getByTestId(rendererTestIdValue);
          await expect(renderer).toBeVisible();
          await assertProductionFontIntent(
            page,
            `[data-testid="${rendererTestIdValue}"]`,
            style.key,
          );
          await assertNoAxeViolations(page, `[data-testid="${rendererTestIdValue}"]`);
          await assertNoEmptyReportComposition(page, `[data-testid="${rendererTestIdValue}"]`);
          await assertNoColorOnlyStatus(page, `[data-testid="${rendererTestIdValue}"]`);
          if (style.key !== "CLASSIC") {
            await expect(renderer).toContainText(/confidential assessment report/i);
          }
          expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
          await captureViewportEvidence(page, testInfo, `${anatomy}-${style.key}-${variant}-supplemental-desktop`);

          await page.setViewportSize({ width: 393, height: 852 });
          await setSupplementalRendererContent(page, style.key, anatomy, variant);
          await expect(page.getByTestId(rendererTestIdValue)).toBeVisible();
          expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
          await captureViewportEvidence(page, testInfo, `${anatomy}-${style.key}-${variant}-supplemental-mobile`);

          await page.setViewportSize({ width: 1280, height: 900 });
          await setSupplementalRendererContent(page, style.key, anatomy, variant);
          await assertReportPdf(
            page,
            testInfo,
            `${anatomy}-${style.key}-${variant}-supplemental-${style.format.toLowerCase()}`,
            { format: style.format, style: style.key },
          );
        }
      }
    }
  });
});
