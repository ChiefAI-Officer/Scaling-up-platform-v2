#!/usr/bin/env node
/**
 * Apply a human-reviewed Jeff #83 public-referral ownership mapping.
 *
 * The mapping is the authority; email is validation evidence only. Every row
 * is checked inside one transaction. A missing/non-public submission, missing
 * Coach, absent or conflicting outbox evidence, or existing different owner
 * aborts the entire batch. Writes use a null-owner CAS.
 *
 * Usage (from src/):
 *   node --env-file=.env scripts/apply-public-referral-backfill.mjs \
 *     --mapping /private/tmp/jeff-83-reviewed-mapping.json
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Prisma, PrismaClient } from "@prisma/client";
import core from "./public-referral-backfill-core.cjs";

const { applyReviewedMappings } = core;
const db = new PrismaClient();

function mappingPathFrom(argv) {
  const index = argv.indexOf("--mapping");
  if (index >= 0) return argv[index + 1] ?? "";
  const inline = argv.find((value) => value.startsWith("--mapping="));
  return inline?.slice("--mapping=".length) ?? "";
}

async function main() {
  const rawPath = mappingPathFrom(process.argv.slice(2));
  if (!rawPath) {
    throw new Error(
      "Usage: apply-public-referral-backfill.mjs --mapping /absolute/reviewed-mapping.json",
    );
  }

  const mappingPath = resolve(rawPath);
  const input = JSON.parse(readFileSync(mappingPath, "utf8"));
  const result = await applyReviewedMappings(
    db,
    input,
    async (tx, rows) => {
      const values = Prisma.join(
        rows.map(
          (row) => Prisma.sql`(${row.submissionId}, ${row.coachId})`,
        ),
      );
      return tx.$executeRaw(Prisma.sql`
        UPDATE "assessment_submissions" AS submission
        SET "referringCoachId" = mapping."coachId"
        FROM (VALUES ${values}) AS mapping("submissionId", "coachId")
        WHERE submission."id" = mapping."submissionId"
          AND submission."referringCoachId" IS NULL
      `);
    },
  );

  return { mappingPath, ...result };
}

let committed = false;
try {
  const result = await main();
  committed = true;
  try {
    process.stdout.write(
      `${JSON.stringify({ success: true, ...result }, null, 2)}\n`,
    );
  } catch (error) {
    console.error(
      "Public referral backfill COMMITTED, but writing the success receipt failed:",
      error,
    );
    process.exitCode = 1;
  }
} catch (error) {
  console.error("Public referral backfill aborted; no batch writes applied:");
  console.error(error);
  process.exitCode = 1;
}

try {
  await db.$disconnect();
} catch (error) {
  console.error(
    committed
      ? "Public referral backfill COMMITTED, but database disconnect failed:"
      : "Public referral backfill did not commit, and database disconnect also failed:",
  );
  console.error(error);
  process.exitCode = 1;
}
