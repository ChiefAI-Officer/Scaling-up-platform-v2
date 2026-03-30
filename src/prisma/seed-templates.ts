/**
 * Seed Active Landing Page Templates for Auto-Build
 *
 * Creates 3 PageTemplate records (SOLO_LANDING, REGISTRATION, THANK_YOU)
 * with {{variable}} placeholders that auto-build interpolates on workshop approval.
 *
 * Run: npx tsx prisma/seed-templates.ts
 *
 * Safe to re-run — uses findFirst + update/create pattern keyed on templateType
 * with null categoryId (global templates).
 * No fake workshops created — PageTemplate is independent of Workshop.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// ─── Template Content (uses {{variables}} for auto-build interpolation) ───

const soloLandingContent = {
  coachPhoto: "{{coach_photo}}",
  coachName: "{{coach_name}}",
  coachTitle: "{{coach_title}}",
  eventDay: "{{event_day}}",
  eventDate: "{{event_date_no_weekday}}",
  eventTime: "{{workshop_time}}",
  eventTimezone: "America/New_York",
  heroTitle: "{{workshop_title}}",
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
};

const registrationContent = {
  coachName: "{{coach_name}}",
  coachPhoto: "{{coach_photo}}",
  coachTitle: "{{coach_title}}",
  workshopTitle: "{{workshop_title}}",
  eventDate: "{{event_date_no_weekday}}",
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
    "We've sent a confirmation email to your inbox with all the details. Please add {{event_date_no_weekday}} at {{workshop_time}} to your calendar so you don't miss it.",
  calendarReminderText: "Add this event to your calendar",
};

// ─── Seed Logic ─────────────────────────────────────────────────────────

async function main() {
  console.log("Seeding global PageTemplate records for auto-build...\n");

  const templates: {
    name: string;
    templateType: "SOLO_LANDING" | "REGISTRATION" | "THANK_YOU";
    content: object;
    label: string;
  }[] = [
    {
      name: "Standard Solo Landing Page",
      templateType: "SOLO_LANDING",
      content: soloLandingContent,
      label: "Solo Landing Page",
    },
    {
      name: "Standard Registration Page",
      templateType: "REGISTRATION",
      content: registrationContent,
      label: "Registration Page",
    },
    {
      name: "Standard Thank You Page",
      templateType: "THANK_YOU",
      content: thankYouContent,
      label: "Thank You Page",
    },
  ];

  let created = 0;
  let updated = 0;

  for (const tpl of templates) {
    const contentJson = JSON.stringify(tpl.content);

    // Keyed on templateType + null categoryId (global templates)
    const existing = await prisma.pageTemplate.findFirst({
      where: {
        templateType: tpl.templateType,
        categoryId: null,
      },
    });

    if (existing) {
      await prisma.pageTemplate.update({
        where: { id: existing.id },
        data: {
          name: tpl.name,
          content: contentJson,
          isActive: true,
        },
      });
      console.log(`  Updated: ${tpl.label} (content refreshed, isActive=true)`);
      updated++;
    } else {
      await prisma.pageTemplate.create({
        data: {
          name: tpl.name,
          templateType: tpl.templateType,
          categoryId: null,
          content: contentJson,
          isActive: true,
        },
      });
      console.log(`  Created: ${tpl.label} (isActive=true)`);
      created++;
    }
  }

  // Verify
  const activeCount = await prisma.pageTemplate.count({
    where: { isActive: true },
  });

  console.log(`\nSummary:`);
  console.log(`  Created: ${created}`);
  console.log(`  Updated: ${updated}`);
  console.log(`  Total active PageTemplates in DB: ${activeCount}`);
  console.log(`\nDone! Auto-build will now use ${activeCount} active PageTemplate(s) for approved workshops.`);
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
