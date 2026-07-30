#!/usr/bin/env node

/**
 * Owner-supplied Public-lead attribution backfill.
 *
 * Usage:
 *   node scripts/public-leads-backfill.mjs mappings.json
 *   node scripts/public-leads-backfill.mjs mappings.json --apply --approved-digest=<dry-run digest>
 *
 * mappings.json is an owner-reviewed array of
 * { submissionId, coachId, evidence }. Current email uniqueness is not accepted
 * as evidence and this script never sends email.
 */

import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";

const args = process.argv.slice(2);
const file = args.find((value) => !value.startsWith("--"));
const apply = args.includes("--apply");
const approvedDigest = args
  .find((value) => value.startsWith("--approved-digest="))
  ?.slice("--approved-digest=".length);

if (!file) throw new Error("Mapping file is required");
const mappings = JSON.parse(await readFile(file, "utf8"));
if (!Array.isArray(mappings)) throw new Error("Mapping file must be an array");
const canonical = JSON.stringify(
  [...mappings].sort((a, b) =>
    String(a.submissionId).localeCompare(String(b.submissionId)),
  ),
);
const manifestDigest = createHash("sha256").update(canonical).digest("hex");
const runId = randomUUID();
const prisma = new PrismaClient();

try {
  const assessed = [];
  for (const mapping of mappings) {
    if (
      !mapping ||
      typeof mapping.submissionId !== "string" ||
      typeof mapping.coachId !== "string" ||
      typeof mapping.evidence !== "string" ||
      !mapping.evidence.trim()
    ) {
      assessed.push({ status: "ambiguous" });
      continue;
    }
    const [submission, coach] = await Promise.all([
      prisma.assessmentSubmission.findFirst({
        where: {
          id: mapping.submissionId,
          respondentId: null,
          publicLeadDeletedAt: null,
          referringCoachId: null,
        },
        select: { id: true },
      }),
      prisma.coach.findFirst({
        where: {
          id: mapping.coachId,
          deletedAt: null,
          certificationStatus: "ACTIVE",
          OR: [
            { certificationExpiry: null },
            { certificationExpiry: { gt: new Date() } },
          ],
        },
        select: { id: true, email: true },
      }),
    ]);
    assessed.push(
      submission && coach
        ? { status: "matched", mapping, coach }
        : { status: "unmatched" },
    );
  }

  const counts = {
    matched: assessed.filter((item) => item.status === "matched").length,
    unmatched: assessed.filter((item) => item.status === "unmatched").length,
    ambiguous: assessed.filter((item) => item.status === "ambiguous").length,
  };
  if (!apply) {
    console.log(JSON.stringify({ runId, mode: "DRY_RUN", manifestDigest, counts }));
  } else {
    if (!approvedDigest || approvedDigest !== manifestDigest) {
      throw new Error("Approved digest is missing or does not match");
    }
    await prisma.$transaction(async (tx) => {
      for (const item of assessed) {
        if (item.status !== "matched") continue;
        const coach = await tx.coach.findFirst({
          where: {
            id: item.mapping.coachId,
            deletedAt: null,
            certificationStatus: "ACTIVE",
            OR: [
              { certificationExpiry: null },
              { certificationExpiry: { gt: new Date() } },
            ],
          },
          select: { id: true, email: true },
        });
        if (!coach || coach.email !== item.coach.email) {
          throw new Error("Manifest inputs drifted after dry run");
        }
        const updated = await tx.assessmentSubmission.updateMany({
          where: {
            id: item.mapping.submissionId,
            respondentId: null,
            referringCoachId: null,
            publicLeadDeletedAt: null,
          },
          data: {
            referringCoachId: coach.id,
            referringCoachEmailSnapshot: coach.email.trim().toLowerCase(),
            attributionSource: "APPROVED_BACKFILL",
            publicLeadPolicyVersion:
              process.env.PUBLIC_LEADS_POLICY_VERSION ?? null,
          },
        });
        if (updated.count !== 1) {
          throw new Error("Manifest inputs drifted after dry run");
        }
      }
      await tx.auditLog.create({
        data: {
          entityType: "AssessmentSubmission",
          entityId: runId,
          action: "UPDATE",
          performedBy: "public-leads-backfill",
          changes: JSON.stringify({
            kind: "public-leads-backfill",
            runId,
            manifestDigest,
            counts,
          }),
        },
      });
    });
    console.log(JSON.stringify({ runId, mode: "APPLY", manifestDigest, counts }));
  }
} finally {
  await prisma.$disconnect();
}
