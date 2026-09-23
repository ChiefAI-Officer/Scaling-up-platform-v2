import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { scopeForAuthorityMode } from "../src/lib/members/entitlement";
import { createMemberEntitlementReader } from "../src/lib/members/entitlement-reader";
import {
  findMemberLedTeamIntegrityViolations,
  verifyMemberLedTeamsBackfill,
} from "../src/lib/members/led-teams-backfill";
import {
  MemberLedTeamWriteError,
  replaceMemberLedTeams,
  type MemberLedTeamsDb,
} from "../src/lib/members/led-teams";

const destructiveOptIn =
  process.env.ASSESSMENT_EMAIL_LEASE_TEST_ALLOW === "isolated-schema";
const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const suffix = randomUUID().replaceAll("-", "");

const ids = {
  coach: `led-coach-${suffix}`,
  orgA: `led-org-a-${suffix}`,
  orgB: `led-org-b-${suffix}`,
  company: `led-company-${suffix}`,
  sales: `led-sales-${suffix}`,
  sdr: `led-sdr-${suffix}`,
  engineering: `led-engineering-${suffix}`,
  foreign: `led-foreign-${suffix}`,
  dana: `led-dana-${suffix}`,
  sam: `led-sam-${suffix}`,
  riley: `led-riley-${suffix}`,
  jamie: `led-jamie-${suffix}`,
  alex: `led-alex-${suffix}`,
  morgan: `led-morgan-${suffix}`,
  casey: `led-casey-${suffix}`,
  jordan: `led-jordan-${suffix}`,
  foreignMember: `led-foreign-member-${suffix}`,
};

function memberEmail(name: string): string {
  return `${name}.${suffix}@example.test`;
}

describe("member Led teams on PostgreSQL", () => {
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

    await db.coach.create({
      data: {
        id: ids.coach,
        email: memberEmail("coach"),
        firstName: "Fixture",
        lastName: "Coach",
      },
    });
    await db.organization.createMany({
      data: [
        { id: ids.orgA, name: "Led Teams A", ownerCoachId: ids.coach },
        { id: ids.orgB, name: "Led Teams B", ownerCoachId: ids.coach },
      ],
    });
    await db.orgTeam.createMany({
      data: [
        { id: ids.company, organizationId: ids.orgA, name: "Company" },
        { id: ids.sales, organizationId: ids.orgA, parentTeamId: ids.company, name: "Sales" },
        { id: ids.sdr, organizationId: ids.orgA, parentTeamId: ids.sales, name: "SDR" },
        {
          id: ids.engineering,
          organizationId: ids.orgA,
          parentTeamId: ids.company,
          name: "Engineering",
        },
        { id: ids.foreign, organizationId: ids.orgB, name: "Foreign" },
      ],
    });
    await db.orgRespondent.createMany({
      data: [
        [ids.dana, ids.orgA, ids.company, "dana", "ceofounder"],
        [ids.sam, ids.orgA, ids.sales, "sam", "teamleader"],
        [ids.riley, ids.orgA, ids.engineering, "riley", "teamleader"],
        [ids.jamie, ids.orgA, ids.sales, "jamie", "employee"],
        [ids.alex, ids.orgA, ids.sdr, "alex", "employee"],
        [ids.morgan, ids.orgA, ids.engineering, "morgan", "employee"],
        [ids.casey, ids.orgA, null, "casey", "teamleader"],
        [ids.jordan, ids.orgA, ids.company, "jordan", "teamleader"],
        [ids.foreignMember, ids.orgB, ids.foreign, "foreign", "employee"],
      ].map(([id, organizationId, teamId, name, roleType]) => {
        const email = memberEmail(String(name));
        return {
          id: String(id),
          organizationId: String(organizationId),
          teamId: teamId === null ? null : String(teamId),
          email,
          normalizedEmail: email,
          firstName: "Fixture",
          lastName: String(name),
          dedupeSource: "email",
          dedupeValue: email,
          roleType: String(roleType),
        };
      }),
    });
  });

  afterEach(async () => {
    await db.orgRespondentLedTeam.deleteMany({
      where: { organizationId: { in: [ids.orgA, ids.orgB] } },
    });
  });

  afterAll(async () => {
    if (!db) return;
    await db.orgRespondentLedTeam.deleteMany({
      where: { organizationId: { in: [ids.orgA, ids.orgB] } },
    });
    await db.orgRespondent.deleteMany({
      where: { organizationId: { in: [ids.orgA, ids.orgB] } },
    });
    await db.orgTeam.deleteMany({
      where: { organizationId: { in: [ids.orgA, ids.orgB] } },
    });
    await db.organization.deleteMany({ where: { id: { in: [ids.orgA, ids.orgB] } } });
    await db.coach.delete({ where: { id: ids.coach } });
    await db.$disconnect();
  });

  it("validates and persists only same-organization leadership assignments", async () => {
    await expect(
      replaceMemberLedTeams(db as unknown as MemberLedTeamsDb, {
        respondentId: ids.sam,
        teamIds: [ids.sales, ids.engineering, ids.sales],
        createdBy: "fixture-operator",
        source: "coach",
      }),
    ).resolves.toEqual({
      respondentId: ids.sam,
      organizationId: ids.orgA,
      teamIds: [ids.sales, ids.engineering],
    });
    await expect(
      replaceMemberLedTeams(db as unknown as MemberLedTeamsDb, {
        respondentId: ids.jamie,
        teamIds: [ids.sales],
        createdBy: "fixture-operator",
        source: "coach",
      }),
    ).rejects.toEqual(
      expect.objectContaining<MemberLedTeamWriteError>({ code: "level-cannot-lead" }),
    );
    await expect(
      replaceMemberLedTeams(db as unknown as MemberLedTeamsDb, {
        respondentId: ids.sam,
        teamIds: [ids.foreign],
        createdBy: "fixture-operator",
        source: "coach",
      }),
    ).rejects.toEqual(
      expect.objectContaining<MemberLedTeamWriteError>({ code: "cross-organization-team" }),
    );

    const persisted = await db.orgRespondentLedTeam.findMany({
      where: { respondentId: ids.sam },
      orderBy: { teamId: "asc" },
    });
    expect(persisted.map((row) => row.teamId)).toEqual(
      [ids.engineering, ids.sales].sort(),
    );
  });

  it("serializes concurrent replacements instead of merging authority", async () => {
    const functionName = `delay_led_team_insert_${suffix}`;
    const triggerName = `delay_led_team_insert_${suffix}`;
    await db.$executeRawUnsafe(`
      CREATE FUNCTION "${functionName}"() RETURNS trigger AS $$
      BEGIN
        PERFORM pg_sleep(0.15);
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    await db.$executeRawUnsafe(`
      CREATE TRIGGER "${triggerName}"
      BEFORE INSERT ON "org_respondent_led_teams"
      FOR EACH ROW EXECUTE FUNCTION "${functionName}"()
    `);

    try {
      const first = replaceMemberLedTeams(db as unknown as MemberLedTeamsDb, {
        respondentId: ids.sam,
        teamIds: [ids.sales],
        createdBy: "first-operator",
        source: "coach",
      });
      await new Promise((resolve) => setTimeout(resolve, 30));
      const second = replaceMemberLedTeams(db as unknown as MemberLedTeamsDb, {
        respondentId: ids.sam,
        teamIds: [ids.engineering],
        createdBy: "second-operator",
        source: "coach",
      });
      await Promise.all([first, second]);

      const persisted = await db.orgRespondentLedTeam.findMany({
        where: { respondentId: ids.sam },
        select: { teamId: true },
      });
      expect(persisted).toEqual([{ teamId: ids.engineering }]);
    } finally {
      await db.$executeRawUnsafe(
        `DROP TRIGGER IF EXISTS "${triggerName}" ON "org_respondent_led_teams"`,
      );
      await db.$executeRawUnsafe(`DROP FUNCTION IF EXISTS "${functionName}"()`);
    }
  });

  it("proves the backfill keeps every live member's scope identical", async () => {
    await db.orgRespondentLedTeam.createMany({
      data: [
        [ids.sam, ids.sales],
        [ids.riley, ids.engineering],
        [ids.jordan, ids.company],
      ].map(([respondentId, teamId]) => ({
        respondentId,
        teamId,
        organizationId: ids.orgA,
        createdBy: "SYSTEM",
        source: "backfill-0040",
      })),
    });

    await expect(verifyMemberLedTeamsBackfill(db)).resolves.toEqual({
      integrityViolations: [],
      scopeMismatches: [],
    });

    await db.orgRespondentLedTeam.delete({
      where: {
        respondentId_teamId: {
          respondentId: ids.jordan,
          teamId: ids.company,
        },
      },
    });
    const afterMissingEdge = await verifyMemberLedTeamsBackfill(db);
    expect(afterMissingEdge.scopeMismatches.map((row) => row.respondentId)).toEqual([
      ids.jordan,
    ]);
  });

  it("enumerates a persisted cross-organization edge", async () => {
    await db.orgRespondentLedTeam.create({
      data: {
        respondentId: ids.sam,
        teamId: ids.foreign,
        organizationId: ids.orgA,
        createdBy: "SYSTEM",
        source: "backfill-0040",
      },
    });

    await expect(findMemberLedTeamIntegrityViolations(db)).resolves.toEqual([
      {
        respondentId: ids.sam,
        teamId: ids.foreign,
        recordedOrganizationId: ids.orgA,
        respondentOrganizationId: ids.orgA,
        teamOrganizationId: ids.orgB,
      },
    ]);
  });

  it("enforces the Northwind scope after Jordan's inferred edge is removed", async () => {
    await replaceMemberLedTeams(db as unknown as MemberLedTeamsDb, {
      respondentId: ids.sam,
      teamIds: [ids.sales],
      createdBy: "fixture-operator",
      source: "coach",
    });
    await replaceMemberLedTeams(db as unknown as MemberLedTeamsDb, {
      respondentId: ids.riley,
      teamIds: [ids.engineering],
      createdBy: "fixture-operator",
      source: "coach",
    });
    await replaceMemberLedTeams(db as unknown as MemberLedTeamsDb, {
      respondentId: ids.jordan,
      teamIds: [],
      createdBy: "fixture-operator",
      source: "coach",
    });

    const reader = createMemberEntitlementReader(db);
    const scope = (respondentId: string, teamId: string | null, roleType: string) =>
      scopeForAuthorityMode(
        { respondentId, organizationId: ids.orgA, teamId, roleType },
        reader,
        "led-teams",
      );
    await expect(scope(ids.jordan, ids.company, "teamleader")).resolves.toEqual(
      new Set([ids.jordan]),
    );
    await expect(scope(ids.sam, ids.sales, "teamleader")).resolves.toEqual(
      new Set([ids.sam, ids.jamie, ids.alex]),
    );
    await expect(scope(ids.riley, ids.engineering, "teamleader")).resolves.toEqual(
      new Set([ids.riley, ids.morgan]),
    );
    const danaScope = await scope(ids.dana, ids.company, "ceofounder");
    expect(danaScope).toEqual(
      new Set([
        ids.dana,
        ids.sam,
        ids.riley,
        ids.jamie,
        ids.alex,
        ids.morgan,
        ids.casey,
        ids.jordan,
      ]),
    );
    expect(danaScope).not.toContain(ids.foreignMember);
  });
});
