/**
 * One-shot backfill: promote coaches stuck on certificationStatus="PENDING"
 * who already have at least one ACTIVE workshop-type certification.
 *
 * Companion to the auto-promote feature shipped 2026-05-18 (commits
 * 94f067f + 152efee). That route only flips status forward on NEW cert
 * grants — coaches whose certs were granted before that code was live
 * remain PENDING. This script catches those existing rows.
 *
 * Safety:
 *   - Dry-run by default. Pass --apply to actually write.
 *   - Skips DEACTIVATED coaches (matches the route's behavior — explicit
 *     reactivation is required by an admin).
 *   - Each promotion uses an updateMany with the PENDING predicate, so a
 *     concurrent DEACTIVATE between the read and the write is a no-op,
 *     not a stomp.
 *   - Writes one AuditLog row per promotion with the from→to delta plus
 *     the cert IDs that triggered the promotion (for traceability).
 *
 * Run:
 *   npx tsx scripts/backfill-coach-status.ts            # dry-run report
 *   npx tsx scripts/backfill-coach-status.ts --apply    # commit
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const APPLY = process.argv.includes("--apply");
const ACTOR = process.env.BACKFILL_ACTOR_EMAIL ?? "system@backfill-coach-status";

async function main() {
  const mode = APPLY ? "APPLY (writes will commit)" : "DRY-RUN (no writes)";
  console.log(`backfill-coach-status — ${mode}`);
  console.log(`audit performedBy = ${ACTOR}\n`);

  const candidates = await prisma.coach.findMany({
    where: {
      certificationStatus: "PENDING",
      certifications: {
        some: { status: "ACTIVE" },
      },
    },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      certifications: {
        where: { status: "ACTIVE" },
        select: { id: true, workshopTypeId: true },
      },
    },
    orderBy: { lastName: "asc" },
  });

  if (candidates.length === 0) {
    console.log("No PENDING coaches with ACTIVE certs found. Nothing to do.");
    return;
  }

  console.log(`Found ${candidates.length} coach(es) eligible for promotion:\n`);
  for (const c of candidates) {
    const certIds = c.certifications.map((x) => x.workshopTypeId).join(", ");
    console.log(
      `  - ${c.firstName} ${c.lastName} <${c.email}>  (${c.certifications.length} active cert(s): ${certIds})`
    );
  }

  if (!APPLY) {
    console.log(
      `\nDRY-RUN complete. Re-run with --apply to commit ${candidates.length} promotion(s).`
    );
    return;
  }

  console.log("\nApplying promotions...\n");
  let promoted = 0;
  let raceSkipped = 0;

  for (const c of candidates) {
    const result = await prisma.coach.updateMany({
      where: { id: c.id, certificationStatus: "PENDING" },
      data: { certificationStatus: "ACTIVE" },
    });

    if (result.count === 0) {
      console.log(
        `  RACE-SKIP: ${c.firstName} ${c.lastName} — status was no longer PENDING at write time`
      );
      raceSkipped++;
      continue;
    }

    await prisma.auditLog.create({
      data: {
        entityType: "Coach",
        entityId: c.id,
        action: "UPDATE",
        performedBy: ACTOR,
        changes: JSON.stringify({
          certificationStatus: { from: "PENDING", to: "ACTIVE" },
          backfill: true,
          triggerCertIds: c.certifications.map((x) => x.id),
        }),
      },
    });

    console.log(`  PROMOTED: ${c.firstName} ${c.lastName} <${c.email}>`);
    promoted++;
  }

  console.log(`\nDone. Promoted ${promoted}, race-skipped ${raceSkipped}.`);
}

main()
  .catch((err) => {
    console.error("Backfill failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
