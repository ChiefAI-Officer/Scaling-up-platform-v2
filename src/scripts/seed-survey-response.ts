/* eslint-disable */
/**
 * Seed a completed Survey + SurveyAnswers for an existing registration.
 *
 * Usage:
 *   npx tsx scripts/seed-survey-response.ts <email> <workshopCode> <templateNameSubstring>
 *   npx tsx scripts/seed-survey-response.ts gabriel@chiefaiofficer.com WS-2026-KPW4 "General Pre-Workshop"
 *
 * Used to populate test data for verifying BUG-MAY6-8 (admin per-workshop
 * survey results view). Generates plausible answers for each question type.
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

function plausibleAnswerFor(questionType: string, label: string): {
  value: string;
  numValue: number | null;
} {
  switch (questionType) {
    case "RATING":
      return { value: "4", numValue: 4 };
    case "NPS":
      return { value: "8", numValue: 8 };
    case "YES_NO":
      return { value: "Yes", numValue: null };
    case "SINGLE_CHOICE":
      return { value: "Option A", numValue: null };
    case "MULTI_CHOICE":
      return { value: JSON.stringify(["Option A", "Option B"]), numValue: null };
    case "TEXT":
    case "TEXTAREA":
    default:
      return {
        value: `Test response for "${label}" (seeded via script for BUG-MAY6-8 verification)`,
        numValue: null,
      };
  }
}

async function main() {
  const email = process.argv[2];
  const workshopCode = process.argv[3];
  const templateMatch = process.argv[4];

  if (!email || !workshopCode || !templateMatch) {
    console.error("usage: npx tsx scripts/seed-survey-response.ts <email> <workshopCode> <templateNameSubstring>");
    process.exit(1);
  }

  const workshop = await db.workshop.findFirst({
    where: { workshopCode },
    select: { id: true, title: true, workshopCode: true },
  });
  if (!workshop) {
    console.error(`No workshop matched code "${workshopCode}"`);
    process.exit(1);
  }
  console.log(`Workshop: ${workshop.title} (${workshop.workshopCode})`);

  const registration = await db.registration.findFirst({
    where: { workshopId: workshop.id, email },
    orderBy: { createdAt: "desc" },
    select: { id: true, firstName: true, lastName: true, email: true, paymentStatus: true },
  });
  if (!registration) {
    console.error(`No registration for ${email} on this workshop`);
    process.exit(1);
  }
  console.log(`Registration: ${registration.id} (${registration.firstName} ${registration.lastName})  paymentStatus=${registration.paymentStatus}`);

  const template = await db.surveyTemplate.findFirst({
    where: { name: { contains: templateMatch, mode: "insensitive" } },
    include: { questions: { orderBy: { sortOrder: "asc" } } },
  });
  if (!template) {
    console.error(`No survey template matched "${templateMatch}"`);
    process.exit(1);
  }
  console.log(`Template: ${template.name} (${template.questions.length} questions)`);

  // Idempotency: if a Survey with completedAt already exists for this combo, no-op
  const existing = await db.survey.findFirst({
    where: {
      registrationId: registration.id,
      templateId: template.id,
      completedAt: { not: null },
    },
  });
  if (existing) {
    console.log(`Already seeded — Survey ${existing.id} completedAt=${existing.completedAt!.toISOString()}`);
    return;
  }

  // Create Survey + Answers in one transaction
  const survey = await db.survey.create({
    data: {
      workshopId: workshop.id,
      workshopCode: workshop.workshopCode,
      templateId: template.id,
      registrationId: registration.id,
      surveyType: template.surveyType,
      sentAt: new Date(),
      completedAt: new Date(),
      answers: {
        create: template.questions.map((q) => {
          const a = plausibleAnswerFor(q.questionType, q.label);
          return {
            questionId: q.id,
            value: a.value,
            numValue: a.numValue,
          };
        }),
      },
    },
  });

  console.log(`Created Survey ${survey.id} with ${template.questions.length} answers`);
  console.log("Done. Reload the admin survey results page.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
