import { expect, test, type BrowserContext, type Page, type TestInfo } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { loginAs } from "./helpers/auth";

const execFileAsync = promisify(execFile);

/**
 * This is an opt-in acceptance suite. Its managed provisioner must create one
 * disposable organization containing native and imported CEO history, a
 * non-CEO, a same-email respondent in another organization, and real Classic,
 * Executive Boardroom, and Modern Dashboard campaigns. The suite only mutates
 * the disposable fixture after proving the DATABASE_URL and sentinel match.
 */
const requiredEnvironment = [
  "DATABASE_URL",
  "ASSESSMENT_REPORT_ACCESS_SECRET",
  "E2E_REPORT_COMPARISON_DATABASE_URL",
  "E2E_REPORT_COMPARISON_DISPOSABLE_SENTINEL_ID",
  "E2E_REPORT_COMPARISON_DISPOSABLE_SENTINEL_VALUE",
  "E2E_REPORT_COMPARISON_FIXTURE",
] as const;

const missingEnvironment = requiredEnvironment.filter((key) => !process.env[key]);
const canRunWorkflow = missingEnvironment.length === 0 && process.env.PLAYWRIGHT_SKIP_WEBSERVER !== "1";

const admin = {
  email: process.env.E2E_ADMIN_EMAIL || "admin@scalingup.com",
  password: process.env.E2E_ADMIN_PASSWORD || "demo123",
};
const coach = {
  email: process.env.E2E_COACH_EMAIL || "coach@example.com",
  password: process.env.E2E_COACH_PASSWORD || "demo123",
};

interface ComparisonFacts {
  text: string[];
  deltaAriaLabel: string;
}

interface BaselineFixture {
  submissionId: string;
  label: string;
  imported: boolean;
  facts: ComparisonFacts;
}

interface StyleFixture {
  name: "Classic" | "Executive Boardroom" | "Modern Dashboard";
  coachCampaignPath: string;
  adminCampaignPath: string;
  focusRespondentId: string;
  mostRecentBaselineId: string;
  baselines: BaselineFixture[];
  excludedCandidateLabel: string;
}

interface CeoFixture {
  campaignId: string;
  participantId: string;
  invitationPath: string;
  submitPath: string;
  submitBody: Record<string, unknown>;
  canonicalReportPath: string;
  otherRespondentReportPath: string;
  groupReportPath: string;
  trendsPath: string;
  campaignDetailPath: string;
  alteredFocusReportPath: string;
  baseline: BaselineFixture;
  excludedCandidateLabel: string;
}

interface NonCeoFixture {
  invitationPath: string;
  submitPath: string;
  submitBody: Record<string, unknown>;
}

interface ReportComparisonFixture {
  organizationId: string;
  templateId: string;
  styleParityFacts: ComparisonFacts;
  styles: StyleFixture[];
  ceo: CeoFixture;
  nonCeo: NonCeoFixture;
}

function requiredValue(key: (typeof requiredEnvironment)[number]): string {
  const value = process.env[key];
  if (!value) throw new Error(`${key} must be set when report-comparison E2E is enabled.`);
  return value;
}

function localPath(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) {
    throw new Error(`${field} must be an origin-relative path.`);
  }
  return value;
}

function object(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${field} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function textArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.length === 0 || value.some((item) => typeof item !== "string" || !item.trim())) {
    throw new Error(`${field} must be a non-empty string array.`);
  }
  return value;
}

function baseline(value: unknown, field: string): BaselineFixture {
  const input = object(value, field);
  if (typeof input.submissionId !== "string" || !input.submissionId) throw new Error(`${field}.submissionId is required.`);
  if (typeof input.label !== "string" || !input.label) throw new Error(`${field}.label is required.`);
  if (typeof input.imported !== "boolean") throw new Error(`${field}.imported must be boolean.`);
  const facts = object(input.facts, `${field}.facts`);
  if (typeof facts.deltaAriaLabel !== "string" || !facts.deltaAriaLabel) {
    throw new Error(`${field}.facts.deltaAriaLabel is required.`);
  }
  return {
    submissionId: input.submissionId,
    label: input.label,
    imported: input.imported,
    facts: { text: textArray(facts.text, `${field}.facts.text`), deltaAriaLabel: facts.deltaAriaLabel },
  };
}

function fixtureValue(): ReportComparisonFixture {
  const raw = object(JSON.parse(requiredValue("E2E_REPORT_COMPARISON_FIXTURE")) as unknown, "E2E_REPORT_COMPARISON_FIXTURE");
  if (typeof raw.organizationId !== "string" || !raw.organizationId) throw new Error("fixture.organizationId is required.");
  if (typeof raw.templateId !== "string" || !raw.templateId) throw new Error("fixture.templateId is required.");
  if (!Array.isArray(raw.styles) || raw.styles.length !== 3) throw new Error("fixture.styles must contain all three report styles.");

  const styles = raw.styles.map((value, index) => {
    const input = object(value, `fixture.styles[${index}]`);
    if (input.name !== "Classic" && input.name !== "Executive Boardroom" && input.name !== "Modern Dashboard") {
      throw new Error(`fixture.styles[${index}].name is not a launched report style.`);
    }
    if (!Array.isArray(input.baselines) || input.baselines.length < 2) {
      throw new Error(`fixture.styles[${index}].baselines needs native and imported history.`);
    }
    if (typeof input.focusRespondentId !== "string" || !input.focusRespondentId) {
      throw new Error(`fixture.styles[${index}].focusRespondentId is required.`);
    }
    if (typeof input.mostRecentBaselineId !== "string" || !input.mostRecentBaselineId) {
      throw new Error(`fixture.styles[${index}].mostRecentBaselineId is required.`);
    }
    if (typeof input.excludedCandidateLabel !== "string" || !input.excludedCandidateLabel) {
      throw new Error(`fixture.styles[${index}].excludedCandidateLabel is required.`);
    }
    return {
      name: input.name,
      coachCampaignPath: localPath(input.coachCampaignPath, `fixture.styles[${index}].coachCampaignPath`),
      adminCampaignPath: localPath(input.adminCampaignPath, `fixture.styles[${index}].adminCampaignPath`),
      focusRespondentId: input.focusRespondentId,
      mostRecentBaselineId: input.mostRecentBaselineId,
      baselines: input.baselines.map((entry, baselineIndex) => baseline(entry, `fixture.styles[${index}].baselines[${baselineIndex}]`)),
      excludedCandidateLabel: input.excludedCandidateLabel,
    };
  });
  if (new Set(styles.map((style) => style.name)).size !== 3) throw new Error("fixture.styles must not duplicate a report style.");
  if (!styles.every((style) => style.baselines.some((entry) => entry.submissionId === style.mostRecentBaselineId) && style.baselines.some((entry) => !entry.imported) && style.baselines.some((entry) => entry.imported))) {
    throw new Error("each style requires native and imported baseline coverage.");
  }

  const ceoInput = object(raw.ceo, "fixture.ceo");
  const nonCeoInput = object(raw.nonCeo, "fixture.nonCeo");
  const styleParityFacts = object(raw.styleParityFacts, "fixture.styleParityFacts");
  if (typeof styleParityFacts.deltaAriaLabel !== "string" || !styleParityFacts.deltaAriaLabel) {
    throw new Error("fixture.styleParityFacts.deltaAriaLabel is required.");
  }
  if (typeof ceoInput.campaignId !== "string" || !ceoInput.campaignId) throw new Error("fixture.ceo.campaignId is required.");
  if (typeof ceoInput.participantId !== "string" || !ceoInput.participantId) throw new Error("fixture.ceo.participantId is required.");
  return {
    organizationId: raw.organizationId,
    templateId: raw.templateId,
    styleParityFacts: {
      text: textArray(styleParityFacts.text, "fixture.styleParityFacts.text"),
      deltaAriaLabel: styleParityFacts.deltaAriaLabel,
    },
    styles,
    ceo: {
      campaignId: ceoInput.campaignId,
      participantId: ceoInput.participantId,
      invitationPath: localPath(ceoInput.invitationPath, "fixture.ceo.invitationPath"),
      submitPath: localPath(ceoInput.submitPath, "fixture.ceo.submitPath"),
      submitBody: object(ceoInput.submitBody, "fixture.ceo.submitBody"),
      canonicalReportPath: localPath(ceoInput.canonicalReportPath, "fixture.ceo.canonicalReportPath"),
      otherRespondentReportPath: localPath(ceoInput.otherRespondentReportPath, "fixture.ceo.otherRespondentReportPath"),
      groupReportPath: localPath(ceoInput.groupReportPath, "fixture.ceo.groupReportPath"),
      trendsPath: localPath(ceoInput.trendsPath, "fixture.ceo.trendsPath"),
      campaignDetailPath: localPath(ceoInput.campaignDetailPath, "fixture.ceo.campaignDetailPath"),
      alteredFocusReportPath: localPath(ceoInput.alteredFocusReportPath, "fixture.ceo.alteredFocusReportPath"),
      baseline: baseline(ceoInput.baseline, "fixture.ceo.baseline"),
      excludedCandidateLabel: typeof ceoInput.excludedCandidateLabel === "string" && ceoInput.excludedCandidateLabel
        ? ceoInput.excludedCandidateLabel
        : (() => { throw new Error("fixture.ceo.excludedCandidateLabel is required."); })(),
    },
    nonCeo: {
      invitationPath: localPath(nonCeoInput.invitationPath, "fixture.nonCeo.invitationPath"),
      submitPath: localPath(nonCeoInput.submitPath, "fixture.nonCeo.submitPath"),
      submitBody: object(nonCeoInput.submitBody, "fixture.nonCeo.submitBody"),
    },
  };
}

function featureIsEnabled(fixture: ReportComparisonFixture): boolean {
  const on = (value: string | undefined) => value === "1" || value === "true" || value === "TRUE" || value === "yes";
  if (on(process.env.WAVE_RC_REPORT_COMPARISON_KILL)) return false;
  if (on(process.env.WAVE_RC_REPORT_COMPARISON_ENABLED)) return true;
  const canary = new Set((process.env.WAVE_RC_REPORT_COMPARISON_CANARY ?? "").split(/[\s,]+/).filter(Boolean));
  return canary.has(fixture.organizationId) || canary.has(fixture.templateId);
}

async function browserFetch(
  page: Page,
  url: string,
  init: { method: "POST"; body: Record<string, unknown> },
): Promise<{ status: number; body: unknown }> {
  return page.evaluate(async ({ target, request }) => {
    const response = await fetch(target, {
      method: request.method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request.body),
      credentials: "include",
      cache: "no-store",
    });
    return { status: response.status, body: await response.json().catch(() => null) };
  }, { target: url, request: init });
}

async function openReportFromCampaignDetail(
  page: Page,
  context: BrowserContext,
  campaignPath: string,
  respondentId: string,
): Promise<Page> {
  await page.goto(campaignPath);
  const [report] = await Promise.all([
    context.waitForEvent("page"),
    page.getByTestId(`view-report-link-${respondentId}`).click(),
  ]);
  await report.waitForLoadState("domcontentloaded");
  return report;
}

async function assertComparisonFacts(page: Page, facts: ComparisonFacts) {
  const content = page.getByTestId("report-comparison-content");
  await expect(content).toBeVisible();
  for (const text of facts.text) await expect(content).toContainText(text);
  await expect(content.locator(`[aria-label="${facts.deltaAriaLabel}"]`)).toBeVisible();
}

async function captureAndAssertPrint(page: Page, testInfo: TestInfo, name: string, facts: ComparisonFacts) {
  await page.emulateMedia({ media: "print" });
  await expect(page.getByRole("region", { name: "Report comparison" })).toBeHidden();
  const content = page.getByTestId("report-comparison-content");
  await expect(content).toBeVisible();
  const path = testInfo.outputPath(`${name}.pdf`);
  const pdf = await page.pdf({ format: "Letter", printBackground: true, path });
  expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  const { stdout } = await execFileAsync("pdftotext", [path, "-"]);
  for (const text of facts.text) expect(stdout).toContain(text);
  await page.emulateMedia({ media: "screen" });
}

async function expectDenied(page: Page, path: string) {
  const response = await page.goto(path);
  const deniedByResponse = response?.status() === 404 || response?.status() === 401 || response?.status() === 403;
  const deniedByNavigation = /\/login(?:\?|$)/.test(new URL(page.url()).pathname + new URL(page.url()).search);
  expect(deniedByResponse || deniedByNavigation).toBe(true);
}

let fixture: ReportComparisonFixture;
let fixtureDatabase: PrismaClient | null = null;

test.describe("Report comparison — isolated-database acceptance", () => {
  test.skip(
    !canRunWorkflow,
    `requires managed isolated fixture environment: ${[
      ...missingEnvironment,
      ...(process.env.PLAYWRIGHT_SKIP_WEBSERVER === "1" ? ["PLAYWRIGHT_SKIP_WEBSERVER must not be 1"] : []),
    ].join(", ")}`,
  );

  test.beforeAll(async () => {
    if (!canRunWorkflow) return;
    fixture = fixtureValue();
    if (!featureIsEnabled(fixture)) throw new Error("Report-comparison E2E fixture is not enabled by its exact organization/template canary or global flag.");
    const databaseUrl = requiredValue("E2E_REPORT_COMPARISON_DATABASE_URL");
    if (databaseUrl !== requiredValue("DATABASE_URL")) throw new Error("Report-comparison E2E database must exactly match DATABASE_URL.");
    fixtureDatabase = new PrismaClient({ datasourceUrl: databaseUrl, log: [] });
    const sentinel = await fixtureDatabase.organization.findUnique({
      where: { id: requiredValue("E2E_REPORT_COMPARISON_DISPOSABLE_SENTINEL_ID") },
      select: { name: true, deletedAt: true },
    });
    if (sentinel?.name !== requiredValue("E2E_REPORT_COMPARISON_DISPOSABLE_SENTINEL_VALUE") || sentinel.deletedAt !== null) {
      throw new Error("Disposable report-comparison E2E database sentinel was not found.");
    }
  });

  test.afterAll(async () => {
    await fixtureDatabase?.$disconnect();
  });

  test("coach and admin enter through campaign detail, compare native/imported history, and print the same facts in every launched style", async ({ browser }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "PDF evidence is captured once through Chromium.");
    for (const actor of [
      { key: "coach", credentials: coach, expectedUrl: /\/portal/ },
      { key: "admin", credentials: admin, expectedUrl: /\/admin/ },
    ]) {
      const context = await browser.newContext();
      const page = await context.newPage();
      await loginAs(page, { ...actor.credentials, expectedUrl: actor.expectedUrl });
      for (const style of fixture.styles) {
        const report = await openReportFromCampaignDetail(
          page,
          context,
          actor.key === "coach" ? style.coachCampaignPath : style.adminCampaignPath,
          style.focusRespondentId,
        );
        const picker = report.getByLabel("Compare to previous assessment");
        await expect(picker).toHaveValue(style.mostRecentBaselineId);
        await expect.poll(() => new URL(report.url()).search).toBe("");
        await expect(report.getByTestId("report-comparison-content")).toHaveCount(0);
        for (const candidate of style.baselines) {
          await expect(picker.locator(`option[value="${candidate.submissionId}"]`)).toContainText(candidate.label);
          if (candidate.imported) await expect(picker.locator(`option[value="${candidate.submissionId}"]`)).toContainText("Imported");
        }
        await expect(picker).not.toContainText(style.excludedCandidateLabel);

        for (const candidate of style.baselines) {
          await picker.selectOption(candidate.submissionId);
          await report.getByRole("button", { name: "Compare", exact: true }).click();
          await expect.poll(() => new URL(report.url()).searchParams.get("compareTo")).toBe(candidate.submissionId);
          await assertComparisonFacts(report, candidate.facts);
          await report.getByRole("button", { name: "Remove comparison" }).click();
          await expect.poll(() => new URL(report.url()).search).toBe("");
          await expect(report.getByTestId("report-comparison-content")).toHaveCount(0);
        }

        const native = style.baselines.find((entry) => !entry.imported);
        if (!native) throw new Error(`${style.name} fixture lacks native baseline.`);
        expect(native.facts).toEqual(fixture.styleParityFacts);
        await picker.selectOption(native.submissionId);
        await report.getByRole("button", { name: "Compare", exact: true }).click();
        await assertComparisonFacts(report, native.facts);
        await report.setViewportSize({ width: 1440, height: 1000 });
        await report.screenshot({ path: testInfo.outputPath(`${actor.key}-${style.name}-desktop.png`), fullPage: true });
        await report.setViewportSize({ width: 390, height: 844 });
        expect(await report.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
        await report.screenshot({ path: testInfo.outputPath(`${actor.key}-${style.name}-narrow.png`), fullPage: true });
        await report.setViewportSize({ width: 1440, height: 1000 });
        await captureAndAssertPrint(report, testInfo, `${actor.key}-${style.name}`, native.facts);
        await report.close();
      }
      await context.close();
    }
  });

  test("CEO link exchanges to a clean self-only report and live disclosure/designation revocation denies the cookie", async ({ browser }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "The CEO acceptance flow is exercised once through Chromium.");
    const ceoContext = await browser.newContext();
    const page = await ceoContext.newPage();
    await page.goto(fixture.ceo.invitationPath);
    await expect.poll(() => new URL(page.url()).hash).toBe("");

    const submitted = await browserFetch(page, fixture.ceo.submitPath, { method: "POST", body: fixture.ceo.submitBody });
    expect(submitted.status).toBe(200);
    const selfAccessUrl = (submitted.body as { data?: { ceoSelfAccessUrl?: unknown } } | null)?.data?.ceoSelfAccessUrl;
    expect(typeof selfAccessUrl).toBe("string");
    if (typeof selfAccessUrl !== "string") throw new Error("CEO fixture submission did not receive a self-access URL.");
    await page.goto(selfAccessUrl);
    await expect(page).toHaveURL(new RegExp(`${fixture.ceo.canonicalReportPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`));
    await expect.poll(() => new URL(page.url()).hash).toBe("");
    await expect(page.locator('a[href^="/portal"], a[href^="/admin"]').first()).toHaveCount(0);

    const picker = page.getByLabel("Compare to previous assessment");
    await expect(picker.locator(`option[value="${fixture.ceo.baseline.submissionId}"]`)).toContainText(fixture.ceo.baseline.label);
    await expect(picker).not.toContainText(fixture.ceo.excludedCandidateLabel);
    await expect.poll(() => new URL(page.url()).search).toBe("");
    await expect(page.getByTestId("report-comparison-content")).toHaveCount(0);
    await picker.selectOption(fixture.ceo.baseline.submissionId);
    await page.getByRole("button", { name: "Compare", exact: true }).click();
    await assertComparisonFacts(page, fixture.ceo.baseline.facts);
    await captureAndAssertPrint(page, testInfo, "ceo-self-report", fixture.ceo.baseline.facts);

    for (const path of [
      fixture.ceo.otherRespondentReportPath,
      fixture.ceo.groupReportPath,
      fixture.ceo.trendsPath,
      fixture.ceo.campaignDetailPath,
      fixture.ceo.alteredFocusReportPath,
    ]) await expectDenied(page, path);

    if (!fixtureDatabase) throw new Error("Disposable fixture database was not initialized.");
    await fixtureDatabase.assessmentCampaign.update({
      where: { id: fixture.ceo.campaignId },
      data: { showResultsOnScreen: false, sendResultsToRespondent: false },
    });
    await expectDenied(page, fixture.ceo.canonicalReportPath);
    await fixtureDatabase.assessmentCampaign.update({
      where: { id: fixture.ceo.campaignId },
      data: { showResultsOnScreen: true, sendResultsToRespondent: true },
    });

    const operatorContext = await browser.newContext();
    const operatorPage = await operatorContext.newPage();
    await loginAs(operatorPage, { ...coach, expectedUrl: /\/portal/ });
    const revoked = await browserFetch(operatorPage, `/api/assessment-campaigns/${fixture.ceo.campaignId}/ceo`, {
      method: "POST",
      body: { participantId: null },
    });
    expect(revoked.status).toBe(200);
    await operatorContext.close();
    await expectDenied(page, fixture.ceo.canonicalReportPath);
    await ceoContext.close();
  });

  test("a non-CEO invited submission never receives a self-comparison link", async ({ browser }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "The non-CEO delivery assertion is exercised once through Chromium.");
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(fixture.nonCeo.invitationPath);
    await expect.poll(() => new URL(page.url()).hash).toBe("");
    const submitted = await browserFetch(page, fixture.nonCeo.submitPath, { method: "POST", body: fixture.nonCeo.submitBody });
    expect(submitted.status).toBe(200);
    expect((submitted.body as { data?: { ceoSelfAccessUrl?: unknown } } | null)?.data?.ceoSelfAccessUrl).toBeUndefined();
    await context.close();
  });
});
