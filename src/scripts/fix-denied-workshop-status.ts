import { db } from "../src/lib/db";

async function main() {
  // Find all approvalQueue entries where type=WORKSHOP_REQUEST and status=DENIED
  const deniedApprovals = await db.approvalQueue.findMany({
    where: { type: "WORKSHOP_REQUEST", status: "DENIED" },
    select: { workshopId: true },
  });

  const workshopIds = deniedApprovals
    .map((a) => a.workshopId)
    .filter((id): id is string => id !== null);

  if (workshopIds.length === 0) {
    console.log("No denied workshops to fix.");
    return;
  }

  // Update those workshops to INFO_REQUESTED (if not already)
  const result = await db.workshop.updateMany({
    where: {
      id: { in: workshopIds },
      status: { notIn: ["INFO_REQUESTED", "PRE_EVENT", "POST_EVENT", "COMPLETED", "CANCELED"] },
    },
    data: { status: "INFO_REQUESTED" },
  });

  console.log(`Updated ${result.count} workshops to INFO_REQUESTED.`);
  await db.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
