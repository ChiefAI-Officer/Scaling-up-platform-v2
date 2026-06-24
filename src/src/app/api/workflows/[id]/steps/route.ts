/**
 * POST /api/workflows/[id]/steps — Add a step to a workflow
 * PATCH /api/workflows/[id]/steps — Reorder steps
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiActor } from "@/lib/auth/api-actor-gate";
import { addWorkflowStep, reorderWorkflowSteps } from "@/lib/workflows/workflow-service";
import { STEP_TYPES, TRIGGER_TYPES } from "@/lib/workflows/workflow-types";
import type { StepType, TriggerType } from "@/lib/workflows/workflow-types";
import { z } from "zod";

const workflowStepParamsSchema = z.object({
  id: z.string().min(1, "Workflow id is required"),
});

const createWorkflowStepSchema = z.object({
  stepType: z.string().min(1, "stepType is required"),
  triggerType: z.string().min(1, "triggerType is required"),
  sortOrder: z.coerce.number().int().min(0).optional(),
  subject: z.string().optional(),
  body: z.string().optional(),
  emailTemplateId: z.string().optional(),
  customRecipients: z.array(z.string().email()).optional(),
  offsetDays: z.coerce.number().int().optional(),
  offsetHours: z.coerce.number().int().optional(),
  sendTimeOfDay: z.string().optional().nullable(),
  surveyTemplateId: z.string().optional().nullable(), // BUG-06
});

const reorderWorkflowStepsSchema = z.object({
  stepIds: z.array(z.string().min(1)).min(1, "stepIds must be a non-empty array"),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireAdminApiActor();
  if (!gate.ok) {
    return NextResponse.json(
      { error: gate.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: gate.status }
    );
  }

  const paramsValidation = workflowStepParamsSchema.safeParse(await params);
  if (!paramsValidation.success) {
    return NextResponse.json(
      { error: "Invalid workflow id", details: paramsValidation.error.issues },
      { status: 400 }
    );
  }

  const bodyValidation = createWorkflowStepSchema.safeParse(await request.json());
  if (!bodyValidation.success) {
    return NextResponse.json(
      { error: "Invalid request body", details: bodyValidation.error.issues },
      { status: 400 }
    );
  }

  const { id: workflowId } = paramsValidation.data;
  const {
    stepType,
    triggerType,
    sortOrder,
    subject,
    body: emailBody,
    emailTemplateId,
    customRecipients,
    offsetDays,
    offsetHours,
    sendTimeOfDay,
    surveyTemplateId,
  } = bodyValidation.data;

  if (!stepType || !Object.values(STEP_TYPES).includes(stepType as StepType)) {
    return NextResponse.json({ error: "Invalid stepType" }, { status: 400 });
  }

  if (!triggerType || !Object.values(TRIGGER_TYPES).includes(triggerType as TriggerType)) {
    return NextResponse.json({ error: "Invalid triggerType" }, { status: 400 });
  }

  const step = await addWorkflowStep({
    workflowId,
    sortOrder: sortOrder ?? 0,
    stepType: stepType as StepType,
    triggerType: triggerType as TriggerType,
    emailTemplateId,
    subject,
    body: emailBody,
    customRecipients,
    offsetDays,
    offsetHours,
    sendTimeOfDay: sendTimeOfDay ?? undefined,
    surveyTemplateId: surveyTemplateId ?? null, // BUG-06
  });

  return NextResponse.json({ success: true, data: step }, { status: 201 });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireAdminApiActor();
  if (!gate.ok) {
    return NextResponse.json(
      { error: gate.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: gate.status }
    );
  }

  const paramsValidation = workflowStepParamsSchema.safeParse(await params);
  if (!paramsValidation.success) {
    return NextResponse.json(
      { error: "Invalid workflow id", details: paramsValidation.error.issues },
      { status: 400 }
    );
  }

  const bodyValidation = reorderWorkflowStepsSchema.safeParse(await request.json());
  if (!bodyValidation.success) {
    return NextResponse.json(
      { error: "Invalid request body", details: bodyValidation.error.issues },
      { status: 400 }
    );
  }

  const { id: workflowId } = paramsValidation.data;
  const { stepIds } = bodyValidation.data;

  await reorderWorkflowSteps(workflowId, stepIds);

  return NextResponse.json({ success: true });
}
