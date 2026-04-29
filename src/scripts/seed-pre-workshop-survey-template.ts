/**
 * One-off prod data fix: create a generic active PRE_WORKSHOP survey template.
 *
 * Safe to run multiple times — uses upsert keyed on name + surveyType.
 *
 * Usage:
 *   npx tsx scripts/seed-pre-workshop-survey-template.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
    const existing = await prisma.surveyTemplate.findFirst({
        where: { surveyType: "PRE_WORKSHOP", isActive: true },
        select: { id: true, name: true },
    });

    if (existing) {
        console.log(`✓ Active PRE_WORKSHOP template already exists: "${existing.name}" (${existing.id})`);
        return;
    }

    const adminUser = await prisma.user.findFirst({
        where: { role: "ADMIN" },
        select: { id: true },
    });

    if (!adminUser) {
        throw new Error("No ADMIN user found — cannot set createdBy");
    }

    const template = await prisma.surveyTemplate.create({
        data: {
            name: "General Pre-Workshop Survey",
            surveyType: "PRE_WORKSHOP",
            isActive: true,
            createdBy: adminUser.id,
            questions: {
                create: [
                    {
                        questionType: "TEXT",
                        label: "What is your primary goal for attending this workshop?",
                        isRequired: true,
                        sortOrder: 1,
                    },
                    {
                        questionType: "RATING",
                        label: "How familiar are you with the workshop topic? (1 = beginner, 5 = expert)",
                        isRequired: true,
                        sortOrder: 2,
                    },
                    {
                        questionType: "TEXT",
                        label: "What is your biggest challenge related to this topic?",
                        isRequired: false,
                        sortOrder: 3,
                    },
                ],
            },
        },
        select: { id: true, name: true },
    });

    console.log(`✓ Created PRE_WORKSHOP template: "${template.name}" (${template.id})`);
}

main()
    .catch((err) => {
        console.error("Error:", err);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
