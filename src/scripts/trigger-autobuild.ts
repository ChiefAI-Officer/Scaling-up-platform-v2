/**
 * Reset workshop to AWAITING_APPROVAL and trigger auto-build via runAutoBuild.
 * Usage: npx tsx scripts/trigger-autobuild.ts <workshopId>
 *
 * NOTE: This imports the auto-build service using tsx's tsconfig-paths support.
 * Run from the src/ directory.
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const workshopId = process.argv[2];
if (!workshopId) {
    console.error("Usage: npx tsx scripts/trigger-autobuild.ts <workshopId>");
    process.exit(1);
}

async function main() {
    const workshop = await db.workshop.findUnique({
        where: { id: workshopId },
        select: { title: true, status: true },
    });
    if (!workshop) {
        console.error("Workshop not found");
        process.exit(1);
    }
    console.log(`Workshop: ${workshop.title} (status: ${workshop.status})`);

    // Reset status so auto-build can advance to PRE_EVENT
    if (workshop.status !== "AWAITING_APPROVAL") {
        await db.workshop.update({
            where: { id: workshopId },
            data: { status: "AWAITING_APPROVAL" },
        });
        console.log("Status reset to AWAITING_APPROVAL");
    }

    // Dynamic import of auto-build service (uses @/ aliases via tsconfig)
    const { runAutoBuild } = await import("../src/lib/auto-build-service");
    const result = await runAutoBuild(workshopId);
    console.log("\nAuto-build result:", JSON.stringify(result, null, 2));
}

main().catch(console.error).finally(() => db.$disconnect());
