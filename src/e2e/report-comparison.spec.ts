import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { loginAs } from "./helpers/auth";
import { runWithReportComparisonCleanup } from "./helpers/report-comparison-cleanup";
import {
  REPORT_COMPARISON_FIXTURE_PASSWORD,
  reportComparisonFixtureIdentity,
} from "../scripts/provision-report-comparison-e2e.mjs";
import { createCeoReportAccessToken } from "../src/lib/assessments/ceo-report-access-token";

const requiredEnvironment = [
  "DATABASE_URL",
  "ASSESSMENT_REPORT_ACCESS_SECRET",
  "E2E_REPORT_COMPARISON_DATABASE_URL",
  "E2E_REPORT_COMPARISON_DISPOSABLE_SENTINEL_ID",
  "E2E_REPORT_COMPARISON_DISPOSABLE_SENTINEL_VALUE",
] as const;
const missingEnvironment = requiredEnvironment.filter((key) => !process.env[key]);
const canRunWorkflow = missingEnvironment.length === 0 && process.env.PLAYWRIGHT_SKIP_WEBSERVER !== "1";

type FixtureStyle = {
  style: "CLASSIC" | "EXECUTIVE_BOARDROOM" | "MODERN_DASHBOARD";
  currentCampaignId: string;
  currentRespondentId: string;
  currentSubmissionId: string;
  currentInvitationId: string;
  nonCeoRespondentId: string;
  nonCeoSubmissionId: string;
  nonCeoInvitationId: string;
  nativeSubmissionId: string;
  importedSubmissionId: string;
  nativeCampaignName: string;
  importedCampaignName: string;
  otherOrganizationSubmissionId: string;
  expectedCoverage: string;
};

let fixtureDatabase: PrismaClient | null = null;
let styles: FixtureStyle[] = [];

function reportPath(style: FixtureStyle) {
  return `/assessments/${style.currentCampaignId}/respondents/${style.currentRespondentId}/report`;
}

function expectedRenderer(style: FixtureStyle) {
  if (style.style === "CLASSIC") return "branded-report";
  if (style.style === "EXECUTIVE_BOARDROOM") return "executive-boardroom-report";
  return "modern-dashboard-report";
}

async function expectDenied(page: Page, path: string) {
  const response = await page.goto(path);
  expect(response?.status() === 404 || response?.status() === 401 || response?.status() === 403 || /\/login/.test(page.url())).toBe(true);
}

test.describe("Report comparison — sentinel-provisioned acceptance", () => {
  test.skip(!canRunWorkflow, `requires managed isolated fixture environment: ${missingEnvironment.join(", ")}`);

  test.beforeAll(async () => {
    if (!canRunWorkflow) return;
    if (process.env.DATABASE_URL !== process.env.E2E_REPORT_COMPARISON_DATABASE_URL) {
      throw new Error("Report-comparison E2E database must exactly match DATABASE_URL.");
    }
    fixtureDatabase = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL, log: [] });
    const fixture = reportComparisonFixtureIdentity();
    const sentinel = await fixtureDatabase.organization.findUnique({
      where: { id: process.env.E2E_REPORT_COMPARISON_DISPOSABLE_SENTINEL_ID },
      select: { name: true, deletedAt: true },
    });
    if (!sentinel || sentinel.name !== process.env.E2E_REPORT_COMPARISON_DISPOSABLE_SENTINEL_VALUE || sentinel.deletedAt !== null) {
      throw new Error("Disposable report-comparison E2E database sentinel was not found.");
    }
    const campaigns = await fixtureDatabase.assessmentCampaign.findMany({
      where: { externalId: { startsWith: fixture.key } },
      include: { participants: true, submissions: true },
    });
    const current = campaigns.filter((campaign) => campaign.externalId?.endsWith(":current"));
    expect(current).toHaveLength(3);
    styles = current.map((campaign) => {
      const style = campaign.reportStyle as FixtureStyle["style"];
      const native = campaigns.find((candidate) => candidate.externalId === `${fixture.key}:${style}:native`);
      const imported = campaigns.find((candidate) => candidate.externalId === `${fixture.key}:${style}:imported`);
      const otherOrganization = campaigns.find((candidate) => candidate.externalId === `${fixture.key}:${style}:other-org`);
      const ceo = campaign.participants.find((participant) => participant.isCEO);
      const nonCeo = campaign.participants.find((participant) => !participant.isCEO);
      if (!native || !imported || !otherOrganization || !ceo || !nonCeo || native.importManifest !== null || imported.importManifest === null) {
        throw new Error("Provisioned report-comparison topology is incomplete.");
      }
      const currentSubmission = campaign.submissions.find((submission) => submission.respondentId === ceo.respondentId);
      const nonCeoSubmission = campaign.submissions.find((submission) => submission.respondentId === nonCeo.respondentId);
      const nativeSubmission = native.submissions[0];
      const importedSubmission = imported.submissions[0];
      const otherOrganizationSubmission = otherOrganization.submissions[0];
      if (!currentSubmission?.invitationId || !nonCeoSubmission?.invitationId || !nativeSubmission?.invitationId || !importedSubmission?.invitationId || !otherOrganizationSubmission?.invitationId) {
        throw new Error("Provisioned invited submissions must be bound to invitations.");
      }
      const currentQuestions = (currentSubmission.result as { perQuestion?: unknown[] }).perQuestion?.length ?? 0;
      const baselineQuestions = (nativeSubmission.result as { perQuestion?: unknown[] }).perQuestion?.length ?? 0;
      return { style, currentCampaignId: campaign.id, currentRespondentId: ceo.respondentId, currentSubmissionId: currentSubmission.id, currentInvitationId: currentSubmission.invitationId, nonCeoRespondentId: nonCeo.respondentId, nonCeoSubmissionId: nonCeoSubmission.id, nonCeoInvitationId: nonCeoSubmission.invitationId, nativeSubmissionId: nativeSubmission.id, importedSubmissionId: importedSubmission.id, nativeCampaignName: native.name, importedCampaignName: imported.name, otherOrganizationSubmissionId: otherOrganizationSubmission.id, expectedCoverage: `${Math.min(currentQuestions, baselineQuestions)} of ${currentQuestions} current question${currentQuestions === 1 ? "" : "s"} matched the earlier version.` };
    });
    const sameEmailOtherOrganization = await fixtureDatabase.orgRespondent.findFirst({
      where: { externalId: `${fixture.key}:other`, normalizedEmail: fixture.ceoEmail },
      select: { organizationId: true },
    });
    expect(sameEmailOtherOrganization).not.toBeNull();
  });

  test.afterAll(async () => { await fixtureDatabase?.$disconnect(); });

  test("derives candidates, coverage, and actual renderer identities from the disposable fixture", async ({ page }) => {
    test.skip(test.info().project.name !== "chromium", "Run the fixture workflow once through Chromium.");
    const credentials = reportComparisonFixtureIdentity();
    await loginAs(page, { email: credentials.adminEmail, password: REPORT_COMPARISON_FIXTURE_PASSWORD, expectedUrl: /\/admin\// });

    for (const style of styles) {
      await page.goto(reportPath(style));
      await expect(page.getByTestId(expectedRenderer(style))).toBeVisible();
      const picker = page.getByLabel("Compare to previous assessment");
      await expect(picker).toHaveValue(style.nativeSubmissionId);
      await expect(picker.locator(`option[value="${style.nativeSubmissionId}"]`)).toContainText(style.nativeCampaignName);
      await expect(picker.locator(`option[value="${style.importedSubmissionId}"]`)).toContainText(style.importedCampaignName);
      await expect(picker.locator(`option[value="${style.importedSubmissionId}"]`)).toContainText("Imported");
      await expect(picker.locator(`option[value="${style.otherOrganizationSubmissionId}"]`)).toHaveCount(0);
      await picker.selectOption(style.nativeSubmissionId);
      await page.getByRole("button", { name: "Compare", exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`compareTo=${style.nativeSubmissionId}`));
      const comparison = page.getByTestId("report-comparison-content");
      await expect(comparison).toContainText(style.expectedCoverage);
      await expect(comparison.getByLabel("increase 10")).toBeVisible();
    }
  });

  test("CEO self access exchanges a real invited submission capability and revokes immediately", async ({ browser }) => {
    test.skip(test.info().project.name !== "chromium", "Run the fixture workflow once through Chromium.");
    const style = styles[0];
    if (!style || !fixtureDatabase) throw new Error("Missing provisioned CEO fixture.");
    const database = fixtureDatabase;
    const [campaign, participant] = await Promise.all([
      database.assessmentCampaign.findUniqueOrThrow({
        where: { id: style.currentCampaignId },
        select: { showResultsOnScreen: true, sendResultsToRespondent: true },
      }),
      database.assessmentCampaignParticipant.findUniqueOrThrow({
        where: { campaignId_respondentId: { campaignId: style.currentCampaignId, respondentId: style.currentRespondentId } },
        select: { isCEO: true },
      }),
    ]);
    const token = createCeoReportAccessToken({ focusCampaignId: style.currentCampaignId, invitationId: style.currentInvitationId, respondentId: style.currentRespondentId });
    const context = await browser.newContext();
    let nonCeoContext: Awaited<ReturnType<typeof browser.newContext>> | undefined;
    await runWithReportComparisonCleanup({
      run: async () => {
        const page = await context.newPage();
        await page.goto(`/assessments/self-report#t=${encodeURIComponent(token)}`);
        await expect(page).toHaveURL(new RegExp(`${reportPath(style)}$`));
        await expect.poll(() => new URL(page.url()).hash).toBe("");
        const picker = page.getByLabel("Compare to previous assessment");
        await expect(picker.locator(`option[value="${style.nativeSubmissionId}"]`)).toBeVisible();
        await expect(picker.locator(`option[value="${style.otherOrganizationSubmissionId}"]`)).toHaveCount(0);
        for (const denied of [
          `/assessments/${style.currentCampaignId}/respondents/${style.nonCeoRespondentId}/report`,
          `/assessments/${style.currentCampaignId}/report`, "/portal/assessments/trends",
          `/admin/assessments/campaigns/${style.currentCampaignId}`,
          `/assessments/${style.currentCampaignId}/respondents/${style.currentRespondentId}-altered/report`,
        ]) await expectDenied(page, denied);
        await database.assessmentCampaign.update({ where: { id: style.currentCampaignId }, data: { showResultsOnScreen: false, sendResultsToRespondent: false } });
        await expectDenied(page, reportPath(style));
        await database.assessmentCampaignParticipant.updateMany({ where: { campaignId: style.currentCampaignId, respondentId: style.currentRespondentId }, data: { isCEO: false } });
        await expectDenied(page, reportPath(style));
        const nonCeoToken = createCeoReportAccessToken({ focusCampaignId: style.currentCampaignId, invitationId: style.nonCeoInvitationId, respondentId: style.nonCeoRespondentId });
        nonCeoContext = await browser.newContext();
        const nonCeoPage = await nonCeoContext.newPage();
        await nonCeoPage.goto(`/assessments/self-report#t=${encodeURIComponent(nonCeoToken)}`);
        await expect(nonCeoPage.getByText("This report link is no longer available.")).toBeVisible();
      },
      cleanup: [
        { name: "restore campaign disclosure", run: async () => { await database.assessmentCampaign.update({ where: { id: style.currentCampaignId }, data: { showResultsOnScreen: campaign.showResultsOnScreen, sendResultsToRespondent: campaign.sendResultsToRespondent } }); } },
        { name: "restore CEO designation", run: async () => { await database.assessmentCampaignParticipant.updateMany({ where: { campaignId: style.currentCampaignId, respondentId: style.currentRespondentId }, data: { isCEO: participant.isCEO } }); } },
        { name: "close non-CEO context", run: async () => { await nonCeoContext?.close(); } },
        { name: "close CEO context", run: async () => { await context.close(); } },
      ],
      onCleanupFailure: (failure) => {
        console.error("Report-comparison fixture cleanup failed after a test failure.", failure);
      },
    });
  });
});
