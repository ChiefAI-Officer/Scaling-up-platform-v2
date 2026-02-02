/**
 * Seed Real Workshop Data
 * 
 * This script imports the actual workshop data extracted from Kajabi screenshots
 * and context building documents. Run after the standard seed.ts.
 * 
 * Usage: npx tsx prisma/seed-real-data.ts
 */

import { PrismaClient } from "@prisma/client";
import workshopTypesData from "./seed/workshop_types.json";
import coachesData from "./seed/coaches.json";
import workshopsData from "./seed/workshops.json";

const prisma = new PrismaClient();

async function main() {
    console.log("🚀 Seeding real Scaling Up workshop data...\n");

    // =========================================
    // Step 1: Create Workshop Types
    // =========================================
    console.log("📋 Creating workshop types...");

    const workshopTypeMap = new Map<string, string>();

    for (const wt of workshopTypesData.workshopTypes) {
        const created = await prisma.workshopType.upsert({
            where: { slug: wt.slug },
            update: {
                name: wt.name,
                description: wt.description,
                pricingTiers: JSON.stringify({ default: wt.basePriceCents }),
                durationOptions: JSON.stringify([`${wt.durationHours}hr`]),
                isActive: wt.active,
            },
            create: {
                name: wt.name,
                slug: wt.slug,
                description: wt.description,
                shortDescription: wt.description.slice(0, 100),
                pricingTiers: JSON.stringify({ default: wt.basePriceCents }),
                durationOptions: JSON.stringify([`${wt.durationHours}hr`]),
                preWorkshopInstructions: wt.format === "VIRTUAL"
                    ? "Please bring a laptop with internet access."
                    : "Please arrive 15 minutes early for registration.",
                isActive: wt.active,
            },
        });
        workshopTypeMap.set(wt.slug, created.id);
        console.log(`  ✅ ${wt.name}`);
    }

    // =========================================
    // Step 2: Create Coaches
    // =========================================
    console.log("\n👥 Creating coaches...");

    const coachMap = new Map<string, string>();

    for (const coach of coachesData.coaches) {
        const created = await prisma.coach.upsert({
            where: { email: coach.email },
            update: {
                firstName: coach.firstName,
                lastName: coach.lastName,
                company: coach.company,
                bio: coach.bio,
                certificationStatus: coach.certificationStatus,
                territory: coach.territory,
            },
            create: {
                email: coach.email,
                firstName: coach.firstName,
                lastName: coach.lastName,
                company: coach.company,
                bio: coach.bio,
                certificationStatus: coach.certificationStatus,
                certificationExpiry: new Date("2026-12-31"),
                paymentStatus: "CURRENT",
                territory: coach.territory,
            },
        });
        coachMap.set(coach.id, created.id);
        console.log(`  ✅ ${coach.firstName} ${coach.lastName}`);

        // Create certifications for this coach
        for (const wtSlug of coach.workshopTypes) {
            const workshopTypeId = workshopTypeMap.get(wtSlug);
            if (workshopTypeId) {
                await prisma.coachCertification.upsert({
                    where: {
                        coachId_workshopTypeId: {
                            coachId: created.id,
                            workshopTypeId: workshopTypeId,
                        },
                    },
                    update: {},
                    create: {
                        coachId: created.id,
                        workshopTypeId: workshopTypeId,
                        status: "ACTIVE",
                        expiresAt: new Date("2026-12-31"),
                    },
                });
            }
        }
    }

    // =========================================
    // Step 3: Create Upcoming Workshops
    // =========================================
    console.log("\n📅 Creating upcoming workshops...");

    for (const ws of workshopsData.workshops.upcoming) {
        const coachId = coachMap.get(ws.coachId);
        const workshopTypeId = workshopTypeMap.get(ws.workshopTypeSlug);

        if (!coachId || !workshopTypeId) {
            console.log(`  ⚠️ Skipping ${ws.title} - missing coach or workshop type`);
            continue;
        }

        const landingPageSlug = `${ws.workshopTypeSlug}-${ws.eventDate}`.toLowerCase().replace(/\s+/g, '-');

        await prisma.workshop.upsert({
            where: { landingPageSlug },
            update: {
                title: ws.title,
                status: ws.status,
                priceCents: ws.priceCents,
            },
            create: {
                coachId,
                workshopTypeId,
                title: ws.title,
                description: `${ws.title} with expert Scaling Up coaches.`,
                format: ws.format,
                duration: ws.format === "VIRTUAL" ? "4hr" : "8hr",
                eventDate: new Date(ws.eventDate),
                eventTime: ws.eventTime || "09:00",
                timezone: ws.timezone || "America/New_York",
                venueName: ws.venue?.name,
                venueAddress: ws.venue ? JSON.stringify(ws.venue) : null,
                virtualPlatform: ws.format === "VIRTUAL" ? "zoom" : null,
                isFree: false,
                priceCents: ws.priceCents,
                maxAttendees: ws.maxAttendees || 30,
                status: ws.status,
                landingPageSlug,
            },
        });
        console.log(`  ✅ ${ws.eventDate} - ${ws.title}`);
    }

    // =========================================
    // Step 4: Create Past Workshops
    // =========================================
    console.log("\n📚 Creating past workshops...");

    for (const ws of workshopsData.workshops.past) {
        const coachId = coachMap.get(ws.coachId);
        const workshopTypeId = workshopTypeMap.get(ws.workshopTypeSlug);

        if (!coachId || !workshopTypeId) {
            console.log(`  ⚠️ Skipping ${ws.title} - missing coach or workshop type`);
            continue;
        }

        const landingPageSlug = `${ws.workshopTypeSlug}-${ws.eventDate}-past`.toLowerCase().replace(/\s+/g, '-');

        await prisma.workshop.upsert({
            where: { landingPageSlug },
            update: { status: "COMPLETED" },
            create: {
                coachId,
                workshopTypeId,
                title: ws.title,
                description: `${ws.title} - Historical record.`,
                format: ws.format,
                duration: ws.format === "VIRTUAL" ? "4hr" : "8hr",
                eventDate: new Date(ws.eventDate),
                eventTime: "09:00",
                timezone: "America/New_York",
                venueName: ws.venue?.city ? `${ws.venue.city}, ${ws.venue.state}` : null,
                venueAddress: ws.venue ? JSON.stringify(ws.venue) : null,
                virtualPlatform: ws.format === "VIRTUAL" ? "zoom" : null,
                isFree: false,
                priceCents: 49500,
                maxAttendees: 30,
                status: "COMPLETED",
                landingPageSlug,
            },
        });
        console.log(`  ✅ ${ws.eventDate} - ${ws.title} (completed)`);
    }

    // =========================================
    // Summary
    // =========================================
    const stats = {
        workshopTypes: await prisma.workshopType.count(),
        coaches: await prisma.coach.count(),
        workshops: await prisma.workshop.count(),
        upcomingWorkshops: await prisma.workshop.count({ where: { status: "SCHEDULED" } }),
        completedWorkshops: await prisma.workshop.count({ where: { status: "COMPLETED" } }),
    };

    console.log("\n🎉 Seeding completed!");
    console.log("─".repeat(40));
    console.log(`📋 Workshop Types: ${stats.workshopTypes}`);
    console.log(`👥 Coaches: ${stats.coaches}`);
    console.log(`📅 Upcoming Workshops: ${stats.upcomingWorkshops}`);
    console.log(`📚 Completed Workshops: ${stats.completedWorkshops}`);
    console.log(`📊 Total Workshops: ${stats.workshops}`);
}

main()
    .catch((e) => {
        console.error("❌ Seeding failed:", e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
