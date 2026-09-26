import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { listMemberReports } from "../src/lib/members/member-reports";

const destructiveOptIn =
  process.env.ASSESSMENT_EMAIL_LEASE_TEST_ALLOW === "isolated-schema";
const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const suffix = randomUUID().replaceAll("-", "");
const memberEmail = `cross-org-member.${suffix}@example.test`;

const ids = {
  user: `report-user-${suffix}`,
  coach: `report-coach-${suffix}`,
  orgA: `report-org-a-${suffix}`,
  orgB: `report-org-b-${suffix}`,
  respondentA: `report-respondent-a-${suffix}`,
  respondentB: `report-respondent-b-${suffix}`,
  template: `report-template-${suffix}`,
  version: `report-version-${suffix}`,
  campaignA: `report-campaign-a-${suffix}`,
  campaignB: `report-campaign-b-${suffix}`,
  submissionA: `report-submission-a-${suffix}`,
  submissionB: `report-submission-b-${suffix}`,
};

describe("member report grouping on PostgreSQL", () => {
  let db: PrismaClient;

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
      data: { id: ids.user, email: `report-owner.${suffix}@example.test` },
    });
    await db.coach.create({
      data: {
        id: ids.coach,
        email: `report-coach.${suffix}@example.test`,
        firstName: "Report",
        lastName: "Owner",
      },
    });
    await db.organization.createMany({
      data: [
        { id: ids.orgA, name: "Acme North", ownerCoachId: ids.coach },
        { id: ids.orgB, name: "Acme South", ownerCoachId: ids.coach },
      ],
    });
    await db.orgRespondent.createMany({
      data: [
        {
          id: ids.respondentA,
          organizationId: ids.orgA,
          email: memberEmail,
          normalizedEmail: memberEmail,
          firstName: "Cross",
          lastName: "Organization",
          dedupeSource: "email",
          dedupeValue: memberEmail,
          roleType: "employee",
        },
        {
          id: ids.respondentB,
          organizationId: ids.orgB,
          email: memberEmail,
          normalizedEmail: memberEmail,
          firstName: "Cross",
          lastName: "Organization",
          dedupeSource: "email",
          dedupeValue: memberEmail,
          roleType: "employee",
        },
      ],
    });
    await db.assessmentTemplate.create({
      data: {
        id: ids.template,
        name: "Integration Assessment",
        alias: `integration-report-${suffix}`,
        description: "PostgreSQL member report grouping fixture",
        invitationSubject: "Your assessment",
        invitationBodyMarkdown: "Complete your assessment.",
        createdBy: ids.user,
      },
    });
    await db.assessmentTemplateVersion.create({
      data: {
        id: ids.version,
        templateId: ids.template,
        versionNumber: 1,
        language: "en",
        questions: [],
        sections: [],
        scoringConfig: {},
        contentHash: `integration-report-${suffix}`,
      },
    });
    await db.assessmentCampaign.createMany({
      data: [
        {
          id: ids.campaignA,
          templateId: ids.template,
          versionId: ids.version,
          organizationId: ids.orgA,
          language: "en",
          alias: `integration-report-a-${suffix}`,
          name: "Quarterly Review",
          status: "CLOSED",
          accessMode: "INVITED",
          openAt: new Date("2026-08-01T00:00:00Z"),
          endMode: "OPEN_END",
          closedAt: new Date("2026-09-01T00:00:00Z"),
          createdBy: ids.user,
          createdByCoachId: ids.coach,
        },
        {
          id: ids.campaignB,
          templateId: ids.template,
          versionId: ids.version,
          organizationId: ids.orgB,
          language: "en",
          alias: `integration-report-b-${suffix}`,
          name: "Quarterly Review",
          status: "CLOSED",
          accessMode: "INVITED",
          openAt: new Date("2026-08-01T00:00:00Z"),
          endMode: "OPEN_END",
          closedAt: new Date("2026-09-02T00:00:00Z"),
          createdBy: ids.user,
          createdByCoachId: ids.coach,
        },
      ],
    });
    await db.assessmentSubmission.createMany({
      data: [
        {
          id: ids.submissionA,
          campaignId: ids.campaignA,
          respondentId: ids.respondentA,
          submittedAt: new Date("2026-09-01T00:00:00Z"),
          answers: [],
          result: {},
        },
        {
          id: ids.submissionB,
          campaignId: ids.campaignB,
          respondentId: ids.respondentB,
          submittedAt: new Date("2026-09-02T00:00:00Z"),
          answers: [],
          result: {},
        },
      ],
    });
  });

  afterAll(async () => {
    if (!db) return;
    await db.assessmentSubmission.deleteMany({
      where: { id: { in: [ids.submissionA, ids.submissionB] } },
    });
    await db.assessmentCampaign.deleteMany({
      where: { id: { in: [ids.campaignA, ids.campaignB] } },
    });
    await db.assessmentTemplateVersion.deleteMany({ where: { id: ids.version } });
    await db.assessmentTemplate.deleteMany({ where: { id: ids.template } });
    await db.orgRespondent.deleteMany({
      where: { id: { in: [ids.respondentA, ids.respondentB] } },
    });
    await db.organization.deleteMany({
      where: { id: { in: [ids.orgA, ids.orgB] } },
    });
    await db.coach.deleteMany({ where: { id: ids.coach } });
    await db.user.deleteMany({ where: { id: ids.user } });
    await db.$disconnect();
  });

  it("partitions same-email identities into their real campaign groups", async () => {
    const result = await listMemberReports(db as never, memberEmail);

    expect(result.groups).toHaveLength(2);
    expect(result.groups.map((group) => group.campaignId)).toEqual([
      ids.campaignB,
      ids.campaignA,
    ]);
    expect(result.groups.map((group) => group.companyName)).toEqual([
      "Acme South",
      "Acme North",
    ]);
    expect(result.groups.map((group) => group.reports[0].submissionId)).toEqual([
      ids.submissionB,
      ids.submissionA,
    ]);
  });
});
