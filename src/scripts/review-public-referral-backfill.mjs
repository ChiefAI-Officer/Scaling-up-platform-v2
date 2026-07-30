#!/usr/bin/env node
/**
 * Read-only candidate report for Jeff #83 historical public referrals.
 *
 * Email equality is evidence only. This script never emits an apply-ready
 * mapping and never writes to the database. A human must confirm identity and
 * create a separate JSON array of { submissionId, coachId } for the apply tool.
 *
 * Usage (from src/):
 *   node --env-file=.env scripts/review-public-referral-backfill.mjs \
 *     > /private/tmp/jeff-83-referral-candidates.json
 */

import { PrismaClient } from "@prisma/client";
import core from "./public-referral-backfill-core.cjs";

const { buildReviewCandidates, normalizedEmail } = core;
const db = new PrismaClient();

async function main() {
  const submissions = await db.assessmentSubmission.findMany({
    where: {
      referringCoachId: null,
      campaign: { accessMode: "PUBLIC" },
      outboxEmails: {
        some: { recipientRole: "REFERRING_COACH" },
      },
    },
    orderBy: [{ submittedAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      submittedAt: true,
      referringCoachId: true,
      referringCoachEmail: true,
      campaign: {
        select: {
          id: true,
          name: true,
          accessMode: true,
          template: { select: { name: true } },
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

  const evidenceEmails = [
    ...new Set(
      submissions.flatMap((submission) =>
        submission.outboxEmails
          .map((row) => normalizedEmail(row.recipientEmail))
          .filter(Boolean),
      ),
    ),
  ];
  const coaches =
    evidenceEmails.length === 0
      ? []
      : await db.coach.findMany({
          where: {
            OR: evidenceEmails.map((email) => ({
              email: { equals: email, mode: "insensitive" },
            })),
          },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        });

  const report = buildReviewCandidates(submissions, coaches);
  process.stdout.write(
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        notice:
          "REVIEW ONLY: confirm identity, then create a separate explicit submissionId-to-coachId mapping. Do not feed this file to the apply script.",
        ...report,
      },
      null,
      2,
    )}\n`,
  );
}

main()
  .catch((error) => {
    console.error(
      "Failed to review public referral backfill candidates:",
      error,
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
