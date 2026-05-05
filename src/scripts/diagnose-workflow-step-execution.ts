/* eslint-disable */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  const workshopCode = process.argv[2] ?? "WS-2026-QN5H";

  const workshop = await db.workshop.findFirst({
    where: { workshopCode },
  });

  if (!workshop) {
    console.log(`No workshop found for code ${workshopCode}`);
    return;
  }

  console.log("=== WORKSHOP ===");
  console.log(JSON.stringify(workshop, null, 2));

  const assignments = await db.workflowAssignment.findMany({
    where: { workshopId: workshop.id },
    include: {
      workflow: {
        select: {
          id: true,
          name: true,
          steps: {
            select: {
              id: true,
              stepType: true,
              triggerType: true,
              offsetDays: true,
              offsetHours: true,
              sendTimeOfDay: true,
              sortOrder: true,
              surveyTemplateId: true,
              subject: true,
            },
            orderBy: { sortOrder: "asc" },
          },
        },
      },
    },
  });

  console.log("\n=== WORKFLOW ASSIGNMENTS ===");
  console.log(JSON.stringify(assignments, null, 2));

  const executions = await db.workflowStepExecution.findMany({
    where: { workshopId: workshop.id },
    select: {
      id: true,
      stepId: true,
      status: true,
      scheduledFor: true,
      executedAt: true,
      errorMessage: true,
      attempts: true,
      inngestEventId: true,
      registrationId: true,
      createdAt: true,
    },
    orderBy: { scheduledFor: "asc" },
  });

  console.log("\n=== WORKFLOW STEP EXECUTIONS ===");
  if (executions.length === 0) {
    console.log("(none)");
  } else {
    for (const ex of executions) {
      console.log(JSON.stringify(ex, null, 2));
    }
  }

  const registrations = await db.registration.findMany({
    where: { workshopId: workshop.id },
    select: {
      id: true,
      email: true,
      status: true,
      createdAt: true,
    },
  });

  console.log("\n=== REGISTRATIONS ===");
  console.log(JSON.stringify(registrations, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
