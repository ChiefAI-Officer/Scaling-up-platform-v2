/**
 * One-time script: Backfill approval queue entries for workshops
 * that were created via admin dashboard (missing ApprovalQueue records).
 *
 * Run: npx tsx scripts/backfill-approval-queue.ts
 *
 * Safe to re-run — checks for existing entries before creating.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Scanning for REQUESTED workshops missing approval queue entries...\n");

  // Find all workshops with status REQUESTED
  const requestedWorkshops = await prisma.workshop.findMany({
    where: { status: "INFO_REQUESTED" },
    include: {
      coach: { select: { id: true, firstName: true, lastName: true, email: true } },
    },
  });

  if (requestedWorkshops.length === 0) {
    console.log("No workshops with REQUESTED status found.");
    return;
  }

  console.log(`Found ${requestedWorkshops.length} workshop(s) with REQUESTED status.\n`);

  let created = 0;
  let skipped = 0;

  for (const ws of requestedWorkshops) {
    // Check if approval queue entry already exists
    const existing = await prisma.approvalQueue.findFirst({
      where: { workshopId: ws.id },
    });

    if (existing) {
      console.log(`  SKIP: "${ws.title}" (${ws.workshopCode}) — approval entry already exists (${existing.status})`);
      skipped++;
      continue;
    }

    // Create approval queue entry
    const coachName = ws.coach
      ? `${ws.coach.firstName} ${ws.coach.lastName}`
      : "Unknown Coach";

    await prisma.approvalQueue.create({
      data: {
        type: "WORKSHOP_REQUEST",
        status: "PENDING",
        coachId: ws.coachId,
        workshopId: ws.id,
        requestedBy: coachName,
        requestData: JSON.stringify({
          workshopTitle: ws.title,
          workshopCode: ws.workshopCode,
          format: ws.format,
          eventDate: ws.eventDate,
          createdVia: "BACKFILL_SCRIPT",
        }),
      },
    });

    console.log(`  CREATED: "${ws.title}" (${ws.workshopCode}) — approval queue entry added`);
    created++;
  }

  console.log(`\nSummary:`);
  console.log(`  Created: ${created}`);
  console.log(`  Skipped: ${skipped}`);
  console.log(`  Total REQUESTED workshops: ${requestedWorkshops.length}`);

  if (created > 0) {
    console.log(`\nApproval queue entries created. Go to /admin/approvals to approve them.`);
  }
}

main()
  .catch((e) => {
    console.error("Script failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
