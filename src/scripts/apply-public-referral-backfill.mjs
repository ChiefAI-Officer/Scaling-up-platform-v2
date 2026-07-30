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
import { PrismaClient } from "@prisma/client";
import core from "./public-referral-backfill-core.cjs";

const { parseReviewedMappings, validateReviewedMappings } = core;
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
  const mappings = parseReviewedMappings(input);
  const submissionIds = mappings.map((row) => row.submissionId);
  const coachIds = [...new Set(mappings.map((row) => row.coachId))];

  const result = await db.$transaction(async (tx) => {
    const submissions = await tx.assessmentSubmission.findMany({
      where: { id: { in: submissionIds } },
      select: {
        id: true,
        referringCoachId: true,
        referringCoachEmail: true,
        campaign: {
          select: {
            accessMode: true,
          },
        },
        outboxEmails: {
          where: { recipientRole: "REFERRING_COACH" },
          select: {
            recipientRole: true,
            recipientEmail: true,
          },
        },
      },
    });
    const coaches = await tx.coach.findMany({
      where: { id: { in: coachIds } },
      select: { id: true },
    });

    const plan = validateReviewedMappings(
      mappings,
      submissions,
      coaches,
    );
    let updated = 0;
    let alreadyApplied = 0;

    for (const row of plan) {
      if (row.action === "already-applied") {
        alreadyApplied += 1;
        continue;
      }
      const write = await tx.assessmentSubmission.updateMany({
        where: {
          id: row.submissionId,
          referringCoachId: null,
        },
        data: { referringCoachId: row.coachId },
      });
      if (write.count !== 1) {
        throw new Error(
          `Concurrent ownership conflict for submission ${row.submissionId}`,
        );
      }
      updated += 1;
    }

    return { reviewed: plan.length, updated, alreadyApplied };
  });

  process.stdout.write(
    `${JSON.stringify(
      {
        success: true,
        mappingPath,
        ...result,
      },
      null,
      2,
    )}\n`,
  );
}

main()
  .catch((error) => {
    console.error("Public referral backfill aborted; no batch writes applied:");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
