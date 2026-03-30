/**
 * Delete existing landing pages for a workshop so auto-build can recreate them.
 * Usage: npx tsx scripts/rebuild-workshop-pages.ts <workshopId>
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const workshopId = process.argv[2];
if (!workshopId) {
    console.error("Usage: npx tsx scripts/rebuild-workshop-pages.ts <workshopId>");
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

    const deleted = await db.landingPage.deleteMany({ where: { workshopId } });
    console.log(`Deleted ${deleted.count} existing landing pages`);
    console.log("Landing pages cleared. Re-approve the workshop to trigger auto-build with fresh templates.");
}

main().catch(console.error).finally(() => db.$disconnect());
