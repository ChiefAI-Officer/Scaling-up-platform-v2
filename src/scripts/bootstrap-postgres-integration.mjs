#!/usr/bin/env node
/**
 * Builds the disposable PostgreSQL schema used by the integration-test lane.
 *
 * The repository's legacy migration history cannot construct a database from
 * scratch, so this CI-only bootstrap synchronizes the current Prisma schema and
 * then applies the hand-written v7.6 indexes/trigger directly from the real
 * checked-in migration. It must never target a remote or shared database.
 */

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = resolve(SCRIPT_DIRECTORY, "..");
const MIGRATION_PATH = resolve(
  APP_ROOT,
  "prisma",
  "migrations",
  "20260514230000_add_assessment_infrastructure_v7_5",
  "migration.sql",
);

export const RAW_SQL_SECTION_MARKER =
  "-- v7.6: Hand-edited raw SQL (partial indexes, GIN index, immutability trigger)";

const REQUIRED_INVARIANTS = [
  'CREATE UNIQUE INDEX "organizations_externalId_unique"',
  'CREATE UNIQUE INDEX "assessment_submissions_campaign_respondent_unique"',
  'CREATE UNIQUE INDEX "assessment_submissions_results_token_hash_unique"',
  'CREATE UNIQUE INDEX "assessment_campaign_participants_ceo_unique"',
  'CREATE INDEX "assessment_campaign_participants_team_path_gin"',
  'CREATE UNIQUE INDEX "access_groups_name_active_unique"',
  "CREATE TRIGGER assessment_template_version_immutability_trigger",
];

export function extractAssessmentInvariantSql(migrationSql) {
  const markerOffsets = [];
  let searchOffset = 0;

  while (true) {
    const markerOffset = migrationSql.indexOf(
      RAW_SQL_SECTION_MARKER,
      searchOffset,
    );
    if (markerOffset === -1) break;
    markerOffsets.push(markerOffset);
    searchOffset = markerOffset + RAW_SQL_SECTION_MARKER.length;
  }

  if (markerOffsets.length !== 1) {
    throw new Error(
      `Expected the v7.6 raw-SQL section marker exactly once; found ${markerOffsets.length}`,
    );
  }

  const invariantSql = migrationSql.slice(markerOffsets[0]);
  for (const invariant of REQUIRED_INVARIANTS) {
    if (!invariantSql.includes(invariant)) {
      throw new Error(
        `The checked-in v7.6 raw-SQL section is missing: ${invariant}`,
      );
    }
  }

  return invariantSql;
}

export function validateBootstrapEnvironment(env) {
  if (
    env.ASSESSMENT_EMAIL_LEASE_TEST_ALLOW !== "isolated-schema"
  ) {
    throw new Error(
      "Set ASSESSMENT_EMAIL_LEASE_TEST_ALLOW=isolated-schema to bootstrap the disposable test database",
    );
  }

  const testDatabaseUrl = env.TEST_DATABASE_URL;
  if (!testDatabaseUrl) {
    throw new Error("TEST_DATABASE_URL is required");
  }
  if (!env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL is required so the isolated target can be checked for inequality",
    );
  }
  if (testDatabaseUrl === env.DATABASE_URL) {
    throw new Error("TEST_DATABASE_URL must not equal DATABASE_URL");
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(testDatabaseUrl);
  } catch {
    throw new Error("TEST_DATABASE_URL must be a valid PostgreSQL URL");
  }
  if (!["postgres:", "postgresql:"].includes(parsedUrl.protocol)) {
    throw new Error("TEST_DATABASE_URL must be a PostgreSQL URL");
  }
  if (!["localhost", "127.0.0.1", "::1"].includes(parsedUrl.hostname)) {
    throw new Error(
      "TEST_DATABASE_URL must use a local PostgreSQL host for this CI-only bootstrap",
    );
  }

  return testDatabaseUrl;
}

function runPrisma(args, testDatabaseUrl, input) {
  const npxExecutable = process.platform === "win32" ? "npx.cmd" : "npx";
  const result = spawnSync(
    npxExecutable,
    ["--no-install", "prisma", ...args],
    {
      cwd: APP_ROOT,
      env: {
        ...process.env,
        DATABASE_URL: testDatabaseUrl,
        DIRECT_URL: testDatabaseUrl,
      },
      input,
      stdio: input
        ? ["pipe", "inherit", "inherit"]
        : ["ignore", "inherit", "inherit"],
    },
  );

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`prisma ${args.join(" ")} exited with ${result.status}`);
  }
}

function main() {
  const testDatabaseUrl = validateBootstrapEnvironment(process.env);
  const migrationSql = readFileSync(MIGRATION_PATH, "utf8");
  const invariantSql = extractAssessmentInvariantSql(migrationSql);

  runPrisma(["db", "push", "--skip-generate"], testDatabaseUrl);
  runPrisma(
    ["db", "execute", "--stdin", "--schema", "prisma/schema.prisma"],
    testDatabaseUrl,
    invariantSql,
  );

  console.log(
    "PostgreSQL integration database bootstrapped from the current Prisma schema and checked-in v7.6 invariants.",
  );
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  try {
    main();
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : "PostgreSQL bootstrap failed",
    );
    process.exit(1);
  }
}
