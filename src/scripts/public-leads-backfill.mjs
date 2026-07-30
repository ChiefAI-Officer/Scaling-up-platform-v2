#!/usr/bin/env node

/**
 * Owner-supplied Public-lead attribution backfill.
 *
 * Usage:
 *   node scripts/public-leads-backfill.mjs mappings.json --manifest-out=approved.json
 *   node scripts/public-leads-backfill.mjs approved.json --apply --approved-digest=<dry-run digest>
 *
 * mappings.json is an owner-reviewed array of
 * { submissionId, coachId, evidence }. Current email uniqueness is not accepted
 * as evidence and this script never sends email.
 */

import { createHash, randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";

const args = process.argv.slice(2);
const file = args.find((value) => !value.startsWith("--"));
const apply = args.includes("--apply");
const approvedDigest = args
  .find((value) => value.startsWith("--approved-digest="))
  ?.slice("--approved-digest=".length);
const manifestOut = args
  .find((value) => value.startsWith("--manifest-out="))
  ?.slice("--manifest-out=".length);

if (!file) throw new Error("Mapping file is required");
const input = JSON.parse(await readFile(file, "utf8"));
const approvedManifest =
  input && !Array.isArray(input) && Array.isArray(input.frozenEvidence)
    ? input
    : null;
const mappings = approvedManifest
  ? approvedManifest.frozenEvidence.map((item) => item.mapping)
  : input;
if (!Array.isArray(mappings)) throw new Error("Mapping file must be an array");
const runId = approvedManifest?.runId ?? randomUUID();
const prisma = new PrismaClient();

function enabled(value) {
  return value === "1" || value?.toLowerCase() === "true";
}

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
      assessed.push({ status: "ambiguous", mapping });
      continue;
    }
    const [submission, coach] = await Promise.all([
      prisma.assessmentSubmission.findFirst({
        where: {
          id: mapping.submissionId,
          respondentId: null,
          publicLeadDeletedAt: null,
        },
        select: {
          id: true,
          referringCoachId: true,
          attributionSource: true,
        },
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
        select: {
          id: true,
          email: true,
          certificationStatus: true,
          certificationExpiry: true,
          deletedAt: true,
        },
      }),
    ]);
    const submissionEligible =
      submission !== null &&
      (submission.referringCoachId === null ||
        (submission.referringCoachId === mapping.coachId &&
          submission.attributionSource === "APPROVED_BACKFILL"));
    assessed.push(
      submissionEligible && coach
        ? { status: "matched", mapping, coach }
        : {
            status: "unmatched",
            mapping,
            submissionEligible,
            coachIdentity: coach ?? null,
          },
    );
  }

  // Approval covers the actual identity and eligibility evidence observed by
  // the dry run, not merely the operator's mapping file. Recomputing this on
  // apply makes any coach-email/status or submission-eligibility drift fail
  // the approved-digest comparison.
  const canonical = JSON.stringify(
    [...assessed].sort((a, b) =>
      String(a.mapping?.submissionId ?? "").localeCompare(
        String(b.mapping?.submissionId ?? ""),
      ),
    ),
  );
  const manifestDigest = createHash("sha256").update(canonical).digest("hex");
  const frozenManifest = {
    runId,
    manifestDigest,
    frozenEvidence: assessed,
  };

  const counts = {
    matched: assessed.filter((item) => item.status === "matched").length,
    unmatched: assessed.filter((item) => item.status === "unmatched").length,
    ambiguous: assessed.filter((item) => item.status === "ambiguous").length,
  };
  if (!apply) {
    console.log(
      JSON.stringify({
        ...frozenManifest,
        mode: "DRY_RUN",
        counts,
      }),
    );
    if (manifestOut) {
      await writeFile(manifestOut, `${JSON.stringify(frozenManifest, null, 2)}\n`);
    }
  } else {
    const policyVersion = process.env.PUBLIC_LEADS_POLICY_VERSION?.trim();
    const retentionDays = Number(process.env.PUBLIC_LEADS_RETENTION_DAYS);
    const deletionMode = process.env.PUBLIC_LEADS_DELETION_MODE;
    if (
      !enabled(process.env.PUBLIC_LEADS_POLICY_APPROVED) ||
      !enabled(process.env.PUBLIC_LEADS_DISTRIBUTED_LIMITER_READY) ||
      !policyVersion ||
      !Number.isSafeInteger(retentionDays) ||
      retentionDays <= 0 ||
      !["ANONYMIZE", "DELETE"].includes(deletionMode)
    ) {
      throw new Error("Approved Public-leads policy boundary is unavailable");
    }
    if (
      !approvedManifest ||
      !approvedDigest ||
      approvedDigest !== approvedManifest.manifestDigest ||
      manifestDigest !== approvedManifest.manifestDigest
    ) {
      throw new Error("Approved digest is missing or does not match");
    }
    const batchSize = 100;
    for (let offset = 0; offset < assessed.length; offset += batchSize) {
      const batchIndex = Math.floor(offset / batchSize);
      const checkpointId = `${runId}:${batchIndex}`;
      const checkpoint = await prisma.auditLog.findFirst({
        where: {
          entityType: "AssessmentSubmission",
          entityId: checkpointId,
          action: "PUBLIC_LEADS_BACKFILL_BATCH",
        },
        select: { id: true },
      });
      if (checkpoint) continue;
      const batch = assessed.slice(offset, offset + batchSize);
      await prisma.$transaction(async (tx) => {
      for (const item of batch) {
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
            publicLeadPolicyVersion: policyVersion,
          },
        });
        if (updated.count !== 1) {
          const alreadyApplied = await tx.assessmentSubmission.count({
            where: {
              id: item.mapping.submissionId,
              referringCoachId: coach.id,
              attributionSource: "APPROVED_BACKFILL",
            },
          });
          if (alreadyApplied !== 1) {
            throw new Error("Manifest inputs drifted after dry run");
          }
        }
      }
      await tx.auditLog.create({
        data: {
          entityType: "AssessmentSubmission",
          entityId: checkpointId,
          action: "PUBLIC_LEADS_BACKFILL_BATCH",
          performedBy: "public-leads-backfill",
          changes: JSON.stringify({
            kind: "public-leads-backfill",
            runId,
            batchIndex,
            manifestDigest,
            counts,
          }),
        },
      });
      });
    }
    console.log(JSON.stringify({ runId, mode: "APPLY", manifestDigest, counts }));
  }
} finally {
  await prisma.$disconnect();
}
