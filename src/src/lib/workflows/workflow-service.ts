/**
 * Workflow Service (JV-11 + JV-22)
 *
 * CRUD operations for workflows, steps, and assignments.
 * Handles variable interpolation and schedule calculation.
 */

import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import type { StepType, TriggerType } from "@/lib/workflows/workflow-types";

// ============================================
// Types
// ============================================

export interface CreateWorkflowInput {
  name: string;
  description?: string;
  isTemplate?: boolean;
  categoryId?: string | null;
  workshopFormat?: string | null;
  workflowPhase?: string | null;
  createdBy: string;
}

export interface CreateWorkflowStepInput {
  workflowId: string;
  sortOrder: number;
  stepType: StepType;
  triggerType: TriggerType;
  emailTemplateId?: string;
  subject?: string;
  body?: string;
  customRecipients?: string[];
  offsetDays?: number;
  offsetHours?: number;
  sendTimeOfDay?: string;
  /** BUG-06: Pinned survey template for SEND_SURVEY_LINK steps */
  surveyTemplateId?: string | null;
}

export interface AssignWorkflowInput {
  workflowId: string;
  workshopId: string;
  assignedBy: string;
}

// ============================================
// Workflow CRUD
// ============================================

export async function createWorkflow(input: CreateWorkflowInput) {
  return db.workflow.create({
    data: {
      name: input.name,
      description: input.description,
      isTemplate: input.isTemplate ?? false,
      createdBy: input.createdBy,
    },
    include: { steps: true },
  });
}

export async function getWorkflow(id: string) {
  return db.workflow.findUnique({
    where: { id },
    include: {
      steps: {
        orderBy: { sortOrder: "asc" },
        include: { emailTemplate: true },
      },
      assignments: {
        include: {
          workshop: {
            select: { id: true, title: true, workshopCode: true, eventDate: true, status: true },
          },
        },
      },
    },
  });
}

export async function listWorkflows(options?: { templatesOnly?: boolean; createdBy?: string }) {
  return db.workflow.findMany({
    where: {
      ...(options?.templatesOnly ? { isTemplate: true } : {}),
      ...(options?.createdBy ? { createdBy: options.createdBy } : {}),
    },
    include: {
      steps: { orderBy: { sortOrder: "asc" } },
      _count: { select: { assignments: true } },
    },
    orderBy: { updatedAt: "desc" },
  });
}

export async function updateWorkflow(id: string, data: Partial<Pick<CreateWorkflowInput, "name" | "description" | "isTemplate" | "categoryId" | "workshopFormat" | "workflowPhase">>) {
  return db.workflow.update({
    where: { id },
    data,
    include: { steps: { orderBy: { sortOrder: "asc" } } },
  });
}

export async function deleteWorkflow(id: string) {
  return db.workflow.delete({ where: { id } });
}

export async function duplicateWorkflow(id: string, createdBy: string, newName?: string) {
  const source = await db.workflow.findUnique({
    where: { id },
    include: { steps: { orderBy: { sortOrder: "asc" } } },
  });

  if (!source) throw new Error("Workflow not found");

  return db.workflow.create({
    data: {
      name: newName || `${source.name} (Copy)`,
      description: source.description,
      isTemplate: false,
      createdBy,
      steps: {
        create: source.steps.map((step) => ({
          sortOrder: step.sortOrder,
          stepType: step.stepType,
          triggerType: step.triggerType,
          emailTemplateId: step.emailTemplateId,
          subject: step.subject,
          body: step.body,
          customRecipients: step.customRecipients,
          offsetDays: step.offsetDays,
          offsetHours: step.offsetHours,
          sendTimeOfDay: step.sendTimeOfDay,
          attachments: step.attachments,
          surveyTemplateId: step.surveyTemplateId, // BUG-06: copy pinned survey template
        })),
      },
    },
    include: { steps: { orderBy: { sortOrder: "asc" } } },
  });
}

// ============================================
// WorkflowStep CRUD
// ============================================

export async function addWorkflowStep(input: CreateWorkflowStepInput) {
  return db.workflowStep.create({
    data: {
      workflowId: input.workflowId,
      sortOrder: input.sortOrder,
      stepType: input.stepType,
      triggerType: input.triggerType,
      emailTemplateId: input.emailTemplateId,
      subject: input.subject,
      body: input.body,
      customRecipients: input.customRecipients ? JSON.stringify(input.customRecipients) : undefined,
      offsetDays: input.offsetDays,
      offsetHours: input.offsetHours,
      sendTimeOfDay: input.sendTimeOfDay,
      surveyTemplateId: input.surveyTemplateId ?? null, // BUG-06
    },
  });
}

export async function updateWorkflowStep(
  stepId: string,
  data: Partial<Omit<CreateWorkflowStepInput, "workflowId">>
) {
  return db.workflowStep.update({
    where: { id: stepId },
    data: {
      ...data,
      customRecipients: data.customRecipients ? JSON.stringify(data.customRecipients) : undefined,
    },
  });
}

export async function deleteWorkflowStep(stepId: string) {
  return db.workflowStep.delete({ where: { id: stepId } });
}

export async function reorderWorkflowSteps(workflowId: string, stepIds: string[]) {
  const updates = stepIds.map((id, index) =>
    db.workflowStep.update({ where: { id }, data: { sortOrder: index } })
  );
  return db.$transaction(updates);
}

// ============================================
// Workflow Assignment (link to workshops)
// ============================================

export async function assignWorkflowToWorkshop(input: AssignWorkflowInput) {
  const workshop = await db.workshop.findUnique({
    where: { id: input.workshopId },
    select: { workshopCode: true },
  });

  if (!workshop) throw new Error("Workshop not found");

  return db.workflowAssignment.create({
    data: {
      workflowId: input.workflowId,
      workshopId: input.workshopId,
      workshopCode: workshop.workshopCode,
      assignedBy: input.assignedBy,
    },
    include: {
      workflow: { include: { steps: { orderBy: { sortOrder: "asc" } } } },
      workshop: { select: { id: true, title: true, workshopCode: true, eventDate: true, status: true } },
    },
  });
}

export async function unassignWorkflow(assignmentId: string) {
  return db.workflowAssignment.delete({ where: { id: assignmentId } });
}

export async function getWorkshopWorkflows(workshopId: string) {
  return db.workflowAssignment.findMany({
    where: { workshopId, isActive: true },
    include: {
      workflow: {
        include: { steps: { orderBy: { sortOrder: "asc" }, where: { isActive: true } } },
      },
    },
  });
}

// ============================================
// Variable Interpolation
// ============================================

export interface WorkflowContext {
  workshopTitle: string;
  workshopCode: string;
  workshopDate: string;
  workshopTime: string;
  workshopLocation: string;
  workshopUrl: string;
  workshopFormat: string | null;
  coachName: string;
  coachEmail: string;
  registrantName?: string;
  registrantEmail?: string;
  registrantCompany?: string;
  surveyUrl?: string;
  fileLinks?: string;
}

export function interpolateTemplate(template: string, context: WorkflowContext): string {
  return template
    // camelCase (original)
    .replace(/\{\{workshopTitle\}\}/g, context.workshopTitle ?? "")
    .replace(/\{\{workshopCode\}\}/g, context.workshopCode ?? "")
    .replace(/\{\{workshopDate\}\}/g, context.workshopDate ?? "")
    .replace(/\{\{workshopTime\}\}/g, context.workshopTime ?? "")
    .replace(/\{\{workshopLocation\}\}/g, context.workshopLocation ?? "")
    .replace(/\{\{workshopUrl\}\}/g, context.workshopUrl ?? "")
    .replace(/\{\{workshopFormat\}\}/g, context.workshopFormat ?? "")
    .replace(/\{\{coachName\}\}/g, context.coachName ?? "")
    .replace(/\{\{coachEmail\}\}/g, context.coachEmail ?? "")
    .replace(/\{\{registrantName\}\}/g, context.registrantName ?? "")
    .replace(/\{\{registrantEmail\}\}/g, context.registrantEmail ?? "")
    .replace(/\{\{registrantCompany\}\}/g, context.registrantCompany ?? "")
    .replace(/\{\{surveyUrl\}\}/g, context.surveyUrl ?? "")
    .replace(/\{\{fileLinks\}\}/g, context.fileLinks ?? "")
    // snake_case aliases (user-friendly, matches landing page convention)
    .replace(/\{\{workshop_title\}\}/g, context.workshopTitle ?? "")
    .replace(/\{\{workshop_code\}\}/g, context.workshopCode ?? "")
    .replace(/\{\{workshop_date\}\}/g, context.workshopDate ?? "")
    .replace(/\{\{workshop_time\}\}/g, context.workshopTime ?? "")
    .replace(/\{\{workshop_location\}\}/g, context.workshopLocation ?? "")
    .replace(/\{\{workshop_url\}\}/g, context.workshopUrl ?? "")
    .replace(/\{\{workshop_format\}\}/g, context.workshopFormat ?? "")
    .replace(/\{\{coach_name\}\}/g, context.coachName ?? "")
    .replace(/\{\{coach_email\}\}/g, context.coachEmail ?? "")
    .replace(/\{\{attendee_name\}\}/g, context.registrantName ?? "")
    .replace(/\{\{attendee_email\}\}/g, context.registrantEmail ?? "")
    .replace(/\{\{attendee_company\}\}/g, context.registrantCompany ?? "")
    .replace(/\{\{survey_url\}\}/g, context.surveyUrl ?? "")
    .replace(/\{\{file_links\}\}/g, context.fileLinks ?? "")
    .replace(/\{\{registrant_name\}\}/g, context.registrantName ?? "")
    .replace(/\{\{registrant_email\}\}/g, context.registrantEmail ?? "")
    .replace(/\{\{registrant_company\}\}/g, context.registrantCompany ?? "");
}

// ============================================
// Schedule Calculation (JV-22)
// ============================================

export function calculateSendDate(
  eventDate: Date,
  offsetDays: number,
  offsetHours?: number | null,
  sendTimeOfDay?: string | null,
  timezone?: string
): Date {
  const sendDate = new Date(eventDate);

  // Hours-mode wins when both are set: offsetDays is ignored if offsetHours is non-zero.
  // This prevents a step with offsetDays=-1, offsetHours=-12 from compounding to -36 hours.
  if (offsetHours) {
    // Apply hour offset only (ignore offsetDays)
    sendDate.setHours(sendDate.getHours() + offsetHours);
  } else if (offsetDays !== 0) {
    // Apply day offset only (offsetHours is 0, null, or undefined)
    sendDate.setDate(sendDate.getDate() + offsetDays);
  }

  // Override time-of-day if specified (e.g., "09:00")
  // Skip when offsetHours is set — hour offsets are relative to event start time
  if (sendTimeOfDay && !offsetHours) {
    const [hours, minutes] = sendTimeOfDay.split(":").map(Number);
    sendDate.setHours(hours, minutes, 0, 0);
  }

  return sendDate;
}

// ============================================
// Cancellation
// ============================================

/**
 * Cancel pending workflow executions and mark assignments inactive when a workshop is canceled.
 * Called from (1) status/route.ts CANCELED transition and (2) route.ts DELETE path — both call
 * sites must stay in sync.
 *
 * Known limitation: jobs already sleeping via step.sleepUntil() will still fire because Inngest
 * caches step.run() results and ignores isActive=false. Future fix: emit a workflow/cancel event.
 */
export async function cancelWorkflowExecutions(
  workshopId: string,
  tx: Prisma.TransactionClient
): Promise<void> {
  // BUG-09: SCHEDULED rows (created pre-sleep so the Workflow Status card
  // shows future scheduledFor) must also be cleaned up on cancel — otherwise
  // the card keeps showing stale scheduled work after the workshop is
  // canceled.
  await tx.workflowStepExecution.updateMany({
    where: { workshopId, status: { in: ["PENDING", "SCHEDULED"] } },
    data: { status: "CANCELED" },
  });
  await tx.workflowAssignment.updateMany({
    where: { workshopId },
    data: { isActive: false },
  });
}
