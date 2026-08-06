import {
  expect,
  test,
  type BrowserContext,
  type Page,
  type TestInfo,
} from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { loginAs } from "./helpers/auth";
import { runWithReportComparisonCleanup } from "./helpers/report-comparison-cleanup";
import {
  buildReportComparisonFixturePlan,
  REPORT_COMPARISON_FIXTURE_PASSWORD,
  reportComparisonFixtureIdentity,
  reportComparisonInvitationToken,
} from "../scripts/provision-report-comparison-e2e.mjs";

const requiredEnvironment = [
  "DATABASE_URL",
  "ASSESSMENT_REPORT_ACCESS_SECRET",
  "E2E_REPORT_COMPARISON_DATABASE_URL",
  "E2E_REPORT_COMPARISON_DISPOSABLE_SENTINEL_ID",
  "E2E_REPORT_COMPARISON_DISPOSABLE_SENTINEL_VALUE",
] as const;
const missingEnvironment = requiredEnvironment.filter((key) => !process.env[key]);
const canRunWorkflow =
  missingEnvironment.length === 0 &&
  process.env.PLAYWRIGHT_SKIP_WEBSERVER !== "1";

type FixtureStyle = {
  style: "CLASSIC" | "EXECUTIVE_BOARDROOM" | "MODERN_DASHBOARD";
  currentCampaignId: string;
  currentCampaignAlias: string;
  currentRespondentId: string;
  currentSubmissionId: string;
  nonCeoRespondentId: string;
  nativeSubmissionId: string;
  importedSubmissionId: string;
  nativeCampaignName: string;
  importedCampaignName: string;
  otherOrganizationCampaignId: string;
  otherOrganizationRespondentId: string;
  otherOrganizationSubmissionId: string;
  expectedCoverage: string;
};

type SubmissionFixture = {
  style: FixtureStyle;
  excludedDifferentIdentitySubmissionId: string;
  ceoRespondentId: string;
  ceoInvitationId: string;
  ceoRawInvitationToken: string;
  nonCeoRespondentId: string;
  nonCeoInvitationId: string;
  nonCeoRawInvitationToken: string;
};

let fixtureDatabase: PrismaClient | null = null;
let styles: FixtureStyle[] = [];
let submissionFixture: SubmissionFixture | null = null;

function reportPath(style: FixtureStyle, respondentId = style.currentRespondentId) {
  return `/assessments/${style.currentCampaignId}/respondents/${respondentId}/report`;
}

function expectedRenderer(style: FixtureStyle) {
  if (style.style === "CLASSIC") return "branded-report";
  if (style.style === "EXECUTIVE_BOARDROOM") {
    return "executive-boardroom-report";
  }
  return "modern-dashboard-report";
}

async function expectDenied(page: Page, path: string) {
  const response = await page.goto(path);
  expect(
    response?.status() === 404 ||
      response?.status() === 401 ||
      response?.status() === 403 ||
      /\/login/.test(page.url()),
  ).toBe(true);
}

async function openReportFromCampaignDetail(
  context: BrowserContext,
  detailPath: string,
  respondentId: string,
) {
  const detailPage = await context.newPage();
  await detailPage.goto(detailPath);
  const action = detailPage.getByTestId(`view-report-link-${respondentId}`);
  await expect(action).toBeVisible();
  const href = await action.getAttribute("href");
  expect(href).toMatch(/^\/assessments\/[^/]+\/respondents\/[^/]+\/report$/);
  const reportPagePromise = context.waitForEvent("page");
  await action.click();
  const reportPage = await reportPagePromise;
  await reportPage.waitForLoadState("domcontentloaded");
  await detailPage.close();
  return reportPage;
}

async function completeInvitedSurvey(
  page: Page,
  campaignAlias: string,
  rawInvitationToken: string,
) {
  await page.goto(
    `/org-survey/${encodeURIComponent(campaignAlias)}#t=${encodeURIComponent(rawInvitationToken)}`,
  );
  await expect(
    page.getByRole("button", { name: "Start the assessment →" }),
  ).toBeVisible();
  await expect.poll(() => new URL(page.url()).hash).toBe("");
  await page.getByRole("button", { name: "Start the assessment →" }).click();
  const slider = page.locator('input[type="range"]').first();
  await expect(slider).toBeVisible();
  await slider.fill("8");
  await page.getByRole("button", { name: "Submit", exact: true }).click();
  await expect(page.getByTestId("org-survey-results")).toBeVisible();
}

async function exerciseOperatorComparison({
  reportPage,
  style,
  testInfo,
  captureArtifacts,
}: {
  reportPage: Page;
  style: FixtureStyle;
  testInfo: TestInfo;
  captureArtifacts: boolean;
}) {
  await expect(reportPage.getByTestId(expectedRenderer(style))).toBeVisible();
  const picker = reportPage.getByLabel("Compare to previous assessment");
  await expect(picker).toHaveValue(style.nativeSubmissionId);
  await expect(
    picker.locator(`option[value="${style.nativeSubmissionId}"]`),
  ).toContainText(style.nativeCampaignName);
  await expect(
    picker.locator(`option[value="${style.importedSubmissionId}"]`),
  ).toContainText("Imported");
  await expect(
    picker.locator(
      `option[value="${style.otherOrganizationSubmissionId}"]`,
    ),
  ).toHaveCount(0);

  await picker.selectOption(style.nativeSubmissionId);
  await reportPage
    .getByRole("button", { name: "Compare", exact: true })
    .click();
  await expect(reportPage).toHaveURL(
    new RegExp(`compareTo=${style.nativeSubmissionId}`),
  );
  const comparison = reportPage.getByTestId("report-comparison-content");
  await expect(comparison).toContainText(style.expectedCoverage);
  await expect(comparison.getByLabel("increase 10")).toBeVisible();

  await reportPage.getByRole("button", { name: "Change comparison" }).click();
  await reportPage
    .getByLabel("Compare to previous assessment")
    .selectOption(style.importedSubmissionId);
  await reportPage
    .getByRole("button", { name: "Compare", exact: true })
    .click();
  await expect(
    reportPage.getByTestId("report-comparison-cover-subtitle"),
  ).toContainText("Imported");

  if (captureArtifacts) {
    await reportPage.setViewportSize({ width: 1440, height: 1000 });
    await reportPage.screenshot({
      path: testInfo.outputPath(`${style.style}-1440.png`),
      fullPage: true,
    });
    await reportPage.setViewportSize({ width: 390, height: 844 });
    await reportPage.screenshot({
      path: testInfo.outputPath(`${style.style}-390.png`),
      fullPage: true,
    });
    await reportPage.emulateMedia({ media: "print" });
    await expect(reportPage.getByLabel("Report comparison")).toBeHidden();
    await expect(
      reportPage.getByTestId("report-comparison-content"),
    ).toBeVisible();
    const pdf = await reportPage.pdf({
      path: testInfo.outputPath(`${style.style}.pdf`),
      format: "Letter",
      printBackground: true,
    });
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
    expect(pdf.length).toBeGreaterThan(1_000);
    await reportPage.emulateMedia({ media: "screen" });
  }

  await reportPage.getByRole("button", { name: "Remove comparison" }).click();
  await expect(reportPage).not.toHaveURL(/compareTo=/);
  await expect(
    reportPage.getByTestId("report-comparison-content"),
  ).toHaveCount(0);
}

test.describe("Report comparison — sentinel-provisioned acceptance", () => {
  test.skip(
    !canRunWorkflow,
    `requires managed isolated fixture environment: ${missingEnvironment.join(", ")}`,
  );

  test.beforeAll(async () => {
    if (!canRunWorkflow) return;
    if (process.env.DATABASE_URL !== process.env.E2E_REPORT_COMPARISON_DATABASE_URL) {
      throw new Error(
        "Report-comparison E2E database must exactly match DATABASE_URL.",
      );
    }
    fixtureDatabase = new PrismaClient({
      datasourceUrl: process.env.DATABASE_URL,
      log: [],
    });
    const fixture = buildReportComparisonFixturePlan();
    const sentinel = await fixtureDatabase.organization.findUnique({
      where: { id: process.env.E2E_REPORT_COMPARISON_DISPOSABLE_SENTINEL_ID },
      select: { name: true, deletedAt: true },
    });
    if (
      !sentinel ||
      sentinel.name !==
        process.env.E2E_REPORT_COMPARISON_DISPOSABLE_SENTINEL_VALUE ||
      sentinel.deletedAt !== null
    ) {
      throw new Error(
        "Disposable report-comparison E2E database sentinel was not found.",
      );
    }

    const campaigns = await fixtureDatabase.assessmentCampaign.findMany({
      where: { externalId: { startsWith: fixture.key } },
      include: { participants: true, submissions: true },
    });
    const current = campaigns.filter((campaign) =>
      campaign.externalId?.endsWith(":current"),
    );
    expect(current).toHaveLength(3);
    styles = current
      .map((campaign) => {
        const style = campaign.reportStyle as FixtureStyle["style"];
        const native = campaigns.find(
          (candidate) =>
            candidate.externalId === `${fixture.key}:${style}:native`,
        );
        const imported = campaigns.find(
          (candidate) =>
            candidate.externalId === `${fixture.key}:${style}:imported`,
        );
        const otherOrganization = campaigns.find(
          (candidate) =>
            candidate.externalId === `${fixture.key}:${style}:other-org`,
        );
        const submittedRespondentIds = new Set(
          campaign.submissions.map((submission) => submission.respondentId),
        );
        const ceo = campaign.participants.find(
          (participant) =>
            participant.isCEO &&
            submittedRespondentIds.has(participant.respondentId),
        );
        const nonCeo = campaign.participants.find(
          (participant) =>
            !participant.isCEO &&
            submittedRespondentIds.has(participant.respondentId),
        );
        if (
          !native ||
          !imported ||
          !otherOrganization ||
          !ceo ||
          !nonCeo ||
          !campaign.reportStyleLockedAt ||
          native.importManifest !== null ||
          imported.importManifest === null
        ) {
          throw new Error(
            "Provisioned report-comparison topology is incomplete.",
          );
        }
        const currentSubmission = campaign.submissions.find(
          (submission) => submission.respondentId === ceo.respondentId,
        );
        const nonCeoSubmission = campaign.submissions.find(
          (submission) => submission.respondentId === nonCeo.respondentId,
        );
        const nativeSubmission = native.submissions[0];
        const importedSubmission = imported.submissions[0];
        const otherOrganizationSubmission = otherOrganization.submissions[0];
        const otherOrganizationRespondent =
          otherOrganization.participants.find((participant) => participant.isCEO);
        if (
          !currentSubmission?.invitationId ||
          !nonCeoSubmission?.invitationId ||
          !nativeSubmission?.invitationId ||
          !importedSubmission?.invitationId ||
          !otherOrganizationSubmission?.invitationId ||
          !otherOrganizationRespondent
        ) {
          throw new Error(
            "Provisioned invited submissions must be bound to invitations.",
          );
        }
        const currentQuestions =
          (currentSubmission.result as { perQuestion?: unknown[] }).perQuestion
            ?.length ?? 0;
        const baselineQuestions =
          (nativeSubmission.result as { perQuestion?: unknown[] }).perQuestion
            ?.length ?? 0;
        return {
          style,
          currentCampaignId: campaign.id,
          currentCampaignAlias: campaign.alias,
          currentRespondentId: ceo.respondentId,
          currentSubmissionId: currentSubmission.id,
          nonCeoRespondentId: nonCeo.respondentId,
          nativeSubmissionId: nativeSubmission.id,
          importedSubmissionId: importedSubmission.id,
          nativeCampaignName: native.name,
          importedCampaignName: imported.name,
          otherOrganizationCampaignId: otherOrganization.id,
          otherOrganizationRespondentId: otherOrganizationRespondent.respondentId,
          otherOrganizationSubmissionId: otherOrganizationSubmission.id,
          expectedCoverage: `${Math.min(currentQuestions, baselineQuestions)} of ${currentQuestions} current question${currentQuestions === 1 ? "" : "s"} matched the earlier version.`,
        };
      })
      .sort((left, right) => left.style.localeCompare(right.style));

    const classic = styles.find((style) => style.style === "CLASSIC");
    if (!classic) throw new Error("Classic submission fixture is missing.");
    const submissionCampaign = campaigns.find(
      (campaign) =>
        campaign.externalId === fixture.submissionCampaignExternalId,
    );
    const liveNativeCampaign = campaigns.find(
      (campaign) =>
        campaign.externalId === `${fixture.key}:CLASSIC:live-native`,
    );
    const liveImportedCampaign = campaigns.find(
      (campaign) =>
        campaign.externalId === `${fixture.key}:CLASSIC:live-imported`,
    );
    const liveNativeSubmission = liveNativeCampaign?.submissions[0];
    const liveImportedSubmission = liveImportedCampaign?.submissions[0];
    if (
      !submissionCampaign ||
      submissionCampaign.status !== "ACTIVE" ||
      submissionCampaign.submissions.length !== 0 ||
      !liveNativeCampaign ||
      !liveImportedCampaign ||
      !liveNativeSubmission?.invitationId ||
      !liveImportedSubmission?.invitationId
    ) {
      throw new Error(
        "Separate live-submission focus and baseline campaigns are incomplete.",
      );
    }
    const [pendingCeo, pendingNonCeo] = await Promise.all([
      fixtureDatabase.orgRespondent.findFirst({
        where: {
          externalId: `${fixture.key}:pending-submit-ceo`,
          organization: {
            externalId: fixture.organizationExternalId,
          },
        },
        select: { id: true },
      }),
      fixtureDatabase.orgRespondent.findFirst({
        where: {
          externalId: `${fixture.key}:pending-submit-non-ceo`,
          organization: {
            externalId: fixture.organizationExternalId,
          },
        },
        select: { id: true },
      }),
    ]);
    if (!pendingCeo || !pendingNonCeo) {
      throw new Error("Pending submission respondents are missing.");
    }
    const [ceoInvitation, nonCeoInvitation] = await Promise.all([
      fixtureDatabase.assessmentInvitation.findUnique({
        where: {
          campaignId_respondentId: {
            campaignId: submissionCampaign.id,
            respondentId: pendingCeo.id,
          },
        },
        select: { id: true, status: true, submission: { select: { id: true } } },
      }),
      fixtureDatabase.assessmentInvitation.findUnique({
        where: {
          campaignId_respondentId: {
            campaignId: submissionCampaign.id,
            respondentId: pendingNonCeo.id,
          },
        },
        select: { id: true, status: true, submission: { select: { id: true } } },
      }),
    ]);
    if (
      !ceoInvitation ||
      !nonCeoInvitation ||
      ceoInvitation.status !== "SENT" ||
      nonCeoInvitation.status !== "SENT" ||
      ceoInvitation.submission ||
      nonCeoInvitation.submission
    ) {
      throw new Error(
        "Actual-submission invitations must start pending and unsubmitted.",
      );
    }
    submissionFixture = {
      style: {
        ...classic,
        currentCampaignId: submissionCampaign.id,
        currentCampaignAlias: submissionCampaign.alias,
        currentRespondentId: pendingCeo.id,
        currentSubmissionId: "",
        nativeSubmissionId: liveNativeSubmission.id,
        importedSubmissionId: liveImportedSubmission.id,
        nativeCampaignName: liveNativeCampaign.name,
        importedCampaignName: liveImportedCampaign.name,
        expectedCoverage: "1 of 1 current question matched the earlier version.",
      },
      excludedDifferentIdentitySubmissionId: classic.nativeSubmissionId,
      ceoRespondentId: pendingCeo.id,
      ceoInvitationId: ceoInvitation.id,
      ceoRawInvitationToken: reportComparisonInvitationToken(
          fixture,
        "CLASSIC",
        "pending-submit-ceo",
      ),
      nonCeoRespondentId: pendingNonCeo.id,
      nonCeoInvitationId: nonCeoInvitation.id,
      nonCeoRawInvitationToken: reportComparisonInvitationToken(
        fixture,
        "CLASSIC",
        "pending-submit-non-ceo",
      ),
    };

    const sameEmailOtherOrganization =
      await fixtureDatabase.orgRespondent.findFirst({
        where: {
          externalId: `${fixture.key}:CLASSIC:other`,
          normalizedEmail: fixture.styleCeoEmails.CLASSIC,
        },
        select: { organizationId: true },
      });
    expect(sameEmailOtherOrganization).not.toBeNull();
  });

  test.afterAll(async () => {
    await fixtureDatabase?.$disconnect();
  });

  test("enters through coach/admin actions and verifies native/imported, responsive, print, PDF, and all renderer contracts", async ({
    browser,
  }, testInfo) => {
    test.skip(
      test.info().project.name !== "chromium",
      "Run the fixture workflow once through Chromium.",
    );
    const credentials = reportComparisonFixtureIdentity();
    const coachContext = await browser.newContext();
    const adminContext = await browser.newContext();

    await runWithReportComparisonCleanup({
      run: async () => {
        const coachHome = await coachContext.newPage();
        await loginAs(coachHome, {
          email: credentials.coachEmail,
          password: REPORT_COMPARISON_FIXTURE_PASSWORD,
          expectedUrl: /\/portal\//,
        });
        await coachHome.close();

        for (const style of styles) {
          const reportPage = await openReportFromCampaignDetail(
            coachContext,
            `/portal/assessments/${style.currentCampaignId}`,
            style.currentRespondentId,
          );
          await exerciseOperatorComparison({
            reportPage,
            style,
            testInfo,
            captureArtifacts: true,
          });
          await reportPage.close();
        }

        const adminHome = await adminContext.newPage();
        await loginAs(adminHome, {
          email: credentials.adminEmail,
          password: REPORT_COMPARISON_FIXTURE_PASSWORD,
          expectedUrl: /\/admin\//,
        });
        await adminHome.close();
        for (const style of styles) {
          const adminReport = await openReportFromCampaignDetail(
            adminContext,
            `/admin/assessments/campaigns/${style.currentCampaignId}`,
            style.currentRespondentId,
          );
          await exerciseOperatorComparison({
            reportPage: adminReport,
            style,
            testInfo,
            captureArtifacts: false,
          });
          await adminReport.close();
        }
      },
      cleanup: [
        { name: "close coach context", run: () => coachContext.close() },
        { name: "close admin context", run: () => adminContext.close() },
      ],
    });
  });

  test("submits real CEO/non-CEO invitations, exposes only the CEO clean comparison link, denies lateral access, and revokes facts independently", async ({
    browser,
  }) => {
    test.skip(
      test.info().project.name !== "chromium",
      "Run the fixture workflow once through Chromium.",
    );
    if (!submissionFixture || !fixtureDatabase) {
      throw new Error("Missing provisioned submission fixture.");
    }
    const fixture = submissionFixture;
    const database = fixtureDatabase;
    const [campaign, participant] = await Promise.all([
      database.assessmentCampaign.findUniqueOrThrow({
        where: { id: fixture.style.currentCampaignId },
        select: {
          showResultsOnScreen: true,
          sendResultsToRespondent: true,
          reportStyleLockedAt: true,
        },
      }),
      database.assessmentCampaignParticipant.findUniqueOrThrow({
        where: {
          campaignId_respondentId: {
            campaignId: fixture.style.currentCampaignId,
            respondentId: fixture.ceoRespondentId,
          },
        },
        select: { isCEO: true },
      }),
    ]);
    const ceoContext = await browser.newContext();
    const nonCeoContext = await browser.newContext();

    await runWithReportComparisonCleanup({
      run: async () => {
        const ceoPage = await ceoContext.newPage();
        await completeInvitedSurvey(
          ceoPage,
          fixture.style.currentCampaignAlias,
          fixture.ceoRawInvitationToken,
        );
        const comparisonLink = ceoPage.getByRole("link", {
          name: "Compare with a previous assessment",
        });
        await expect(comparisonLink).toBeVisible();
        const cleanHref = await comparisonLink.getAttribute("href");
        expect(cleanHref).toBe(
          reportPath(fixture.style, fixture.ceoRespondentId),
        );
        expect(cleanHref).not.toContain("#");
        expect(await ceoPage.locator("body").innerText()).not.toContain(
          fixture.ceoRawInvitationToken,
        );
        await comparisonLink.click();
        await expect(ceoPage).toHaveURL(
          new RegExp(
            `${reportPath(fixture.style, fixture.ceoRespondentId)}$`,
          ),
        );
        await expect.poll(() => new URL(ceoPage.url()).hash).toBe("");
        const ceoPicker = ceoPage.getByLabel(
          "Compare to previous assessment",
        );
        await expect(ceoPicker).toHaveValue(
          fixture.style.nativeSubmissionId,
        );
        await expect(
          ceoPicker.locator(
            `option[value="${fixture.style.nativeSubmissionId}"]`,
          ),
        ).toContainText(fixture.style.nativeCampaignName);
        await expect(
          ceoPicker.locator(
            `option[value="${fixture.style.importedSubmissionId}"]`,
          ),
        ).toContainText("Imported");
        await expect(
          ceoPicker.locator(
            `option[value="${fixture.excludedDifferentIdentitySubmissionId}"]`,
          ),
        ).toHaveCount(0);
        await expect(
          ceoPicker.locator(
            `option[value="${fixture.style.otherOrganizationSubmissionId}"]`,
          ),
        ).toHaveCount(0);
        await ceoPicker.selectOption(fixture.style.importedSubmissionId);
        await ceoPage
          .getByRole("button", { name: "Compare", exact: true })
          .click();
        await expect(ceoPage).toHaveURL(
          new RegExp(`compareTo=${fixture.style.importedSubmissionId}`),
        );
        const ceoComparison = ceoPage.getByTestId(
          "report-comparison-content",
        );
        await expect(ceoComparison).toContainText(
          fixture.style.expectedCoverage,
        );
        await expect(ceoComparison.getByLabel("increase 20")).toBeVisible();
        await expect(
          ceoPage.getByTestId("report-comparison-cover-subtitle"),
        ).toContainText("Imported");

        const nonCeoPage = await nonCeoContext.newPage();
        await completeInvitedSurvey(
          nonCeoPage,
          fixture.style.currentCampaignAlias,
          fixture.nonCeoRawInvitationToken,
        );
        await expect(
          nonCeoPage.getByRole("link", {
            name: "Compare with a previous assessment",
          }),
        ).toHaveCount(0);

        for (const denied of [
          reportPath(fixture.style, fixture.nonCeoRespondentId),
          `/assessments/${fixture.style.currentCampaignId}/report`,
          "/portal/assessments/trends",
          `/admin/assessments/campaigns/${fixture.style.currentCampaignId}`,
          reportPath(
            fixture.style,
            `${fixture.ceoRespondentId}-altered`,
          ),
          `/assessments/${fixture.style.otherOrganizationCampaignId}` +
            `/respondents/${fixture.style.otherOrganizationRespondentId}/report`,
        ]) {
          await expectDenied(ceoPage, denied);
        }

        await database.assessmentCampaign.update({
          where: { id: fixture.style.currentCampaignId },
          data: {
            showResultsOnScreen: false,
            sendResultsToRespondent: false,
          },
        });
        await expectDenied(
          ceoPage,
          reportPath(fixture.style, fixture.ceoRespondentId),
        );

        await database.assessmentCampaign.update({
          where: { id: fixture.style.currentCampaignId },
          data: {
            showResultsOnScreen: campaign.showResultsOnScreen,
            sendResultsToRespondent: campaign.sendResultsToRespondent,
          },
        });
        await ceoPage.goto(
          reportPath(fixture.style, fixture.ceoRespondentId),
        );
        await expect(
          ceoPage.getByTestId(expectedRenderer(fixture.style)),
        ).toBeVisible();

        await database.assessmentCampaignParticipant.updateMany({
          where: {
            campaignId: fixture.style.currentCampaignId,
            respondentId: fixture.ceoRespondentId,
          },
          data: { isCEO: false },
        });
        await expectDenied(
          ceoPage,
          reportPath(fixture.style, fixture.ceoRespondentId),
        );
      },
      cleanup: [
        {
          name: "restore campaign disclosure",
          run: async () => {
            await database.assessmentCampaign.update({
              where: { id: fixture.style.currentCampaignId },
              data: {
                showResultsOnScreen: campaign.showResultsOnScreen,
                sendResultsToRespondent: campaign.sendResultsToRespondent,
                reportStyleLockedAt: campaign.reportStyleLockedAt,
              },
            });
          },
        },
        {
          name: "restore CEO designation",
          run: async () => {
            await database.assessmentCampaignParticipant.updateMany({
              where: {
                campaignId: fixture.style.currentCampaignId,
                respondentId: fixture.ceoRespondentId,
              },
              data: { isCEO: participant.isCEO },
            });
          },
        },
        {
          name: "restore pending invitations",
          run: async () => {
            const invitationIds = [
              fixture.ceoInvitationId,
              fixture.nonCeoInvitationId,
            ];
            await database.$transaction(async (tx) => {
              await tx.assessmentSubmission.deleteMany({
                where: { invitationId: { in: invitationIds } },
              });
              await tx.assessmentInvitation.updateMany({
                where: { id: { in: invitationIds } },
                data: {
                  status: "SENT",
                  submittedAt: null,
                  revokedAt: null,
                },
              });
            });
          },
        },
        { name: "close non-CEO context", run: () => nonCeoContext.close() },
        { name: "close CEO context", run: () => ceoContext.close() },
      ],
      onCleanupFailure: (failure) => {
        console.error(
          "Report-comparison fixture cleanup failed after a test failure.",
          failure,
        );
      },
    });
  });
});
