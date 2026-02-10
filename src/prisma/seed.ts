import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database...");

  const passwordHash = await bcrypt.hash("demo123", 10);
  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase() || "admin@scalingup.com";

  // Create admin user for authentication
  const adminUser = await prisma.user.upsert({
    where: { email: adminEmail },
    update: { passwordHash },
    create: {
      email: adminEmail,
      name: "Admin User",
      role: "ADMIN",
      passwordHash,
    },
  });

  // Create staff user
  const staffUser = await prisma.user.upsert({
    where: { email: "staff@scalingup.com" },
    update: { passwordHash },
    create: {
      email: "staff@scalingup.com",
      name: "Staff User",
      role: "STAFF",
      passwordHash,
    },
  });

  // Create coach user (for E2E tests — coach@example.com / demo123)
  const coachUser = await prisma.user.upsert({
    where: { email: "coach@example.com" },
    update: { passwordHash },
    create: {
      email: "coach@example.com",
      name: "Demo Coach",
      role: "COACH",
      passwordHash,
    },
  });

  console.log("Created users:", {
    admin: adminUser.email,
    staff: staffUser.email,
    coach: coachUser.email,
  });

  // Create workshop types
  const aiWorkshop = await prisma.workshopType.upsert({
    where: { slug: "ai-workshop" },
    update: {},
    create: {
      name: "AI Workshop",
      slug: "ai-workshop",
      description:
        "Learn how to leverage AI tools to transform your business operations. This hands-on workshop covers practical AI implementation strategies, automation opportunities, and how to build an AI-ready organization.",
      shortDescription: "Transform your business with AI",
      durationOptions: JSON.stringify(["full-day", "half-day", "virtual-2hr"]),
      pricingTiers: JSON.stringify({
        "full-day": 49900,
        "half-day": 29900,
        "virtual-2hr": 9900,
      }),
      preWorkshopInstructions:
        "Please bring a laptop with internet access. We recommend having ChatGPT or Claude accounts ready.",
      isActive: true,
    },
  });

  const exitWorkshop = await prisma.workshopType.upsert({
    where: { slug: "exit-evaluation" },
    update: {},
    create: {
      name: "Exit Evaluation Workshop",
      slug: "exit-evaluation",
      description:
        "Discover what your business is really worth and what strategic acquirers look for. Learn to identify and close value gaps to maximize your exit valuation.",
      shortDescription: "Maximize your business exit value",
      durationOptions: JSON.stringify(["full-day", "half-day"]),
      pricingTiers: JSON.stringify({
        "full-day": 59900,
        "half-day": 34900,
      }),
      preWorkshopInstructions:
        "Please bring your last 3 years of financial statements if available.",
      isActive: true,
    },
  });

  const scalingWorkshop = await prisma.workshopType.upsert({
    where: { slug: "scaling-up-basics" },
    update: {},
    create: {
      name: "Scaling Up Basics",
      slug: "scaling-up-basics",
      description:
        "Master the fundamentals of the Scaling Up methodology. Cover the 4 Decisions framework: People, Strategy, Execution, and Cash.",
      shortDescription: "Master business growth fundamentals",
      durationOptions: JSON.stringify(["full-day"]),
      pricingTiers: JSON.stringify({
        "full-day": 39900,
      }),
      preWorkshopInstructions: "Review the Scaling Up book chapters 1-3 before attending.",
      isActive: true,
    },
  });

  const masterClassWorkshop = await prisma.workshopType.upsert({
    where: { slug: "scaling-up-master-class" },
    update: {},
    create: {
      name: "Scaling Up Master Class",
      slug: "scaling-up-master-class",
      description:
        "An advanced, intensive workshop covering all four decisions of the Scaling Up methodology at a deeper level. For experienced leaders ready to accelerate growth.",
      shortDescription: "Advanced Scaling Up methodology",
      durationOptions: JSON.stringify(["full-day", "two-day"]),
      pricingTiers: JSON.stringify({
        "full-day": 69900,
        "two-day": 119900,
      }),
      preWorkshopInstructions:
        "Complete the Scaling Up Basics workshop or have equivalent experience before attending.",
      isActive: true,
    },
  });

  console.log("Created workshop types");

  // Create coaches
  const coach1 = await prisma.coach.upsert({
    where: { email: "sarah.johnson@scalingup.com" },
    update: {},
    create: {
      email: "sarah.johnson@scalingup.com",
      firstName: "Sarah",
      lastName: "Johnson",
      phone: "+1 555-0101",
      company: "Growth Strategies LLC",
      bio: "Sarah is a certified Scaling Up coach with 15 years of experience helping businesses scale. She specializes in AI integration and strategic planning.",
      certificationStatus: "ACTIVE",
      certificationExpiry: new Date("2026-12-31"),
      paymentStatus: "CURRENT",
      territory: JSON.stringify({ regions: ["Chicago", "Midwest"] }),
    },
  });

  const coach2 = await prisma.coach.upsert({
    where: { email: "michael.chen@scalingup.com" },
    update: {},
    create: {
      email: "michael.chen@scalingup.com",
      firstName: "Michael",
      lastName: "Chen",
      phone: "+1 555-0102",
      company: "Chen Business Consulting",
      bio: "Michael brings 20 years of executive experience to his coaching practice. Expert in exit planning and M&A preparation.",
      certificationStatus: "ACTIVE",
      certificationExpiry: new Date("2026-06-30"),
      paymentStatus: "CURRENT",
      territory: JSON.stringify({ regions: ["San Francisco", "West Coast"] }),
    },
  });

  const coach3 = await prisma.coach.upsert({
    where: { email: "emily.rodriguez@scalingup.com" },
    update: {},
    create: {
      email: "emily.rodriguez@scalingup.com",
      firstName: "Emily",
      lastName: "Rodriguez",
      phone: "+1 555-0103",
      company: "Rodriguez & Associates",
      bio: "Emily focuses on helping mid-market companies implement the Scaling Up methodology. Certified in all workshop formats.",
      certificationStatus: "ACTIVE",
      certificationExpiry: new Date("2025-09-30"),
      paymentStatus: "CURRENT",
      territory: JSON.stringify({ regions: ["New York", "Northeast"] }),
    },
  });

  // Create coach linked to coach@example.com user (for E2E tests)
  const demoCoach = await prisma.coach.upsert({
    where: { email: "coach@example.com" },
    update: { userId: coachUser.id },
    create: {
      email: "coach@example.com",
      firstName: "Demo",
      lastName: "Coach",
      phone: "+1 555-0199",
      company: "Demo Coaching Inc.",
      bio: "Demo coach account for testing and development.",
      certificationStatus: "ACTIVE",
      certificationExpiry: new Date("2027-12-31"),
      paymentStatus: "CURRENT",
      territory: JSON.stringify({ regions: ["National"] }),
      userId: coachUser.id,
    },
  });

  console.log("Created coaches");

  // Create certifications
  await prisma.coachCertification.upsert({
    where: {
      coachId_workshopTypeId: {
        coachId: coach1.id,
        workshopTypeId: aiWorkshop.id,
      },
    },
    update: {},
    create: {
      coachId: coach1.id,
      workshopTypeId: aiWorkshop.id,
      status: "ACTIVE",
      expiresAt: new Date("2026-12-31"),
    },
  });

  await prisma.coachCertification.upsert({
    where: {
      coachId_workshopTypeId: {
        coachId: coach1.id,
        workshopTypeId: scalingWorkshop.id,
      },
    },
    update: {},
    create: {
      coachId: coach1.id,
      workshopTypeId: scalingWorkshop.id,
      status: "ACTIVE",
      expiresAt: new Date("2026-12-31"),
    },
  });

  await prisma.coachCertification.upsert({
    where: {
      coachId_workshopTypeId: {
        coachId: coach2.id,
        workshopTypeId: exitWorkshop.id,
      },
    },
    update: {},
    create: {
      coachId: coach2.id,
      workshopTypeId: exitWorkshop.id,
      status: "ACTIVE",
      expiresAt: new Date("2026-06-30"),
    },
  });

  await prisma.coachCertification.upsert({
    where: {
      coachId_workshopTypeId: {
        coachId: coach3.id,
        workshopTypeId: scalingWorkshop.id,
      },
    },
    update: {},
    create: {
      coachId: coach3.id,
      workshopTypeId: scalingWorkshop.id,
      status: "ACTIVE",
      expiresAt: new Date("2025-09-30"),
    },
  });

  await prisma.coachCertification.upsert({
    where: {
      coachId_workshopTypeId: {
        coachId: coach3.id,
        workshopTypeId: aiWorkshop.id,
      },
    },
    update: {},
    create: {
      coachId: coach3.id,
      workshopTypeId: aiWorkshop.id,
      status: "ACTIVE",
      expiresAt: new Date("2025-09-30"),
    },
  });

  // Demo coach certified for master class
  await prisma.coachCertification.upsert({
    where: {
      coachId_workshopTypeId: {
        coachId: demoCoach.id,
        workshopTypeId: masterClassWorkshop.id,
      },
    },
    update: {},
    create: {
      coachId: demoCoach.id,
      workshopTypeId: masterClassWorkshop.id,
      status: "ACTIVE",
      expiresAt: new Date("2027-12-31"),
    },
  });

  console.log("Created certifications");

  // Create sample workshops
  const workshop1 = await prisma.workshop.upsert({
    where: { landingPageSlug: "ai-workshop-chicago-march-2025" },
    update: {},
    create: {
      coachId: coach1.id,
      workshopTypeId: aiWorkshop.id,
      title: "AI Workshop - Chicago March 2025",
      description:
        "Join us for an intensive day of learning how to integrate AI into your business operations. Perfect for business owners and leadership teams ready to embrace the AI revolution.",
      format: "IN_PERSON",
      duration: "full-day",
      eventDate: new Date("2025-03-15"),
      eventTime: "9:00 AM",
      timezone: "America/Chicago",
      venueName: "Marriott Chicago Downtown",
      venueAddress: JSON.stringify({
        street: "540 N Michigan Ave",
        city: "Chicago",
        state: "IL",
        zip: "60611",
      }),
      parkingInstructions: "Valet parking available at hotel. Self-parking at 545 N Michigan Ave garage.",
      isFree: false,
      priceCents: 49900,
      earlyBirdPriceCents: 39900,
      earlyBirdDeadline: new Date("2025-02-28"),
      maxAttendees: 30,
      status: "REGISTRATION_OPEN",
      landingPageSlug: "ai-workshop-chicago-march-2025",
    },
  });

  await prisma.workshop.upsert({
    where: { landingPageSlug: "exit-planning-sf-april-2025" },
    update: {},
    create: {
      coachId: coach2.id,
      workshopTypeId: exitWorkshop.id,
      title: "Exit Planning Workshop - San Francisco",
      description:
        "Prepare your business for a successful exit. Learn valuation drivers, due diligence preparation, and negotiation strategies from an experienced M&A professional.",
      format: "IN_PERSON",
      duration: "full-day",
      eventDate: new Date("2025-04-10"),
      eventTime: "8:30 AM",
      timezone: "America/Los_Angeles",
      venueName: "Four Seasons San Francisco",
      venueAddress: JSON.stringify({
        street: "757 Market St",
        city: "San Francisco",
        state: "CA",
        zip: "94103",
      }),
      parkingInstructions: "Validated parking in building garage.",
      isFree: false,
      priceCents: 59900,
      maxAttendees: 25,
      status: "MARKETING_ACTIVE",
      landingPageSlug: "exit-planning-sf-april-2025",
    },
  });

  const workshop3 = await prisma.workshop.upsert({
    where: { landingPageSlug: "virtual-ai-intro-feb-2025" },
    update: {},
    create: {
      coachId: coach3.id,
      workshopTypeId: aiWorkshop.id,
      title: "Introduction to AI for Business - Virtual",
      description:
        "A 2-hour virtual session covering AI fundamentals for business leaders. Perfect for those exploring AI adoption.",
      format: "VIRTUAL",
      duration: "virtual-2hr",
      eventDate: new Date("2025-02-20"),
      eventTime: "1:00 PM",
      timezone: "America/New_York",
      virtualPlatform: "zoom",
      virtualLink: "https://zoom.us/j/example",
      isFree: true,
      maxAttendees: 100,
      status: "REGISTRATION_OPEN",
      landingPageSlug: "virtual-ai-intro-feb-2025",
    },
  });

  console.log("Created workshops");

  // Create sample registrations
  const registrations = [
    {
      workshopId: workshop1.id,
      email: "john.smith@example.com",
      firstName: "John",
      lastName: "Smith",
      company: "Smith Industries",
      jobTitle: "CEO",
      paymentStatus: "COMPLETED",
      status: "CONFIRMED",
      amountPaidCents: 39900,
    },
    {
      workshopId: workshop1.id,
      email: "jane.doe@example.com",
      firstName: "Jane",
      lastName: "Doe",
      company: "Doe Consulting",
      jobTitle: "COO",
      paymentStatus: "COMPLETED",
      status: "CONFIRMED",
      amountPaidCents: 39900,
    },
    {
      workshopId: workshop3.id,
      email: "alex.wong@example.com",
      firstName: "Alex",
      lastName: "Wong",
      company: "Wong Tech",
      jobTitle: "Founder",
      paymentStatus: "FREE",
      status: "REGISTERED",
    },
  ];

  for (const reg of registrations) {
    const existing = await prisma.registration.findFirst({
      where: { workshopId: reg.workshopId, email: reg.email },
    });
    if (!existing) {
      await prisma.registration.create({ data: reg });
    }
  }

  console.log("Created registrations");

  console.log("Seeding completed!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
