/**
 * Diagnostic script: Inspect PageTemplate and LandingPage content in the database.
 * Usage: npx tsx scripts/diagnose-templates.ts [workshopId]
 */
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();

async function main() {
    // 1. Check ALL PageTemplate records
    const templates = await db.pageTemplate.findMany({
        select: { id: true, templateType: true, content: true, categoryId: true, isActive: true },
    });

    console.log(`\n=== ALL PAGE TEMPLATES (${templates.length} total) ===`);
    for (const t of templates) {
        const hasPlaceholders = /\{\{[^}]+\}\}/.test(t.content);
        const preview = t.content.substring(0, 150);
        console.log(`\n[${t.templateType}] id=${t.id} active=${t.isActive} categoryId=${t.categoryId || "GLOBAL"}`);
        console.log(`  Has {{placeholders}}: ${hasPlaceholders}`);
        console.log(`  Preview: ${preview}...`);
        if (!hasPlaceholders && t.isActive) {
            console.log(`  ⚠️  CORRUPTED — active template with no placeholders!`);
        }
    }

    // 2. Full workshop record dump
    const workshopId = process.argv[2] || "cmnbwb86x0011qd50e1r6326h";
    console.log(`\nUsing workshopId: ${workshopId}`);
    const workshop = await db.workshop.findUnique({
        where: { id: workshopId },
        include: {
            coach: { select: { firstName: true, lastName: true, email: true, profileImage: true, company: true } },
            workshopCategory: { select: { id: true, name: true } },
            pricingTier: { select: { name: true, amountCents: true } },
        },
    });
    if (!workshop) {
        console.log(`\n⚠️  Workshop ${workshopId} not found!`);
        return;
    }
    console.log("\n=== FULL WORKSHOP RECORD ===");
    console.log(JSON.stringify(workshop, null, 2));

    // 3. LandingPage content vs workshop data comparison
    const pages = await db.landingPage.findMany({
        where: { workshopId },
        select: { id: true, template: true, slug: true, content: true, sourceTemplateId: true },
    });
    console.log(`\n=== LANDING PAGES FOR WORKSHOP (${pages.length} found) ===`);
    for (const p of pages) {
        const content = JSON.parse(p.content);
        console.log(`\n[${p.template}] slug=${p.slug}`);
        console.log(`  sourceTemplateId: ${p.sourceTemplateId}`);
        console.log(`  content.heroTitle: ${content.heroTitle || content.headline || "N/A"}`);
        console.log(`  content.coachName: ${content.coachName || "N/A"}`);
        console.log(`  content.eventDate: ${content.eventDate || "N/A"}`);
        console.log(`  content.eventTime: ${content.eventTime || "N/A"}`);
        console.log(`  content.subheadline: ${content.subheadline || "N/A"}`);

        const titleMatch = (content.heroTitle || content.headline || "").includes(workshop.title);
        const coachMatch = content.coachName === `${workshop.coach.firstName} ${workshop.coach.lastName}`;
        console.log(`  MATCH workshop.title? ${titleMatch}`);
        console.log(`  MATCH coach name? ${coachMatch}`);
    }
}

main().catch(console.error).finally(() => db.$disconnect());
