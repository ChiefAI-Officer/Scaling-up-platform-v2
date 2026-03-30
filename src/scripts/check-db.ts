import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function check() {
  const templates = await db.pageTemplate.findMany({
    select: { id: true, name: true, templateType: true, isActive: true, categoryId: true },
  });
  console.log("=== PAGE TEMPLATES ===");
  console.log(JSON.stringify(templates, null, 2));
  console.log(`Total: ${templates.length} | Active: ${templates.filter((t) => t.isActive).length}`);

  const workshops = await db.workshop.findMany({
    orderBy: { createdAt: "desc" },
    take: 3,
    select: { id: true, title: true, status: true, workshopCode: true, categoryId: true, coachId: true },
  });
  console.log("\n=== RECENT WORKSHOPS ===");
  console.log(JSON.stringify(workshops, null, 2));

  const approvals = await db.approvalQueue.findMany({
    orderBy: { createdAt: "desc" },
    take: 3,
    select: { id: true, type: true, status: true, workshopId: true, coachId: true },
  });
  console.log("\n=== RECENT APPROVALS ===");
  console.log(JSON.stringify(approvals, null, 2));

  const landingPages = await db.landingPage.findMany({
    orderBy: { createdAt: "desc" },
    take: 5,
    select: { id: true, workshopId: true, template: true, status: true, slug: true },
  });
  console.log("\n=== LANDING PAGES ===");
  console.log(JSON.stringify(landingPages, null, 2));

  await db.$disconnect();
}

check().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
