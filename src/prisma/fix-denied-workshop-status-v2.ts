/**
 * One-time migration: fix workshops stuck at INFO_REQUESTED that were actually denied.
 *
 * Before the DENIED status was introduced, denying a workshop set status="INFO_REQUESTED".
 * This script finds all INFO_REQUESTED workshops that have at least one DENIED approval
 * (WORKSHOP_REQUEST or CUSTOM_PRICING type) and updates them to DENIED.
 *
 * Run once after deploying the DENIED status feature:
 *   npx tsx prisma/fix-denied-workshop-status-v2.ts
 */

import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  // Find workshops stuck at INFO_REQUESTED that have a DENIED approval
  const deniedApprovals = await db.approvalQueue.findMany({
    where: {
      status: "DENIED",
      type: { in: ["WORKSHOP_REQUEST", "CUSTOM_PRICING"] },
      workshopId: { not: null },
      workshop: { status: "INFO_REQUESTED" },
    },
    select: { workshopId: true },
    distinct: ["workshopId"],
  });

  const workshopIds = deniedApprovals
    .map((r) => r.workshopId!)
    .filter(Boolean);

  if (workshopIds.length === 0) {
    console.log("No workshops need updating. All clear.");
    return;
  }

  console.log(`Found ${workshopIds.length} workshop(s) to update: ${workshopIds.join(", ")}`);

  const result = await db.workshop.updateMany({
    where: { id: { in: workshopIds } },
    data: { status: "DENIED" },
  });

  console.log(`Updated ${result.count} workshop(s) from INFO_REQUESTED → DENIED.`);
}

main()
  .catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
