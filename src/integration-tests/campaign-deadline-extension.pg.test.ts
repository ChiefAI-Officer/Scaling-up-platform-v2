import { createHash, randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import {
  classifyInvitationExchangeAvailability,
  confirmStableInvitationToken,
  resolveInvitationByStableTokenHash,
  stageStableInvitationToken,
} from "../src/lib/assessments/stable-invitation-tokens";
import { extendCampaignDeadline } from "../src/lib/assessments/extend-campaign-deadline";

const destructiveOptIn =
  process.env.ASSESSMENT_EMAIL_LEASE_TEST_ALLOW === "isolated-schema";
const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const suffix = randomUUID().replaceAll("-", "");
const id = (name: string) => `tz-${name}-${suffix}`;
const hash = (name: string) => createHash("sha256").update(`${name}-${suffix}`).digest("hex");

describe("campaign deadline extension on PostgreSQL", () => {
  let db: PrismaClient;
  const expiredAt = new Date("2026-09-20T00:00:00.000Z");
  const newCloseAt = new Date("2026-10-16T06:00:00.000Z");
  const now = new Date("2026-09-24T00:00:00.000Z");
  const usableOriginalToken = hash("usable-original");
  const usableToken = hash("usable-reminder");
  const submittedToken = hash("submitted");
  const revokedToken = hash("revoked");

  beforeAll(async () => {
    if (!testDatabaseUrl || !destructiveOptIn) {
      throw new Error(
        "Set TEST_DATABASE_URL and ASSESSMENT_EMAIL_LEASE_TEST_ALLOW=isolated-schema",
      );
    }
    if (testDatabaseUrl === process.env.DATABASE_URL) {
      throw new Error("TEST_DATABASE_URL must not equal DATABASE_URL");
    }
    db = new PrismaClient({ datasources: { db: { url: testDatabaseUrl } } });

    await db.user.create({
      data: { id: id("user"), email: `${id("user")}@example.test`, role: "COACH" },
    });
    await db.coach.create({
      data: {
        id: id("coach"), userId: id("user"), email: `${id("coach")}@example.test`,
        firstName: "Fixture", lastName: "Coach", certificationStatus: "ACTIVE",
      },
    });
    await db.organization.create({
      data: { id: id("org"), name: "Timezone Fixture", ownerCoachId: id("coach"), timezone: "Australia/Sydney" },
    });
    await db.assessmentTemplate.create({
      data: {
        id: id("template"), name: "Fixture", alias: id("template"),
        invitationSubject: "Invitation", invitationBodyMarkdown: "Body", createdBy: id("user"),
      },
    });
    await db.assessmentTemplateVersion.create({
      data: {
        id: id("version"), templateId: id("template"), versionNumber: 1,
        language: "enUS", questions: [], sections: [], scoringConfig: {}, contentHash: hash("content"),
      },
    });
    await db.assessmentCampaign.create({
      data: {
        id: id("campaign"), templateId: id("template"), versionId: id("version"),
        organizationId: id("org"), language: "enUS", alias: id("campaign"),
        name: "Deadline fixture", status: "ACTIVE", openAt: new Date("2026-09-01T00:00:00.000Z"),
        endMode: "ENDS_AFTER", closeAt: expiredAt, timezone: "Australia/Sydney",
        createdBy: id("user"), createdByCoachId: id("coach"),
      },
    });
    await db.orgRespondent.createMany({
      data: ["usable", "submitted", "revoked"].map((name) => ({
        id: id(name), organizationId: id("org"), email: `${id(name)}@example.test`,
        normalizedEmail: `${id(name)}@example.test`, firstName: name, lastName: "Fixture",
        dedupeSource: "email", dedupeValue: `${id(name)}@example.test`,
      })),
    });
    await db.assessmentInvitation.createMany({
      data: [
        {
          id: id("invite-usable"), campaignId: id("campaign"), respondentId: id("usable"),
          tokenHash: usableOriginalToken, status: "SENT", sentAt: new Date("2026-09-01T00:00:00.000Z"),
          expiresAt: expiredAt, stableFallbackTokenHash: usableOriginalToken,
          stableFallbackExpiresAt: expiredAt,
        },
        {
          id: id("invite-submitted"), campaignId: id("campaign"), respondentId: id("submitted"),
          tokenHash: submittedToken, status: "SUBMITTED", submittedAt: new Date("2026-09-10T00:00:00.000Z"),
          expiresAt: expiredAt, stableFallbackTokenHash: submittedToken, stableFallbackExpiresAt: expiredAt,
        },
        {
          id: id("invite-revoked"), campaignId: id("campaign"), respondentId: id("revoked"),
          tokenHash: revokedToken, status: "SENT", sentAt: new Date("2026-09-01T00:00:00.000Z"),
          revokedAt: new Date("2026-09-10T00:00:00.000Z"), expiresAt: expiredAt,
          stableFallbackTokenHash: revokedToken, stableFallbackExpiresAt: expiredAt,
        },
      ],
    });
    await db.assessmentInvitationToken.createMany({
      data: [
        {
          invitationId: id("invite-usable"), tokenHash: usableOriginalToken, sequence: 0,
          expiresAtSnapshot: expiredAt, source: "ORIGINAL", deliveryState: "SENT",
          deliveryConfirmedAt: new Date("2026-09-01T00:00:00.000Z"),
        },
        {
          invitationId: id("invite-submitted"), tokenHash: submittedToken, sequence: 0,
          expiresAtSnapshot: expiredAt, source: "ORIGINAL", deliveryState: "SENT",
        },
        {
          invitationId: id("invite-revoked"), tokenHash: revokedToken, sequence: 0,
          expiresAtSnapshot: expiredAt, source: "ORIGINAL", deliveryState: "SENT",
        },
      ],
    });
    const staged = await stageStableInvitationToken(db, {
      invitationId: id("invite-usable"),
      newTokenHash: usableToken,
      expiresAt: expiredAt,
      source: "REMINDER",
    });
    await confirmStableInvitationToken(db, {
      tokenId: staged.tokenId,
      invitationId: id("invite-usable"),
      confirmedAt: new Date("2026-09-15T00:00:00.000Z"),
      reminder: true,
    });
  });

  afterAll(async () => {
    if (!db) return;
    await db.auditLog.deleteMany({ where: { entityId: id("campaign") } });
    await db.assessmentInvitation.deleteMany({ where: { campaignId: id("campaign") } });
    await db.assessmentCampaign.delete({ where: { id: id("campaign") } });
    await db.assessmentTemplateVersion.delete({ where: { id: id("version") } });
    await db.assessmentTemplate.delete({ where: { id: id("template") } });
    await db.orgRespondent.deleteMany({ where: { organizationId: id("org") } });
    await db.organization.delete({ where: { id: id("org") } });
    await db.coach.delete({ where: { id: id("coach") } });
    await db.user.delete({ where: { id: id("user") } });
    await db.$disconnect();
  });

  it("revives an expired token, advances predecessor metadata, and leaves submitted/revoked rows untouched", async () => {
    const before = await resolveInvitationByStableTokenHash(db, usableToken);
    expect(classifyInvitationExchangeAvailability(before!, now)).toBe("UNAVAILABLE");

    const result = await extendCampaignDeadline(db, {
      campaignId: id("campaign"), newCloseAt, performedBy: `${id("user")}@example.test`,
      now,
    });
    expect(result.affected).toHaveLength(1);

    const after = await resolveInvitationByStableTokenHash(db, usableToken);
    expect(classifyInvitationExchangeAvailability(after!, now)).toBe("USABLE");
    const usable = await db.assessmentInvitation.findUniqueOrThrow({
      where: { id: id("invite-usable") }, include: { tokens: true },
    });
    const reminder = usable.tokens.find(({ sequence }) => sequence === 1);
    expect(reminder?.previousTokenHash).toBe(usableOriginalToken);
    expect(reminder?.previousExpiresAt).toEqual(newCloseAt);
    expect(reminder?.expiresAtSnapshot).toEqual(newCloseAt);
    const submitted = await db.assessmentInvitation.findUniqueOrThrow({
      where: { id: id("invite-submitted") }, include: { tokens: true },
    });
    expect(submitted.expiresAt).toEqual(expiredAt);
    expect(submitted.stableFallbackExpiresAt).toEqual(expiredAt);
    expect(submitted.tokens[0].expiresAtSnapshot).toEqual(expiredAt);
    const revoked = await db.assessmentInvitation.findUniqueOrThrow({
      where: { id: id("invite-revoked") }, include: { tokens: true },
    });
    expect(revoked.expiresAt).toEqual(expiredAt);
    expect(revoked.stableFallbackExpiresAt).toEqual(expiredAt);
    expect(revoked.tokens[0].expiresAtSnapshot).toEqual(expiredAt);
  });
});
