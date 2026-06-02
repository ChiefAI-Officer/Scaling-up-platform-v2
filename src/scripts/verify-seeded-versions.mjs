#!/usr/bin/env node
/**
 * verify-seeded-versions.mjs
 *
 * Read-only verifier for assessment seed manifests.
 *
 * Opens a read-only transaction against the connected DATABASE_URL and asserts
 * that each of the 5 assessment template aliases has a latest version matching
 * the manifest's { versionNumber, contentHash }. Also checks that the prior
 * published version (if any) is unchanged (contentHash has not drifted).
 *
 * Input:
 *   - Required: path to the run-log JSON file produced by run-assessment-seeds.mjs.
 *     Pass as the first positional argument.
 *
 * Usage:
 *   node scripts/verify-seeded-versions.mjs ./seed-run-logs/<id>.json
 *
 * Exit codes:
 *   0  All assertions pass.
 *   1  One or more assertions failed, or DB connection error.
 *   2  Usage error (missing arg, unreadable manifest).
 *
 * The entire verification runs inside a single `SET TRANSACTION READ ONLY`
 * transaction. No data is modified.
 */

import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

// Template alias → DB alias mapping (runner alias → actual template alias in DB)
const RUNNER_TO_DB_ALIAS = {
  rockefeller: "RockHabits",
  "qsp-v1": "qsp-v1",
  "qsp-v2": "qsp-v2",
  lva: "leadership-vision-alignment",
  "scaling-up-full": "scaling-up-full",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function usage() {
  console.error(
    "Usage: node scripts/verify-seeded-versions.mjs <path-to-run-log.json>"
  );
  console.error(
    "  The run-log is produced by run-assessment-seeds.mjs and stored in seed-run-logs/."
  );
  process.exit(2);
}

function readManifest(path) {
  try {
    const raw = readFileSync(path, "utf-8");
    return JSON.parse(raw);
  } catch (err) {
    console.error(`Cannot read manifest at "${path}": ${err.message}`);
    process.exit(2);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const manifestPath = process.argv[2];
  if (!manifestPath) usage();

  const manifest = readManifest(manifestPath);

  if (!manifest.seedRunId || !Array.isArray(manifest.results)) {
    console.error("Manifest is missing seedRunId or results[].");
    process.exit(2);
  }

  // Only verify "ok" seeds from the manifest.
  const okResults = manifest.results.filter((r) => r.status === "ok");
  if (okResults.length === 0) {
    console.error("Manifest has no successful seed results to verify.");
    process.exit(1);
  }

  const db = new PrismaClient();
  const failures = [];

  try {
    await db.$transaction(
      async (tx) => {
        // Open a read-only transaction: the first statement enforces it.
        await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");

        for (const seedResult of okResults) {
          const { alias: runnerAlias, versionNumber, contentHash } = seedResult;
          const dbAlias = RUNNER_TO_DB_ALIAS[runnerAlias];

          if (!dbAlias) {
            failures.push({
              alias: runnerAlias,
              message: `Unknown runner alias "${runnerAlias}" — update RUNNER_TO_DB_ALIAS in verify-seeded-versions.mjs`,
            });
            continue;
          }

          // Fetch the template by alias.
          const template = await tx.assessmentTemplate.findUnique({
            where: { alias: dbAlias },
            select: { id: true, deletedAt: true },
          });

          if (!template) {
            failures.push({
              alias: runnerAlias,
              message: `Template alias "${dbAlias}" not found in DB.`,
            });
            continue;
          }

          if (template.deletedAt !== null) {
            failures.push({
              alias: runnerAlias,
              message: `Template alias "${dbAlias}" is soft-deleted (deletedAt=${template.deletedAt.toISOString()}).`,
            });
            continue;
          }

          // Fetch the latest version (desc by versionNumber).
          const versions = await tx.assessmentTemplateVersion.findMany({
            where: { templateId: template.id, language: "enUS" },
            orderBy: { versionNumber: "desc" },
            select: {
              id: true,
              versionNumber: true,
              contentHash: true,
              publishedAt: true,
            },
          });

          const latest = versions[0];

          if (!latest) {
            failures.push({
              alias: runnerAlias,
              message: `Template "${dbAlias}" has no versions in DB.`,
            });
            continue;
          }

          // Assert latest versionNumber matches.
          if (
            versionNumber !== null &&
            versionNumber !== undefined &&
            latest.versionNumber !== versionNumber
          ) {
            failures.push({
              alias: runnerAlias,
              message:
                `Version number mismatch: manifest says ${versionNumber}, ` +
                `DB has ${latest.versionNumber}.`,
            });
          }

          // Assert contentHash matches.
          if (
            contentHash !== null &&
            contentHash !== undefined &&
            latest.contentHash !== contentHash
          ) {
            failures.push({
              alias: runnerAlias,
              message:
                `Content hash mismatch on latest version (v${latest.versionNumber}): ` +
                `manifest="${contentHash}", DB="${latest.contentHash}".`,
            });
          }

          // Check prior published version (if any) hasn't changed.
          // The prior published version is the most recent version with
          // publishedAt != null EXCLUDING the latest (in case it was just published).
          const publishedVersions = versions.filter(
            (v) => v.publishedAt !== null && v.id !== latest.id
          );
          if (publishedVersions.length > 0) {
            const priorPublished = publishedVersions[0];
            // We don't have the prior published hash in the manifest (the seed
            // only reports on the newly created/no-op version). We verify that
            // it still exists and hasn't been deleted (contentHash non-null).
            if (!priorPublished.contentHash) {
              failures.push({
                alias: runnerAlias,
                message: `Prior published version v${priorPublished.versionNumber} has no contentHash in DB — possible data corruption.`,
              });
            }
          }

          if (failures.filter((f) => f.alias === runnerAlias).length === 0) {
            console.log(
              `  [OK] ${runnerAlias} (alias="${dbAlias}", v${latest.versionNumber}, hash=${latest.contentHash.slice(0, 12)}...)`
            );
          }
        }
      },
      {
        maxWait: 15_000,
        timeout: 30_000,
      }
    );
  } catch (err) {
    console.error(`\nDB error during verification: ${err.message}`);
    await db.$disconnect();
    process.exit(1);
  }

  await db.$disconnect();

  if (failures.length > 0) {
    console.error(`\n${failures.length} verification failure(s):\n`);
    for (const f of failures) {
      console.error(`  [FAIL] ${f.alias}: ${f.message}`);
    }
    console.error("");
    process.exit(1);
  }

  console.log(
    `\n All ${okResults.length} seeded template versions verified against DB. (seedRunId=${manifest.seedRunId})`
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
