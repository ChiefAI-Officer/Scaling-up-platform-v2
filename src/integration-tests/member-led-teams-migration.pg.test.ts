import { readFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";

const destructiveOptIn =
  process.env.ASSESSMENT_EMAIL_LEASE_TEST_ALLOW === "isolated-schema";
const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const schemaName = `member_led_migration_${randomUUID().replaceAll("-", "")}`;

function scopedDatabaseUrl(baseUrl: string): string {
  const url = new URL(baseUrl);
  url.searchParams.set("schema", schemaName);
  return url.toString();
}

describe("member Led-team migration on PostgreSQL", () => {
  let admin: PrismaClient;
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
    admin = new PrismaClient({ datasources: { db: { url: testDatabaseUrl } } });
    db = new PrismaClient({
      datasources: { db: { url: scopedDatabaseUrl(testDatabaseUrl) } },
    });
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schemaName}"`);
    await db.$executeRawUnsafe(`
      CREATE TABLE "organizations" (
        "id" TEXT PRIMARY KEY,
        "deletedAt" TIMESTAMP(3)
      )
    `);
    await db.$executeRawUnsafe(`
      CREATE TABLE "org_teams" (
        "id" TEXT PRIMARY KEY,
        "organizationId" TEXT NOT NULL
      )
    `);
    await db.$executeRawUnsafe(`
      CREATE TABLE "org_respondents" (
        "id" TEXT PRIMARY KEY,
        "organizationId" TEXT NOT NULL,
        "teamId" TEXT,
        "roleType" TEXT,
        "deletedAt" TIMESTAMP(3)
      )
    `);
    await db.$executeRawUnsafe(`
      CREATE TABLE "audit_logs" (
        "id" TEXT PRIMARY KEY,
        "entityType" TEXT NOT NULL,
        "entityId" TEXT NOT NULL,
        "action" TEXT NOT NULL,
        "performedBy" TEXT,
        "changes" TEXT NOT NULL,
        "timestamp" TIMESTAMP(3) NOT NULL
      )
    `);
  });

  afterAll(async () => {
    await db?.$disconnect();
    if (admin) {
      await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
      await admin.$disconnect();
    }
  });

  it("backfills every live team leader and writes one audit receipt per edge", async () => {
    await db.$executeRawUnsafe(
      `INSERT INTO "organizations" ("id", "deletedAt") VALUES ('org-a', NULL)`,
    );
    await db.$executeRawUnsafe(
      `INSERT INTO "org_teams" ("id", "organizationId") VALUES ('sales', 'org-a')`,
    );
    await db.$executeRawUnsafe(`
      INSERT INTO "org_respondents"
        ("id", "organizationId", "teamId", "roleType", "deletedAt")
      VALUES
        ('leader', 'org-a', 'sales', 'teamleader', NULL),
        ('employee', 'org-a', 'sales', 'employee', NULL),
        ('deleted-leader', 'org-a', 'sales', 'teamleader', CURRENT_TIMESTAMP)
    `);

    const migrationSql = readFileSync(
      join(
        process.cwd(),
        "prisma/migrations/20260923143000_add_member_led_teams/migration.sql",
      ),
      "utf8",
    );
    const npxExecutable = process.platform === "win32" ? "npx.cmd" : "npx";
    const migration = spawnSync(
      npxExecutable,
      [
        "--no-install",
        "prisma",
        "db",
        "execute",
        "--stdin",
        "--schema",
        "prisma/schema.prisma",
      ],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          DATABASE_URL: scopedDatabaseUrl(testDatabaseUrl),
          DIRECT_URL: scopedDatabaseUrl(testDatabaseUrl),
        },
        input: migrationSql,
        encoding: "utf8",
      },
    );
    expect(migration.status).toBe(0);

    const ledRows = await db.$queryRawUnsafe<
      Array<{
        respondentId: string;
        teamId: string;
        organizationId: string;
        createdBy: string;
        source: string;
      }>
    >(`
      SELECT "respondentId", "teamId", "organizationId", "createdBy", "source"
      FROM "org_respondent_led_teams"
      ORDER BY "respondentId"
    `);
    expect(ledRows).toEqual([
      {
        respondentId: "leader",
        teamId: "sales",
        organizationId: "org-a",
        createdBy: "SYSTEM",
        source: "backfill-0040",
      },
    ]);

    const audits = await db.$queryRawUnsafe<
      Array<{ entityType: string; entityId: string; action: string; changes: string }>
    >(`
      SELECT "entityType", "entityId", "action", "changes"
      FROM "audit_logs"
      ORDER BY "entityId"
    `);
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      entityType: "OrgRespondentLedTeam",
      entityId: "leader:sales",
      action: "BACKFILL",
    });
    expect(JSON.parse(audits[0].changes)).toEqual({
      respondentId: "leader",
      teamId: "sales",
      reason: "Preserve teamId-derived report scope during ADR-0040 cutover",
    });
  });
});
