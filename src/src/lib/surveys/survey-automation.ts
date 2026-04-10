/**
 * Survey Automation Service (JV-13 Enhancement)
 *
 * Handles:
 * - Auto-creating pre-workshop surveys on registration confirmation
 * - Auto-creating post-workshop surveys when workshop transitions to POST_EVENT
 * - Category-based template matching (Exit Leadership / AI)
 * - Sending survey link emails to attendees
 */

import { db } from "@/lib/db";
import { SURVEY_TYPES } from "@/lib/surveys/survey-types";

/**
 * Find the best matching survey template for a workshop + survey type.
 * Priority: category-specific template > generic template of same type.
 */
async function findTemplateForWorkshop(
  workshopId: string,
  surveyType: string
): Promise<string | null> {
  const workshop = await db.workshop.findUnique({
    where: { id: workshopId },
    select: { categoryId: true },
  });

  if (!workshop) return null;

  // 1. Try category-specific template
  if (workshop.categoryId) {
    const categoryTemplate = await db.surveyTemplate.findFirst({
      where: {
        surveyType,
        categoryId: workshop.categoryId,
        isActive: true,
      },
      select: { id: true },
    });
    if (categoryTemplate) return categoryTemplate.id;
  }

  // 2. Fall back to generic template (no category)
  const genericTemplate = await db.surveyTemplate.findFirst({
    where: {
      surveyType,
      categoryId: null,
      isActive: true,
    },
    select: { id: true },
  });

  return genericTemplate?.id || null;
}

export async function getOrCreateSurveyLink(input: {
  workshopId: string;
  registrationId: string;
  surveyType: string;
}): Promise<{ surveyId: string; surveyUrl: string; surveyType: string } | null> {
  const templateId = await findTemplateForWorkshop(input.workshopId, input.surveyType);

  if (!templateId) {
    return null;
  }

  const existing = await db.survey.findFirst({
    where: {
      templateId,
      workshopId: input.workshopId,
      registrationId: input.registrationId,
      surveyType: input.surveyType,
    },
    select: { id: true },
  });

  const appUrl = process.env.APP_URL || "https://scaling-up-platform-v2.vercel.app";
  if (existing) {
    return {
      surveyId: existing.id,
      surveyUrl: `${appUrl}/survey/${existing.id}`,
      surveyType: input.surveyType,
    };
  }

  const workshop = await db.workshop.findUnique({
    where: { id: input.workshopId },
    select: { workshopCode: true },
  });

  const survey = await db.survey.create({
    data: {
      templateId,
      workshopId: input.workshopId,
      workshopCode: workshop?.workshopCode,
      registrationId: input.registrationId,
      surveyType: input.surveyType,
      sentAt: new Date(),
    },
  });

  return {
    surveyId: survey.id,
    surveyUrl: `${appUrl}/survey/${survey.id}`,
    surveyType: input.surveyType,
  };
}

/**
 * Create a pre-workshop survey for a newly registered attendee.
 * Called after registration confirmation.
 */
export async function createPreWorkshopSurvey(input: {
  workshopId: string;
  registrationId: string;
}): Promise<{ surveyId: string; surveyUrl: string } | null> {
  const templateId = await findTemplateForWorkshop(
    input.workshopId,
    SURVEY_TYPES.PRE_WORKSHOP
  );

  if (!templateId) {
    // No pre-workshop template configured for this category
    return null;
  }

  const workshop = await db.workshop.findUnique({
    where: { id: input.workshopId },
    select: { workshopCode: true },
  });

  const survey = await db.survey.create({
    data: {
      templateId,
      workshopId: input.workshopId,
      workshopCode: workshop?.workshopCode,
      registrationId: input.registrationId,
      surveyType: SURVEY_TYPES.PRE_WORKSHOP,
      sentAt: new Date(),
    },
  });

  const appUrl = process.env.APP_URL || "https://scaling-up-platform-v2.vercel.app";
  return {
    surveyId: survey.id,
    surveyUrl: `${appUrl}/survey/${survey.id}`,
  };
}

/**
 * Create post-workshop surveys for all registered attendees of a workshop.
 * Called when workshop status transitions to POST_EVENT.
 */
export async function createPostWorkshopSurveys(workshopId: string): Promise<{
  created: number;
  skipped: number;
  surveyUrls: { email: string; surveyUrl: string }[];
}> {
  const templateId = await findTemplateForWorkshop(
    workshopId,
    SURVEY_TYPES.POST_WORKSHOP
  );

  if (!templateId) {
    return { created: 0, skipped: 0, surveyUrls: [] };
  }

  const workshop = await db.workshop.findUnique({
    where: { id: workshopId },
    select: { workshopCode: true },
  });

  // Get all registered attendees
  const registrations = await db.registration.findMany({
    where: { workshopId, status: { in: ["REGISTERED", "CONFIRMED"] } },
    select: { id: true, email: true, firstName: true, lastName: true },
  });

  const appUrl = process.env.APP_URL || "https://scaling-up-platform-v2.vercel.app";
  let created = 0;
  let skipped = 0;
  const surveyUrls: { email: string; surveyUrl: string }[] = [];

  for (const reg of registrations) {
    // Check if survey already exists for this registration
    const existing = await db.survey.findFirst({
      where: {
        templateId,
        workshopId,
        registrationId: reg.id,
        surveyType: SURVEY_TYPES.POST_WORKSHOP,
      },
    });

    if (existing) {
      skipped++;
      continue;
    }

    const survey = await db.survey.create({
      data: {
        templateId,
        workshopId,
        workshopCode: workshop?.workshopCode,
        registrationId: reg.id,
        surveyType: SURVEY_TYPES.POST_WORKSHOP,
        sentAt: new Date(),
      },
    });

    surveyUrls.push({
      email: reg.email,
      surveyUrl: `${appUrl}/survey/${survey.id}`,
    });
    created++;
  }

  return { created, skipped, surveyUrls };
}

/**
 * Send survey email notification to an attendee with the survey link.
 */
export async function sendSurveyEmail(input: {
  to: string;
  registrantName: string;
  workshopTitle: string;
  surveyUrl: string;
  surveyType: string;
}): Promise<void> {
  const nodemailer = await import("nodemailer");

  if (!process.env.SMTP_HOST) {
    console.log(`[Survey Mock Email] To: ${input.to}, Survey: ${input.surveyUrl}`);
    return;
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || "587"),
    secure: false,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
  });

  const isPre = input.surveyType === SURVEY_TYPES.PRE_WORKSHOP;
  const subject = isPre
    ? `Pre-Workshop Survey: ${input.workshopTitle}`
    : `How was your experience? — ${input.workshopTitle}`;

  const html = `
    <h2>${isPre ? "Pre-Workshop Survey" : "Post-Workshop Feedback"}</h2>
    <p>Hi ${input.registrantName},</p>
    ${
      isPre
        ? `<p>We'd love to learn more about you before the workshop. Please take a moment to complete this brief survey.</p>`
        : `<p>Thank you for attending <strong>${input.workshopTitle}</strong>! We'd love to hear your feedback.</p>`
    }
    <br/>
    <a href="${input.surveyUrl}" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600;">
      ${isPre ? "Complete Pre-Workshop Survey" : "Share Your Feedback"}
    </a>
    <br/><br/>
    <p style="color: #6b7280; font-size: 14px;">This survey should take about 2-3 minutes.</p>
    <p>— The Scaling Up Team</p>
  `;

  await transporter.sendMail({
    from: process.env.SMTP_FROM || '"Scaling Up Platform" <noreply@scalingup.com>',
    to: input.to,
    subject,
    html,
  });
}
