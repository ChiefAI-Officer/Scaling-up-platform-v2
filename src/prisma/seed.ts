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

  // Create categories (JV-16: Dynamic workshop categories)
  const aiCategory = await prisma.category.upsert({
    where: { slug: "ai" },
    update: {},
    create: {
      name: "AI",
      slug: "ai",
      description: "AI-focused workshops covering practical AI implementation, automation, and building AI-ready organizations.",
    },
  });

  const exitCategory = await prisma.category.upsert({
    where: { slug: "exit-and-valuation" },
    update: {},
    create: {
      name: "Exit & Valuation",
      slug: "exit-and-valuation",
      description: "Workshops focused on business valuation, exit planning, and M&A preparation.",
    },
  });

  console.log("Created categories");

  // Create pricing tiers (JV-17: Replaces freeform price input)
  const aiFullDay = await prisma.pricingTier.upsert({
    where: { id: "ai-full-day-seed" },
    update: {},
    create: {
      id: "ai-full-day-seed",
      categoryId: aiCategory.id,
      name: "Full-Day",
      amountCents: 49900,
      description: "Full-day AI workshop",
    },
  });

  const aiHalfDay = await prisma.pricingTier.upsert({
    where: { id: "ai-half-day-seed" },
    update: {},
    create: {
      id: "ai-half-day-seed",
      categoryId: aiCategory.id,
      name: "Half-Day",
      amountCents: 29900,
      description: "Half-day AI workshop",
    },
  });

  const aiVirtual = await prisma.pricingTier.upsert({
    where: { id: "ai-virtual-2hr-seed" },
    update: {},
    create: {
      id: "ai-virtual-2hr-seed",
      categoryId: aiCategory.id,
      name: "Virtual 2hr",
      amountCents: 9900,
      description: "2-hour virtual AI workshop",
    },
  });

  await prisma.pricingTier.upsert({
    where: { id: "exit-full-day-seed" },
    update: {},
    create: {
      id: "exit-full-day-seed",
      categoryId: exitCategory.id,
      name: "Full-Day",
      amountCents: 59900,
      description: "Full-day Exit & Valuation workshop",
    },
  });

  await prisma.pricingTier.upsert({
    where: { id: "exit-half-day-seed" },
    update: {},
    create: {
      id: "exit-half-day-seed",
      categoryId: exitCategory.id,
      name: "Half-Day",
      amountCents: 34900,
      description: "Half-day Exit & Valuation workshop",
    },
  });

  console.log("Created pricing tiers");

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
      workshopCode: "WS-2025-S001",
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
      venueInstructions: "Valet parking available at hotel. Self-parking at 545 N Michigan Ave garage.",
      isFree: false,
      priceCents: 49900,
      earlyBirdPriceCents: 39900,
      earlyBirdDeadline: new Date("2025-02-28"),
      maxAttendees: 30,
      status: "PRE_EVENT",
      landingPageSlug: "ai-workshop-chicago-march-2025",
    },
  });

  await prisma.workshop.upsert({
    where: { landingPageSlug: "exit-planning-sf-april-2025" },
    update: {},
    create: {
      coachId: coach2.id,
      workshopTypeId: exitWorkshop.id,
      workshopCode: "WS-2025-S002",
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
      venueInstructions: "Validated parking in building garage.",
      isFree: false,
      priceCents: 59900,
      maxAttendees: 25,
      status: "PRE_EVENT",
      landingPageSlug: "exit-planning-sf-april-2025",
    },
  });

  const workshop3 = await prisma.workshop.upsert({
    where: { landingPageSlug: "virtual-ai-intro-feb-2025" },
    update: {},
    create: {
      coachId: coach3.id,
      workshopTypeId: aiWorkshop.id,
      workshopCode: "WS-2025-S003",
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
      status: "PRE_EVENT",
      landingPageSlug: "virtual-ai-intro-feb-2025",
    },
  });

  console.log("Created workshops");

  // Link seeded workshops to categories + pricing tiers (JV-16/17)
  await prisma.workshop.update({
    where: { landingPageSlug: "ai-workshop-chicago-march-2025" },
    data: { categoryId: aiCategory.id, pricingTierId: aiFullDay.id },
  });
  await prisma.workshop.update({
    where: { landingPageSlug: "exit-planning-sf-april-2025" },
    data: { categoryId: exitCategory.id },
  });
  await prisma.workshop.update({
    where: { landingPageSlug: "virtual-ai-intro-feb-2025" },
    data: { categoryId: aiCategory.id, pricingTierId: aiVirtual.id },
  });

  console.log("Linked workshops to categories/pricing tiers");

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

  // ============================================
  // Sprint 7: Coach Post-Workshop Survey Template
  // ============================================

  const coachSurveyTemplate = await prisma.surveyTemplate.upsert({
    where: { id: "coach-post-workshop-seed" },
    update: {},
    create: {
      id: "coach-post-workshop-seed",
      name: "Coach Post-Workshop Survey",
      description: "Post-event feedback from the coach — attendance, quality, conversions, and partnerships.",
      surveyType: "POST_WORKSHOP",
      isActive: true,
      createdBy: adminUser.id,
    },
  });

  const coachSurveyQuestions = [
    {
      id: "cpsq-attendance",
      sortOrder: 0,
      questionType: "RATING",
      label: "How would you rate the attendance turnout for this workshop?",
      description: "1 = Very poor, 5 = Excellent",
      isRequired: true,
    },
    {
      id: "cpsq-overall-rating",
      sortOrder: 1,
      questionType: "RATING",
      label: "Overall, how would you rate the quality of this workshop?",
      description: "1 = Very poor, 5 = Excellent",
      isRequired: true,
    },
    {
      id: "cpsq-conversions",
      sortOrder: 2,
      questionType: "TEXT",
      label: "How many attendees expressed interest in follow-up coaching or services?",
      description: "Enter a number or describe the level of interest",
      isRequired: true,
    },
    {
      id: "cpsq-partnerships",
      sortOrder: 3,
      questionType: "TEXTAREA",
      label: "Were there any partnership or collaboration opportunities that emerged?",
      description: "Describe any connections, referrals, or partnership discussions",
      isRequired: false,
    },
    {
      id: "cpsq-feedback",
      sortOrder: 4,
      questionType: "TEXTAREA",
      label: "Any additional feedback or notes about this workshop?",
      description: "Share anything notable — challenges, wins, suggestions for improvement",
      isRequired: false,
    },
  ];

  for (const q of coachSurveyQuestions) {
    await prisma.surveyQuestion.upsert({
      where: { id: q.id },
      update: {},
      create: {
        id: q.id,
        templateId: coachSurveyTemplate.id,
        sortOrder: q.sortOrder,
        questionType: q.questionType,
        label: q.label,
        description: q.description,
        isRequired: q.isRequired,
      },
    });
  }

  console.log("Created coach post-workshop survey template");

  // ============================================
  // Sprint 7: 30-Day Follow-Up Coach Survey Template
  // ============================================

  const followUpSurveyTemplate = await prisma.surveyTemplate.upsert({
    where: { id: "coach-30day-followup-seed" },
    update: {},
    create: {
      id: "coach-30day-followup-seed",
      name: "Coach 30-Day Follow-Up Survey",
      description: "30-day post-event check-in — conversion tracking and long-term outcomes.",
      surveyType: "POST_WORKSHOP",
      isActive: true,
      createdBy: adminUser.id,
    },
  });

  const followUpQuestions = [
    {
      id: "c30q-conversions",
      sortOrder: 0,
      questionType: "TEXT",
      label: "How many attendees have converted to paid coaching clients since the workshop?",
      description: "Enter a number",
      isRequired: true,
    },
    {
      id: "c30q-revenue",
      sortOrder: 1,
      questionType: "TEXT",
      label: "What is the estimated revenue generated from workshop attendee conversions?",
      description: "Enter approximate dollar amount",
      isRequired: false,
    },
    {
      id: "c30q-followups",
      sortOrder: 2,
      questionType: "TEXTAREA",
      label: "How many attendees are still in your follow-up pipeline?",
      description: "Describe active conversations or scheduled follow-ups",
      isRequired: false,
    },
    {
      id: "c30q-nps",
      sortOrder: 3,
      questionType: "NPS",
      label: "How likely are you to recommend the Scaling Up workshop platform to a fellow coach?",
      description: "0 = Not at all likely, 10 = Extremely likely",
      isRequired: true,
    },
    {
      id: "c30q-suggestions",
      sortOrder: 4,
      questionType: "TEXTAREA",
      label: "Any suggestions for improving the workshop experience or platform?",
      isRequired: false,
    },
  ];

  for (const q of followUpQuestions) {
    await prisma.surveyQuestion.upsert({
      where: { id: q.id },
      update: {},
      create: {
        id: q.id,
        templateId: followUpSurveyTemplate.id,
        sortOrder: q.sortOrder,
        questionType: q.questionType,
        label: q.label,
        description: q.description,
        isRequired: q.isRequired,
      },
    });
  }

  console.log("Created 30-day follow-up survey template");

  // ============================================
  // Sprint 7: Post-Event Workflow with Coach Surveys
  // ============================================

  const postEventWorkflow = await prisma.workflow.upsert({
    where: { id: "post-event-coach-survey-workflow-seed" },
    update: {},
    create: {
      id: "post-event-coach-survey-workflow-seed",
      name: "Post-Event Coach Survey Sequence",
      description: "Automatically sends coach feedback survey 1 day after event, then 30-day follow-up.",
      isActive: true,
      isTemplate: true,
      workflowPhase: "POST_EVENT",
      createdBy: adminUser.id,
    },
  });

  // Step 1: Coach survey 1 day after event
  await prisma.workflowStep.upsert({
    where: { id: "ws-coach-survey-1day-seed" },
    update: {},
    create: {
      id: "ws-coach-survey-1day-seed",
      workflowId: postEventWorkflow.id,
      sortOrder: 0,
      stepType: "EMAIL_COACH",
      subject: "How did your workshop go? Share your feedback",
      body: `<h2>Workshop Feedback Request</h2>
<p>Hi {{coach_name}},</p>
<p>Your workshop <strong>{{workshop_title}}</strong> has been completed. We'd love to hear how it went!</p>
<p>Please take 2 minutes to share your feedback:</p>
<br/>
<a href="{{survey_url}}" style="background-color: #1D4ED8; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold;">Complete Survey</a>
<br/><br/>
<p>Your input helps us improve the Scaling Up workshop experience for everyone.</p>
<p>— The Scaling Up Team</p>`,
      triggerType: "RELATIVE_TO_EVENT",
      offsetDays: 1,
      sendTimeOfDay: "09:00",
      isActive: true,
    },
  });

  // Step 2: 30-day follow-up survey
  await prisma.workflowStep.upsert({
    where: { id: "ws-coach-survey-30day-seed" },
    update: {},
    create: {
      id: "ws-coach-survey-30day-seed",
      workflowId: postEventWorkflow.id,
      sortOrder: 1,
      stepType: "EMAIL_COACH",
      subject: "30-Day Check-In: Workshop Conversion Results",
      body: `<h2>30-Day Follow-Up</h2>
<p>Hi {{coach_name}},</p>
<p>It's been 30 days since your workshop <strong>{{workshop_title}}</strong>. We'd like to check in on your results.</p>
<p>How many attendees have converted to coaching clients? What revenue has been generated?</p>
<br/>
<a href="{{survey_url}}" style="background-color: #1D4ED8; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold;">Share Your Results</a>
<br/><br/>
<p>This data helps us demonstrate the ROI of Scaling Up workshops and improve our platform.</p>
<p>— The Scaling Up Team</p>`,
      triggerType: "RELATIVE_TO_EVENT",
      offsetDays: 30,
      sendTimeOfDay: "09:00",
      isActive: true,
    },
  });

  console.log("Created post-event coach survey workflow");

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
