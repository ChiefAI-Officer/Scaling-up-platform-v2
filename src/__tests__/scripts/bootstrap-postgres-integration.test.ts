import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  RAW_SQL_SECTION_MARKER,
  extractAssessmentInvariantSql,
  validateBootstrapEnvironment,
} from "../../scripts/bootstrap-postgres-integration.mjs";

const MIGRATION_PATH = join(
  process.cwd(),
  "prisma",
  "migrations",
  "20260514230000_add_assessment_infrastructure_v7_5",
  "migration.sql",
);

describe("PostgreSQL integration bootstrap", () => {
  test("extracts the exact marked invariant suffix from the checked-in migration", () => {
    const migrationSql = readFileSync(MIGRATION_PATH, "utf8");

    const invariantSql = extractAssessmentInvariantSql(migrationSql);

    expect(invariantSql.startsWith(RAW_SQL_SECTION_MARKER)).toBe(true);
    expect(migrationSql.endsWith(invariantSql)).toBe(true);
    expect(invariantSql).toContain(
      'CREATE UNIQUE INDEX "access_groups_name_active_unique"',
    );
    expect(invariantSql).toContain(
      "CREATE TRIGGER assessment_template_version_immutability_trigger",
    );
    expect(invariantSql).not.toContain('CREATE TABLE "organizations"');
  });

  test("rejects a migration without exactly one raw-SQL section marker", () => {
    expect(() => extractAssessmentInvariantSql("SELECT 1;")).toThrow(
      /exactly once/,
    );
    expect(() =>
      extractAssessmentInvariantSql(
        `${RAW_SQL_SECTION_MARKER}\nSELECT 1;\n${RAW_SQL_SECTION_MARKER}\nSELECT 2;`,
      ),
    ).toThrow(/exactly once/);
  });

  test("requires the destructive isolated-schema opt-in", () => {
    expect(() =>
      validateBootstrapEnvironment({
        TEST_DATABASE_URL:
          "postgresql://lease_test:lease_test@localhost:5432/lease_test",
        DATABASE_URL: "postgresql://ci:ci@localhost:5432/ci",
      }),
    ).toThrow(/ASSESSMENT_EMAIL_LEASE_TEST_ALLOW=isolated-schema/);
  });

  test("requires TEST_DATABASE_URL to differ from DATABASE_URL", () => {
    const sharedUrl =
      "postgresql://lease_test:lease_test@localhost:5432/lease_test";

    expect(() =>
      validateBootstrapEnvironment({
        ASSESSMENT_EMAIL_LEASE_TEST_ALLOW: "isolated-schema",
        TEST_DATABASE_URL: sharedUrl,
        DATABASE_URL: sharedUrl,
      }),
    ).toThrow(/must not equal DATABASE_URL/);
  });

  test("rejects a non-local TEST_DATABASE_URL", () => {
    expect(() =>
      validateBootstrapEnvironment({
        ASSESSMENT_EMAIL_LEASE_TEST_ALLOW: "isolated-schema",
        TEST_DATABASE_URL:
          "postgresql://lease_test:lease_test@database.example.com:5432/lease_test",
        DATABASE_URL: "postgresql://ci:ci@localhost:5432/ci",
      }),
    ).toThrow(/local PostgreSQL host/);
  });

  test("accepts an explicitly isolated PostgreSQL target", () => {
    const testDatabaseUrl =
      "postgresql://lease_test:lease_test@localhost:5432/lease_test";

    expect(
      validateBootstrapEnvironment({
        ASSESSMENT_EMAIL_LEASE_TEST_ALLOW: "isolated-schema",
        TEST_DATABASE_URL: testDatabaseUrl,
        DATABASE_URL: "postgresql://ci:ci@localhost:5432/ci",
      }),
    ).toBe(testDatabaseUrl);
  });
});
