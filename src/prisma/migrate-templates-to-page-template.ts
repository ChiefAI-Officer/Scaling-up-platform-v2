/**
 * One-time data migration: Copy active LandingPage templates to PageTemplate model.
 *
 * Usage: cd src && npx tsx prisma/migrate-templates-to-page-template.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
    console.log("Starting template migration...\n");

    const activeTemplates = await prisma.landingPage.findMany({
        where: { isActiveTemplate: true },
        include: {
            category: { select: { name: true } },
        },
    });

    console.log(`Found ${activeTemplates.length} active LandingPage templates.\n`);

    let migrated = 0;
    let flagged = 0;

    for (const tpl of activeTemplates) {
        const categoryLabel = tpl.category?.name || "Global";
        const name = `${categoryLabel} ${tpl.template.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}`;

        // Check if content contains placeholders
        const hasPlaceholders = tpl.content.includes("{{");
        if (!hasPlaceholders) {
            console.warn(`  FLAGGED: "${name}" — content has no {{}} placeholders. May contain hardcoded workshop data.`);
            flagged++;
        }

        // Check if PageTemplate already exists for this slot
        const existing = await prisma.pageTemplate.findFirst({
            where: {
                templateType: tpl.template,
                categoryId: tpl.categoryId,
            },
        });

        if (existing) {
            console.log(`  SKIP: "${name}" — PageTemplate already exists (id=${existing.id})`);
            continue;
        }

        await prisma.pageTemplate.create({
            data: {
                name,
                templateType: tpl.template,
                categoryId: tpl.categoryId,
                content: tpl.content,
                isActive: true,
            },
        });

        // Mark old LandingPage as no longer the active template
        await prisma.landingPage.update({
            where: { id: tpl.id },
            data: { isActiveTemplate: false },
        });

        console.log(`  MIGRATED: "${name}" (${tpl.template}, category=${categoryLabel})`);
        migrated++;
    }

    console.log(`\nDone. Migrated: ${migrated}, Flagged: ${flagged}, Total: ${activeTemplates.length}`);
}

main()
    .catch((e) => {
        console.error("Migration failed:", e);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
