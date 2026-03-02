/**
 * Seed Active Landing Page Templates for Auto-Build
 *
 * Creates 3 landing page templates (SOLO_LANDING, REGISTRATION, THANK_YOU)
 * with {{variable}} placeholders that auto-build interpolates on workshop approval.
 *
 * Run: npx tsx prisma/seed-templates.ts
 *
 * Safe to re-run — uses upsert on workshopId+template unique constraint.
 * Attaches templates to the first available workshop in the database.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// ─── Template Content (uses {{variables}} for auto-build interpolation) ───

const soloLandingContent = {
  coachPhoto: "",
  coachName: "{{coach_name}}",
  coachTitle: "Scaling Up Certified Coach",
  eventDay: "{{workshop_date}}",
  eventDate: "{{workshop_date}}",
  eventTime: "{{workshop_time}}",
  eventTimezone: "America/New_York",
  heroTitle: "{{workshop_title}}",
  heroSubtitle: "{{workshop_description}}",
  bodyContent:
    "Join {{coach_name}} from {{coach_company}} for this {{category_name}} workshop. Whether you're looking to scale your business, optimize operations, or plan your next strategic move — this hands-on session will give you the frameworks and tools you need to take action immediately.",
  aboutTitle: "About This Workshop",
  aboutDescription:
    "{{workshop_description}}",
  partnerId: "",
  partnerName: "",
  partnerTagline: "",
  partnerLogoUrl: "",
  benefits: [
    "Proven frameworks used by 80,000+ companies worldwide",
    "Hands-on exercises you can apply immediately",
    "Personalized coaching and Q&A with {{coach_first_name}}",
    "Networking with fellow business leaders",
    "Post-workshop resources and follow-up support",
  ],
  videoUrl: "",
  ctaText: "Register Now — {{price}}",
  registrationUrl: "",
};

const registrationContent = {
  coachName: "{{coach_name}}",
  coachPhoto: "",
  coachTitle: "Scaling Up Certified Coach",
  workshopTitle: "{{workshop_title}}",
  eventDate: "{{workshop_date}}",
  eventTime: "{{workshop_time}}",
  heroHeadline: "Register for {{workshop_title}}",
  heroDescription:
    "{{workshop_date}} — Facilitated by {{coach_name}}",
  formTitle: "Complete Your Registration",
  emailPlaceholder: "your@email.com",
  namePlaceholder: "Full Name",
  companyPlaceholder: "Company Name",
  optInText:
    "I agree to receive workshop updates, logistics information, and follow-up communications.",
  submitButtonText: "Register Now",
  privacyText:
    "Your information is secure. We never share your data with third parties.",
};

const thankYouContent = {
  headline: "You're Registered!",
  subheadline:
    "Thank you for registering for {{workshop_title}} with {{coach_name}}.",
  videoUrl: "",
  additionalMessage:
    "We've sent a confirmation email to your inbox with all the details. Please add {{workshop_date}} at {{workshop_time}} to your calendar so you don't miss it.",
  calendarReminderText: "Add this event to your calendar",
};

// ─── Seed Logic ─────────────────────────────────────────────────────────

async function main() {
  console.log("🔧 Seeding active landing page templates...\n");

  // Find any existing workshop to attach templates to
  // (templates need a workshopId, but auto-build copies them to any new workshop)
  let hostWorkshop = await prisma.workshop.findFirst({
    orderBy: { createdAt: "asc" },
    select: { id: true, title: true, workshopCode: true },
  });

  if (!hostWorkshop) {
    // No workshops exist — find a coach to create a template-holder workshop
    const coach = await prisma.coach.findFirst({ select: { id: true } });
    if (!coach) {
      console.error("❌ No coaches found in database. Run prisma/seed.ts first.");
      process.exit(1);
    }

    const created = await prisma.workshop.create({
      data: {
        coachId: coach.id,
        workshopCode: "WS-TMPL-0001",
        title: "[SYSTEM] Template Host Workshop",
        description: "This workshop exists only to host active landing page templates for auto-build. Do not delete.",
        format: "VIRTUAL",
        duration: "full-day",
        eventDate: new Date("2099-12-31"),
        eventTime: "09:00",
        timezone: "America/New_York",
        isFree: true,
        maxAttendees: 0,
        status: "REQUESTED",
        landingPageSlug: "system-template-host",
      },
    });
    hostWorkshop = { id: created.id, title: created.title, workshopCode: created.workshopCode };
    console.log(`  Created template host workshop: ${hostWorkshop.workshopCode}`);
  }

  console.log(`  Host workshop: "${hostWorkshop.title}" (${hostWorkshop.workshopCode})\n`);

  const templates: { template: "SOLO_LANDING" | "REGISTRATION" | "THANK_YOU"; content: object; label: string }[] = [
    { template: "SOLO_LANDING", content: soloLandingContent, label: "Solo Landing Page" },
    { template: "REGISTRATION", content: registrationContent, label: "Registration Page" },
    { template: "THANK_YOU", content: thankYouContent, label: "Thank You Page" },
  ];

  let created = 0;
  let updated = 0;

  for (const tpl of templates) {
    const slug = `template-${tpl.template.toLowerCase().replace(/_/g, "-")}-master`;
    const contentJson = JSON.stringify(tpl.content);

    const existing = await prisma.landingPage.findFirst({
      where: {
        workshopId: hostWorkshop.id,
        template: tpl.template,
      },
    });

    if (existing) {
      await prisma.landingPage.update({
        where: { id: existing.id },
        data: {
          content: contentJson,
          isActiveTemplate: true,
          status: "PUBLISHED",
        },
      });
      console.log(`  ✅ Updated: ${tpl.label} (already existed, refreshed content)`);
      updated++;
    } else {
      await prisma.landingPage.create({
        data: {
          workshopId: hostWorkshop.id,
          template: tpl.template,
          slug,
          content: contentJson,
          status: "PUBLISHED",
          isActiveTemplate: true,
          publishedAt: new Date(),
        },
      });
      console.log(`  ✅ Created: ${tpl.label} (marked as Active Template)`);
      created++;
    }
  }

  // Verify
  const activeCount = await prisma.landingPage.count({
    where: { isActiveTemplate: true },
  });

  console.log(`\n📊 Summary:`);
  console.log(`  Created: ${created}`);
  console.log(`  Updated: ${updated}`);
  console.log(`  Total active templates in DB: ${activeCount}`);
  console.log(`\n✅ Done! Auto-build will now create ${activeCount} pages for each approved workshop.`);
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
