import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { loginAs } from "./helpers/auth";
import {
  REPORT_COMPARISON_FIXTURE_PASSWORD,
  reportComparisonFixtureIdentity,
} from "../scripts/provision-report-comparison-e2e.mjs";

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
  nativeSubmissionId: string;
  importedSubmissionId: string;
  nativeCampaignName: string;
  importedCampaignName: string;
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
    if (sentinel?.name !== process.env.E2E_REPORT_COMPARISON_DISPOSABLE_SENTINEL_VALUE || sentinel.deletedAt !== null) {
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
      const ceo = campaign.participants.find((participant) => participant.isCEO);
      if (!native || !imported || !ceo || native.importManifest !== null || imported.importManifest === null) {
        throw new Error("Provisioned report-comparison topology is incomplete.");
      }
      const nativeSubmission = native.submissions[0];
      const importedSubmission = imported.submissions[0];
      if (!nativeSubmission || !importedSubmission) throw new Error("Provisioned comparison baselines are missing submissions.");
      return { style, currentCampaignId: campaign.id, currentRespondentId: ceo.respondentId, nativeSubmissionId: nativeSubmission.id, importedSubmissionId: importedSubmission.id, nativeCampaignName: native.name, importedCampaignName: imported.name };
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
      await expect(picker.locator(`option[value="${style.nativeSubmissionId}"]`)).toContainText(style.nativeCampaignName);
      await expect(picker.locator(`option[value="${style.importedSubmissionId}"]`)).toContainText(style.importedCampaignName);
      await expect(picker.locator(`option[value="${style.importedSubmissionId}"]`)).toContainText("Imported");
      await picker.selectOption(style.nativeSubmissionId);
      await page.getByRole("button", { name: "Compare", exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`compareTo=${style.nativeSubmissionId}`));
      const comparison = page.getByTestId("report-comparison-content");
      await expect(comparison).toContainText("1 of 1 current question matched the earlier version.");
      await expect(comparison.getByLabel("increase 10")).toBeVisible();
    }
  });
});
