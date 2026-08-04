/**
 * Assessment Tool v1 (v7.6) — PostgreSQL migration verification.
 *
 * Queries pg_indexes and pg_trigger against the explicitly isolated PostgreSQL
 * integration database. CI synchronizes the current Prisma schema to that
 * ephemeral database, then applies the marked v7.6 raw index/trigger section
 * directly from its checked-in migration before this suite runs.
 *
 * The shared opt-in and TEST_DATABASE_URL/DATABASE_URL separation mirror the
 * assessment-email lease suite. This is deliberately not a default Jest test:
 * its assertions require a live PostgreSQL catalog, not a mocked Prisma client.
 */

import { PrismaClient } from "@prisma/client";

const destructiveOptIn =
  process.env.ASSESSMENT_EMAIL_LEASE_TEST_ALLOW === "isolated-schema";
const testDatabaseUrl = process.env.TEST_DATABASE_URL;

describe("Assessment v7.6 migration verification", () => {
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

    db = new PrismaClient({
      datasources: { db: { url: testDatabaseUrl } },
    });
  });

  afterAll(async () => {
    await db?.$disconnect();
  });

  describe("partial unique indexes", () => {
    it("organizations_externalId_unique exists", async () => {
      const rows = await db.$queryRawUnsafe<Array<{ indexname: string }>>(
        `SELECT indexname FROM pg_indexes WHERE indexname = 'organizations_externalId_unique'`,
      );
      expect(rows.length).toBe(1);
    });

    it("assessment_submissions_campaign_respondent_unique exists", async () => {
      const rows = await db.$queryRawUnsafe<Array<{ indexname: string }>>(
        `SELECT indexname FROM pg_indexes WHERE indexname = 'assessment_submissions_campaign_respondent_unique'`,
      );
      expect(rows.length).toBe(1);
    });

    it("assessment_submissions_results_token_hash_unique exists", async () => {
      const rows = await db.$queryRawUnsafe<Array<{ indexname: string }>>(
        `SELECT indexname FROM pg_indexes WHERE indexname = 'assessment_submissions_results_token_hash_unique'`,
      );
      expect(rows.length).toBe(1);
    });

    it("assessment_campaign_participants_ceo_unique exists", async () => {
      const rows = await db.$queryRawUnsafe<Array<{ indexname: string }>>(
        `SELECT indexname FROM pg_indexes WHERE indexname = 'assessment_campaign_participants_ceo_unique'`,
      );
      expect(rows.length).toBe(1);
    });

    it("access_groups_name_active_unique exists (v7.6)", async () => {
      const rows = await db.$queryRawUnsafe<Array<{ indexname: string }>>(
        `SELECT indexname FROM pg_indexes WHERE indexname = 'access_groups_name_active_unique'`,
      );
      expect(rows.length).toBe(1);
    });
  });

  describe("GIN index on teamPathAtAdd", () => {
    it("assessment_campaign_participants_team_path_gin exists", async () => {
      const rows = await db.$queryRawUnsafe<Array<{ indexname: string }>>(
        `SELECT indexname FROM pg_indexes WHERE indexname = 'assessment_campaign_participants_team_path_gin'`,
      );
      expect(rows.length).toBe(1);
    });
  });

  describe("immutability trigger on assessment_template_versions", () => {
    it("trigger function assessment_template_version_block_published_mutation exists", async () => {
      const rows = await db.$queryRawUnsafe<Array<{ proname: string }>>(
        `SELECT proname FROM pg_proc WHERE proname = 'assessment_template_version_block_published_mutation'`,
      );
      expect(rows.length).toBe(1);
    });

    it("trigger assessment_template_version_immutability_trigger is bound to the table", async () => {
      const rows = await db.$queryRawUnsafe<Array<{ tgname: string }>>(
        `SELECT tgname
           FROM pg_trigger
          WHERE tgname = 'assessment_template_version_immutability_trigger'
            AND tgrelid = 'assessment_template_versions'::regclass`,
      );
      expect(rows.length).toBe(1);
    });
  });
});
