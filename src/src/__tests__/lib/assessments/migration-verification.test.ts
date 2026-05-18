/**
 * Assessment Tool v1 (v7.6) — Migration verification test.
 *
 * Queries pg_indexes and pg_trigger to assert that the hand-edited raw SQL
 * in migration.sql created the required database objects:
 *
 *   1. Partial unique index: organizations_externalId_unique
 *   2. Partial unique index: assessment_submissions_campaign_respondent_unique
 *   3. Partial unique index: assessment_submissions_results_token_hash_unique
 *   4. Partial unique index: assessment_campaign_participants_ceo_unique
 *   5. Partial unique index: access_groups_name_active_unique         (v7.6 new)
 *   6. GIN index:            assessment_campaign_participants_team_path_gin
 *   7. Trigger function:     assessment_template_version_block_published_mutation
 *   8. Trigger:              assessment_template_version_immutability_trigger
 *
 * Requires DATABASE_URL pointing at a Postgres instance where the migration
 * has been applied (`prisma migrate deploy` or `prisma migrate dev`).
 * If DATABASE_URL is missing or the migration has not been applied yet,
 * these tests will fail — that is intentional. CI runs `prisma db push`
 * during build, so once this migration ships, the tests turn green.
 *
 * Companion: ./schema-presence.test.ts asserts the Prisma client exposes
 * delegates for every new model.
 */

import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

afterAll(async () => {
    await db.$disconnect();
});

describe("Assessment v7.6 migration verification", () => {
    describe("partial unique indexes", () => {
        it("organizations_externalId_unique exists", async () => {
            const rows = await db.$queryRawUnsafe<
                Array<{ indexname: string }>
            >(
                `SELECT indexname FROM pg_indexes WHERE indexname = 'organizations_externalId_unique'`,
            );
            expect(rows.length).toBe(1);
        });

        it("assessment_submissions_campaign_respondent_unique exists", async () => {
            const rows = await db.$queryRawUnsafe<
                Array<{ indexname: string }>
            >(
                `SELECT indexname FROM pg_indexes WHERE indexname = 'assessment_submissions_campaign_respondent_unique'`,
            );
            expect(rows.length).toBe(1);
        });

        it("assessment_submissions_results_token_hash_unique exists", async () => {
            const rows = await db.$queryRawUnsafe<
                Array<{ indexname: string }>
            >(
                `SELECT indexname FROM pg_indexes WHERE indexname = 'assessment_submissions_results_token_hash_unique'`,
            );
            expect(rows.length).toBe(1);
        });

        it("assessment_campaign_participants_ceo_unique exists", async () => {
            const rows = await db.$queryRawUnsafe<
                Array<{ indexname: string }>
            >(
                `SELECT indexname FROM pg_indexes WHERE indexname = 'assessment_campaign_participants_ceo_unique'`,
            );
            expect(rows.length).toBe(1);
        });

        it("access_groups_name_active_unique exists (v7.6)", async () => {
            const rows = await db.$queryRawUnsafe<
                Array<{ indexname: string }>
            >(
                `SELECT indexname FROM pg_indexes WHERE indexname = 'access_groups_name_active_unique'`,
            );
            expect(rows.length).toBe(1);
        });
    });

    describe("GIN index on teamPathAtAdd", () => {
        it("assessment_campaign_participants_team_path_gin exists", async () => {
            const rows = await db.$queryRawUnsafe<
                Array<{ indexname: string }>
            >(
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

    // NOTE: Behavioral proofs (e.g. attempting to UPDATE a published row and
    // expecting the exception) are intentionally omitted from this suite to
    // keep it read-only. They live in a separate integration-test file
    // gated on a dedicated test DB connection.
});
