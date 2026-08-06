import { createHash } from "node:crypto";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import reportStyleE2eContract from "./report-style-e2e-server-contract.cjs";

const { assertDisposableReportComparisonDatabase } = reportStyleE2eContract;

export const REPORT_COMPARISON_FIXTURE_PASSWORD = "report-comparison-e2e-password";
const FIXTURE_PREFIX = "e2e-report-comparison:";

export function reportComparisonFixtureIdentity(env = process.env) {
  const sentinelId = env.E2E_REPORT_COMPARISON_DISPOSABLE_SENTINEL_ID;
  if (!sentinelId) throw new Error("Report-comparison E2E fixture requires a disposable sentinel.");
  const suffix = createHash("sha256").update(sentinelId).digest("hex").slice(0, 16);
  const key = `${FIXTURE_PREFIX}${suffix}`;
  return {
    key,
    adminEmail: `report-comparison-admin-${suffix}@fixture.invalid`,
    coachEmail: `report-comparison-coach-${suffix}@fixture.invalid`,
    ceoEmail: `report-comparison-ceo-${suffix}@fixture.invalid`,
  };
}

/**
 * The plan is intentionally data-only so contract tests can prove the required
 * topology without connecting to a database. IDs and report assertions are
 * derived by querying these namespaced rows after provisioning; callers never
 * supply labels, paths, candidate IDs, or renderer facts as opaque JSON.
 */
export function buildReportComparisonFixturePlan(env = process.env) {
  const identity = reportComparisonFixtureIdentity(env);
  return {
    ...identity,
    organizationExternalId: `${identity.key}:organization`,
    otherOrganizationExternalId: `${identity.key}:other-organization`,
    templateAlias: "scaling-up-full",
    styles: [
      ["CLASSIC", "Classic"],
      ["EXECUTIVE_BOARDROOM", "Executive Boardroom"],
      ["MODERN_DASHBOARD", "Modern Dashboard"],
    ],
    roles: [
      "current-ceo",
      "prior-native-ceo",
      "prior-imported-ceo",
      "non-ceo",
      "pending-submit-ceo",
      "pending-submit-non-ceo",
      "other-org-same-email",
    ],
    invitationRoles: [
      "current-ceo",
      "non-ceo",
      "native-prior",
      "imported-prior",
      "pending-submit-ceo",
      "pending-submit-non-ceo",
      "other-org",
    ],
    relationshipContract: {
      everySubmissionHasInvitation: true,
      otherOrganizationHasEligibleHistory: true,
      currentCeoDisclosureEnabled: true,
      actualSubmissionInvitationsStartPending: true,
    },
  };
}

/** Raw tokens exist only in the disposable runner process; the database keeps SHA-256 hashes. */
export function reportComparisonInvitationToken(identity, style, role) {
  return `${identity.key}:${style}:${role}:invitation-token`;
}

function tokenHash(rawToken) {
  return createHash("sha256").update(rawToken, "utf8").digest("hex");
}

function result(score) {
  return {
    scaleUpScore: score,
    overallTotal: score / 10,
    overallAverage: score / 10,
    countAchieved: 1,
    tier: null,
    tierMetricValue: score / 10,
    perDomain: [{ key: "people", averagePoints: score / 10 }],
    perSection: [{ stableKey: "S_E2E", averagePoints: score / 10 }],
    perQuestion: [{ stableKey: "Q_E2E", value: score / 10, achieved: score >= 70 }],
    unansweredKeys: [],
  };
}

async function removePreviousFixture(tx, key) {
  const accessGroups = await tx.accessGroup.findMany({ where: { name: `${key}:access` }, select: { id: true } });
  const accessGroupIds = accessGroups.map(({ id }) => id);
  if (accessGroupIds.length) {
    await tx.accessGroupCoach.deleteMany({ where: { accessGroupId: { in: accessGroupIds } } });
    await tx.accessGroupTemplate.deleteMany({ where: { accessGroupId: { in: accessGroupIds } } });
    await tx.accessGroup.deleteMany({ where: { id: { in: accessGroupIds } } });
  }
  const campaigns = await tx.assessmentCampaign.findMany({
    where: { externalId: { startsWith: key } },
    select: { id: true },
  });
  const campaignIds = campaigns.map(({ id }) => id);
  if (campaignIds.length) {
    await tx.assessmentSubmission.deleteMany({ where: { campaignId: { in: campaignIds } } });
    await tx.assessmentInvitation.deleteMany({ where: { campaignId: { in: campaignIds } } });
    await tx.assessmentCampaignParticipant.deleteMany({ where: { campaignId: { in: campaignIds } } });
    await tx.assessmentCampaign.deleteMany({ where: { id: { in: campaignIds } } });
  }
  const organizations = await tx.organization.findMany({
    where: { externalId: { startsWith: key } }, select: { id: true },
  });
  const organizationIds = organizations.map(({ id }) => id);
  if (organizationIds.length) {
    await tx.orgRespondent.deleteMany({ where: { organizationId: { in: organizationIds } } });
    await tx.orgTeam.deleteMany({ where: { organizationId: { in: organizationIds } } });
    await tx.organization.deleteMany({ where: { id: { in: organizationIds } } });
  }
}

export async function provisionReportComparisonFixture({ env = process.env, createClient = (url) => new PrismaClient({ datasourceUrl: url, log: [] }) } = {}) {
  // This calls the same strict URL + sentinel-row proof as the launcher before
  // opening any fixture mutation transaction.
  await assertDisposableReportComparisonDatabase({ env, createClient });
  const plan = buildReportComparisonFixturePlan(env);
  const client = createClient(env.E2E_REPORT_COMPARISON_DATABASE_URL);
  try {
    const passwordHash = await bcrypt.hash(REPORT_COMPARISON_FIXTURE_PASSWORD, 12);
    await client.$transaction(async (tx) => {
      await removePreviousFixture(tx, plan.key);
      const admin = await tx.user.upsert({ where: { email: plan.adminEmail }, update: { passwordHash, deletedAt: null }, create: { email: plan.adminEmail, name: "Report comparison E2E Admin", role: "ADMIN", passwordHash } });
      const coachUser = await tx.user.upsert({ where: { email: plan.coachEmail }, update: { passwordHash, deletedAt: null }, create: { email: plan.coachEmail, name: "Report comparison E2E Coach", role: "COACH", passwordHash } });
      const coach = await tx.coach.upsert({ where: { email: plan.coachEmail }, update: { userId: coachUser.id }, create: { userId: coachUser.id, email: plan.coachEmail, firstName: "Report", lastName: "Coach" } });
      const [organization, otherOrganization] = await Promise.all([
        tx.organization.create({ data: { externalId: plan.organizationExternalId, name: "Report comparison E2E organization", ownerCoachId: coach.id } }),
        tx.organization.create({ data: { externalId: plan.otherOrganizationExternalId, name: "Report comparison E2E other organization", ownerCoachId: coach.id } }),
      ]);
      const team = await tx.orgTeam.create({ data: { organizationId: organization.id, name: "Leadership" } });
      const [current, nativePrior, importedPrior, nonCeo, pendingSubmitCeo, pendingSubmitNonCeo] = await Promise.all([
        tx.orgRespondent.create({ data: { organizationId: organization.id, teamId: team.id, email: plan.ceoEmail, normalizedEmail: plan.ceoEmail, firstName: "Current", lastName: "CEO", dedupeSource: "external", dedupeValue: `${plan.key}:current`, externalId: `${plan.key}:current` } }),
        tx.orgRespondent.create({ data: { organizationId: organization.id, teamId: team.id, email: plan.ceoEmail, normalizedEmail: plan.ceoEmail, firstName: "Native", lastName: "CEO", dedupeSource: "external", dedupeValue: `${plan.key}:native`, externalId: `${plan.key}:native` } }),
        tx.orgRespondent.create({ data: { organizationId: organization.id, teamId: team.id, email: plan.ceoEmail, normalizedEmail: plan.ceoEmail, firstName: "Imported", lastName: "CEO", dedupeSource: "external", dedupeValue: `${plan.key}:imported`, externalId: `${plan.key}:imported` } }),
        tx.orgRespondent.create({ data: { organizationId: organization.id, teamId: team.id, email: `non-ceo-${plan.ceoEmail}`, normalizedEmail: `non-ceo-${plan.ceoEmail}`, firstName: "Non", lastName: "CEO", dedupeSource: "external", dedupeValue: `${plan.key}:non-ceo`, externalId: `${plan.key}:non-ceo` } }),
        tx.orgRespondent.create({ data: { organizationId: organization.id, teamId: team.id, email: plan.ceoEmail, normalizedEmail: plan.ceoEmail, firstName: "Pending", lastName: "CEO", dedupeSource: "external", dedupeValue: `${plan.key}:pending-submit-ceo`, externalId: `${plan.key}:pending-submit-ceo` } }),
        tx.orgRespondent.create({ data: { organizationId: organization.id, teamId: team.id, email: `pending-non-ceo-${plan.ceoEmail}`, normalizedEmail: `pending-non-ceo-${plan.ceoEmail}`, firstName: "Pending", lastName: "Participant", dedupeSource: "external", dedupeValue: `${plan.key}:pending-submit-non-ceo`, externalId: `${plan.key}:pending-submit-non-ceo` } }),
      ]);
      const otherOrgSameEmail = await tx.orgRespondent.create({ data: { organizationId: otherOrganization.id, email: plan.ceoEmail, normalizedEmail: plan.ceoEmail, firstName: "Other", lastName: "Organization", dedupeSource: "external", dedupeValue: `${plan.key}:other`, externalId: `${plan.key}:other` } });
      const template = await tx.assessmentTemplate.upsert({
        where: { alias: plan.templateAlias },
        update: {},
        create: { alias: plan.templateAlias, name: "Scaling Up Full Assessment", invitationSubject: "Fixture", invitationBodyMarkdown: "Fixture", createdBy: admin.id },
      });
      const latestVersion = await tx.assessmentTemplateVersion.aggregate({
        where: { templateId: template.id, language: "enUS" },
        _max: { versionNumber: true },
      });
      const version = await tx.assessmentTemplateVersion.create({ data: {
        templateId: template.id, versionNumber: Math.max(9000, (latestVersion._max.versionNumber ?? 0) + 1),
        language: "enUS", questions: [{ stableKey: "Q_E2E", label: "Fixture question", type: "SLIDER_LIKERT", sectionStableKey: "S_E2E", sortOrder: 1, isRequired: true, scale: { min: 0, max: 10, step: 1, anchorMin: "Not true", anchorMax: "Completely true" } }],
        sections: [{ stableKey: "S_E2E", name: "Fixture section", domain: "people", sortOrder: 1 }], scoringConfig: {
          tierMetric: "overallAverage",
          passThreshold: 6,
          tiers: [
            { minMetric: 0, maxMetric: 5.99, label: "Priority", message: "Priority" },
            { minMetric: 6, label: "On track", message: "On track" },
          ],
        }, contentHash: createHash("sha256").update(plan.key).digest("hex"), publishedAt: new Date(), publishedBy: admin.id,
      } });
      const group = await tx.accessGroup.create({ data: { name: `${plan.key}:access`, createdBy: admin.id } });
      await tx.accessGroupTemplate.create({ data: { accessGroupId: group.id, templateId: template.id, addedBy: admin.id } });
      await tx.accessGroupCoach.create({ data: { accessGroupId: group.id, coachId: coach.id, addedBy: admin.id } });
      for (const [style, label] of plan.styles) {
        const currentCampaign = await tx.assessmentCampaign.create({ data: { templateId: template.id, versionId: version.id, organizationId: organization.id, language: "enUS", alias: `${plan.key}:${style}:current`, externalId: `${plan.key}:${style}:current`, name: `${label} current`, status: "ACTIVE", accessMode: "INVITED", openAt: new Date("2026-01-01T00:00:00.000Z"), endMode: "OPEN_END", createdBy: admin.id, createdByCoachId: coach.id, reportStyle: style, reportStyleSource: "CAMPAIGN_OVERRIDE", showResultsOnScreen: true, sendResultsToRespondent: true } });
        const nativeCampaign = await tx.assessmentCampaign.create({ data: { templateId: template.id, versionId: version.id, organizationId: organization.id, language: "enUS", alias: `${plan.key}:${style}:native`, externalId: `${plan.key}:${style}:native`, name: `${label} native baseline`, status: "CLOSED", accessMode: "INVITED", openAt: new Date("2025-01-01T00:00:00.000Z"), endMode: "OPEN_END", createdBy: admin.id, createdByCoachId: coach.id, reportStyle: style, reportStyleSource: "CAMPAIGN_OVERRIDE" } });
        const importedCampaign = await tx.assessmentCampaign.create({ data: { templateId: template.id, versionId: version.id, organizationId: organization.id, language: "enUS", alias: `${plan.key}:${style}:imported`, externalId: `${plan.key}:${style}:imported`, name: `${label} imported baseline`, status: "CLOSED", accessMode: "INVITED", openAt: new Date("2024-01-01T00:00:00.000Z"), endMode: "OPEN_END", createdBy: admin.id, createdByCoachId: coach.id, reportStyle: style, reportStyleSource: "CAMPAIGN_OVERRIDE", importManifest: { fixture: true } } });
        const otherOrgCampaign = await tx.assessmentCampaign.create({ data: { templateId: template.id, versionId: version.id, organizationId: otherOrganization.id, language: "enUS", alias: `${plan.key}:${style}:other-org`, externalId: `${plan.key}:${style}:other-org`, name: `${label} other organization baseline`, status: "CLOSED", accessMode: "INVITED", openAt: new Date("2025-06-01T00:00:00.000Z"), endMode: "OPEN_END", createdBy: admin.id, createdByCoachId: coach.id, reportStyle: style, reportStyleSource: "CAMPAIGN_OVERRIDE" } });
        await tx.assessmentCampaignParticipant.createMany({ data: [
          { campaignId: currentCampaign.id, respondentId: current.id, isCEO: true, teamPathAtAdd: [team.id], teamLabelsAtAdd: [team.name] },
          { campaignId: currentCampaign.id, respondentId: nonCeo.id, isCEO: false, teamPathAtAdd: [team.id], teamLabelsAtAdd: [team.name] },
          { campaignId: nativeCampaign.id, respondentId: nativePrior.id, isCEO: true, teamPathAtAdd: [team.id], teamLabelsAtAdd: [team.name] },
          { campaignId: importedCampaign.id, respondentId: importedPrior.id, isCEO: true, teamPathAtAdd: [team.id], teamLabelsAtAdd: [team.name] },
          { campaignId: otherOrgCampaign.id, respondentId: otherOrgSameEmail.id, isCEO: true, teamPathAtAdd: [], teamLabelsAtAdd: [] },
        ] });
        const expiresAt = new Date("2030-01-01T00:00:00.000Z");
        const invitation = async (campaignId, respondentId, role) => tx.assessmentInvitation.create({ data: {
          campaignId, respondentId, tokenHash: tokenHash(reportComparisonInvitationToken(plan, style, role)), status: "SUBMITTED", expiresAt, submittedAt: new Date("2026-02-01T00:00:00.000Z"),
        } });
        const [currentInvitation, nonCeoInvitation, nativeInvitation, importedInvitation, otherOrgInvitation] = await Promise.all([
          invitation(currentCampaign.id, current.id, "current-ceo"), invitation(currentCampaign.id, nonCeo.id, "non-ceo"), invitation(nativeCampaign.id, nativePrior.id, "native-prior"), invitation(importedCampaign.id, importedPrior.id, "imported-prior"), invitation(otherOrgCampaign.id, otherOrgSameEmail.id, "other-org"),
        ]);
        await tx.assessmentSubmission.createMany({ data: [
          { campaignId: currentCampaign.id, respondentId: current.id, invitationId: currentInvitation.id, submittedAt: new Date("2026-02-01T00:00:00.000Z"), answers: [], result: result(80) },
          { campaignId: currentCampaign.id, respondentId: nonCeo.id, invitationId: nonCeoInvitation.id, submittedAt: new Date("2026-02-01T00:00:00.000Z"), answers: [], result: result(65) },
          { campaignId: nativeCampaign.id, respondentId: nativePrior.id, invitationId: nativeInvitation.id, submittedAt: new Date("2025-02-01T00:00:00.000Z"), answers: [], result: result(70) },
          { campaignId: importedCampaign.id, respondentId: importedPrior.id, invitationId: importedInvitation.id, submittedAt: new Date("2024-02-01T00:00:00.000Z"), answers: [], result: result(60) },
          { campaignId: otherOrgCampaign.id, respondentId: otherOrgSameEmail.id, invitationId: otherOrgInvitation.id, submittedAt: new Date("2025-06-01T00:00:00.000Z"), answers: [], result: result(75) },
        ] });
        if (style === "CLASSIC") {
          await tx.assessmentCampaignParticipant.createMany({ data: [
            { campaignId: currentCampaign.id, respondentId: pendingSubmitCeo.id, isCEO: true, teamPathAtAdd: [team.id], teamLabelsAtAdd: [team.name] },
            { campaignId: currentCampaign.id, respondentId: pendingSubmitNonCeo.id, isCEO: false, teamPathAtAdd: [team.id], teamLabelsAtAdd: [team.name] },
          ] });
          await Promise.all([
            tx.assessmentInvitation.create({ data: {
              campaignId: currentCampaign.id,
              respondentId: pendingSubmitCeo.id,
              tokenHash: tokenHash(reportComparisonInvitationToken(plan, style, "pending-submit-ceo")),
              status: "SENT",
              sentAt: new Date("2026-01-02T00:00:00.000Z"),
              expiresAt,
            } }),
            tx.assessmentInvitation.create({ data: {
              campaignId: currentCampaign.id,
              respondentId: pendingSubmitNonCeo.id,
              tokenHash: tokenHash(reportComparisonInvitationToken(plan, style, "pending-submit-non-ceo")),
              status: "SENT",
              sentAt: new Date("2026-01-02T00:00:00.000Z"),
              expiresAt,
            } }),
          ]);
        }
      }
    });
    return plan;
  } finally {
    await client.$disconnect().catch(() => undefined);
  }
}
