/**
 * FIG-005: Seed Exit & Valuation Landing Page Templates
 *
 * Creates 4 inactive landing page templates for the Exit & Valuation category:
 *   SOLO_LANDING, DUO_LANDING, REGISTRATION, THANK_YOU
 *
 * These templates are seeded with isActiveTemplate=false so they CANNOT affect
 * auto-build until an admin explicitly activates them via the Templates admin page.
 * Activating them before the category filter (FIG-005) was deployed would have
 * caused auto-build to assign E&V templates to AI workshops — now safe.
 *
 * Run: npx tsx prisma/seed-ev-templates.ts
 *
 * Safe to re-run — uses upsert pattern (findFirst + update/create).
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// ─── E&V Template Content ({{variables}} interpolated by auto-build) ────────

const evSoloLandingContent = {
  coachPhoto: "{{coach_photo}}",
  coachName: "{{coach_name}}",
  coachTitle: "Scaling Up Certified Exit & Valuation Coach",
  eventDay: "{{workshop_date}}",
  eventDate: "{{workshop_date}}",
  eventTime: "{{workshop_time}}",
  eventTimezone: "America/New_York",
  heroTitle: "{{workshop_title}}",
  heroSubtitle: "{{workshop_description}}",
  bodyContent:
    "Join {{coach_name}} from {{coach_company}} for this Exit & Valuation workshop. Whether you're preparing for a sale, succession, or simply want to understand what your business is worth — this hands-on session provides the frameworks and tools to maximize your exit value and plan your next move with confidence.",
  aboutTitle: "About This Exit & Valuation Workshop",
  aboutDescription: "{{workshop_description}}",
  partnerId: "",
  partnerName: "",
  partnerTagline: "",
  partnerLogoUrl: "",
  benefits: [
    "Understand the true valuation drivers of your business",
    "Identify and close value gaps before going to market",
    "Learn what strategic acquirers look for in a target",
    "Personalized coaching and Q&A with {{coach_first_name}}",
    "Post-workshop resources and exit planning support",
  ],
  videoUrl: "",
  ctaText: "Register Now — {{price}}",
  registrationUrl: "",
};

const evDuoLandingContent = {
  coachPhoto: "{{coach_photo}}",
  coachName: "{{coach_name}}",
  coachTitle: "Scaling Up Certified Exit & Valuation Coach",
  partnerCoachPhoto: "",
  partnerCoachName: "",
  partnerCoachTitle: "Scaling Up Certified Exit & Valuation Coach",
  eventDay: "{{workshop_date}}",
  eventDate: "{{workshop_date}}",
  eventTime: "{{workshop_time}}",
  eventTimezone: "America/New_York",
  heroTitle: "{{workshop_title}}",
  heroSubtitle: "{{workshop_description}}",
  bodyContent:
    "Join two Scaling Up certified Exit & Valuation coaches for this intensive workshop. Gain multiple perspectives on exit planning, business valuation, and how to position your company for a successful transition.",
  aboutTitle: "About This Exit & Valuation Workshop",
  aboutDescription: "{{workshop_description}}",
  benefits: [
    "Two-coach perspective on exit strategy and valuation",
    "Understand the true market value of your business",
    "Learn proven frameworks used by 80,000+ companies",
    "Q&A and personalized feedback from both coaches",
    "Post-workshop resources and follow-up support",
  ],
  videoUrl: "",
  ctaText: "Register Now — {{price}}",
  registrationUrl: "",
};

const evRegistrationContent = {
  coachName: "{{coach_name}}",
  coachPhoto: "{{coach_photo}}",
  coachTitle: "Scaling Up Certified Exit & Valuation Coach",
  workshopTitle: "{{workshop_title}}",
  eventDate: "{{workshop_date}}",
  eventTime: "{{workshop_time}}",
  heroHeadline: "Register for {{workshop_title}}",
  heroDescription: "{{workshop_date}} — Facilitated by {{coach_name}}",
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

const evThankYouContent = {
  headline: "You're Registered!",
  subheadline:
    "Thank you for registering for {{workshop_title}} with {{coach_name}}.",
  videoUrl: "",
  additionalMessage:
    "We've sent a confirmation email to your inbox with all the details. Please add {{workshop_date}} at {{workshop_time}} to your calendar — we look forward to seeing you at this Exit & Valuation workshop.",
  calendarReminderText: "Add this event to your calendar",
};

// ─── Seed Logic ──────────────────────────────────────────────────────────────

async function main() {
  console.log("🔧 Seeding Exit & Valuation landing page templates (FIG-005)...\n");

  // Look up the Exit & Valuation category by slug
  const evCategory = await prisma.category.findUnique({
    where: { slug: "exit-and-valuation" },
    select: { id: true, name: true },
  });

  if (!evCategory) {
    console.error(
      '❌ "Exit & Valuation" category not found (slug: exit-and-valuation).\n' +
        "Run `npx tsx prisma/seed.ts` first to create the base categories."
    );
    process.exit(1);
  }

  console.log(`  Found category: "${evCategory.name}" (${evCategory.id})\n`);

  // Find or create a template host workshop for E&V templates
  let hostWorkshop = await prisma.workshop.findFirst({
    where: { workshopCode: "WS-TMPL-EV01" },
    select: { id: true, title: true, workshopCode: true },
  });

  if (!hostWorkshop) {
    const coach = await prisma.coach.findFirst({ select: { id: true } });
    if (!coach) {
      console.error("❌ No coaches found. Run prisma/seed.ts first.");
      process.exit(1);
    }

    const created = await prisma.workshop.create({
      data: {
        coachId: coach.id,
        workshopCode: "WS-TMPL-EV01",
        title: "[SYSTEM] Exit & Valuation Template Host Workshop",
        description:
          "This workshop exists only to host Exit & Valuation landing page templates for auto-build (FIG-005). Do not delete.",
        format: "VIRTUAL",
        duration: "full-day",
        eventDate: new Date("2099-12-31"),
        eventTime: "09:00",
        timezone: "America/New_York",
        isFree: true,
        maxAttendees: 0,
        status: "INFO_REQUESTED",
        landingPageSlug: "system-ev-template-host",
        categoryId: evCategory.id,
      },
    });
    hostWorkshop = {
      id: created.id,
      title: created.title,
      workshopCode: created.workshopCode,
    };
    console.log(`  Created E&V template host workshop: ${hostWorkshop.workshopCode}`);
  }

  console.log(
    `  Host workshop: "${hostWorkshop.title}" (${hostWorkshop.workshopCode})\n`
  );

  const templates: {
    template: "SOLO_LANDING" | "DUO_LANDING" | "REGISTRATION" | "THANK_YOU";
    content: object;
    label: string;
  }[] = [
    {
      template: "SOLO_LANDING",
      content: evSoloLandingContent,
      label: "E&V Solo Landing Page",
    },
    {
      template: "DUO_LANDING",
      content: evDuoLandingContent,
      label: "E&V Duo Landing Page",
    },
    {
      template: "REGISTRATION",
      content: evRegistrationContent,
      label: "E&V Registration Page",
    },
    {
      template: "THANK_YOU",
      content: evThankYouContent,
      label: "E&V Thank You Page",
    },
  ];

  let created = 0;
  let updated = 0;

  for (const tpl of templates) {
    const slug = `ev-template-${tpl.template.toLowerCase().replace(/_/g, "-")}-master`;
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
          categoryId: evCategory.id,
          // DO NOT set isActiveTemplate=true — admin must manually activate
        },
      });
      console.log(`  ✅ Updated: ${tpl.label} (content refreshed, stays INACTIVE)`);
      updated++;
    } else {
      await prisma.landingPage.create({
        data: {
          workshopId: hostWorkshop.id,
          template: tpl.template,
          slug,
          content: contentJson,
          status: "DRAFT",
          isActiveTemplate: false, // ⚠️ DO NOT activate — admin must verify first
          categoryId: evCategory.id,
          publishedAt: null,
        },
      });
      console.log(`  ✅ Created: ${tpl.label} (INACTIVE — must be activated manually)`);
      created++;
    }
  }

  // Verification: confirm none are accidentally active
  const activeEvCount = await prisma.landingPage.count({
    where: { categoryId: evCategory.id, isActiveTemplate: true },
  });

  console.log(`\n📊 Summary:`);
  console.log(`  Created: ${created}`);
  console.log(`  Updated: ${updated}`);
  console.log(`  Active E&V templates (must be 0): ${activeEvCount}`);

  if (activeEvCount > 0) {
    console.error(
      `\n⚠️  WARNING: ${activeEvCount} E&V template(s) are marked isActiveTemplate=true!`
    );
    console.error(
      `   This could cause auto-build to assign E&V templates to non-E&V workshops.`
    );
    console.error(
      `   Review and deactivate before deploying.`
    );
  } else {
    console.log(
      `\n✅ Done! E&V templates seeded and INACTIVE.` +
        `\n   To activate: use the Templates admin page (/templates?category=<ev-category-id>)` +
        `\n   and toggle "Auto-Build" on the desired template.`
    );
  }
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
