/**
 * PATCH /api/workflows/[id]/steps/[stepId] — Update a workflow step
 * DELETE /api/workflows/[id]/steps/[stepId] — Delete a workflow step
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/auth";
import { updateWorkflowStep, deleteWorkflowStep } from "@/lib/workflows/workflow-service";
import { STEP_TYPES, TRIGGER_TYPES } from "@/lib/workflows/workflow-types";
import type { StepType, TriggerType } from "@/lib/workflows/workflow-types";
import { z } from "zod";

const workflowStepRouteParamsSchema = z.object({
  id: z.string().min(1, "Workflow id is required"),
  stepId: z.string().min(1, "Step id is required"),
});

const updateWorkflowStepSchema = z.object({
  stepType: z.string().optional(),
  triggerType: z.string().optional(),
  subject: z.string().optional().nullable(),
  body: z.string().optional().nullable(),
  emailTemplateId: z.string().optional().nullable(),
  customRecipients: z.array(z.string().email()).optional().nullable(),
  offsetDays: z.coerce.number().int().optional().nullable(),
  offsetHours: z.coerce.number().int().optional().nullable(),
  sendTimeOfDay: z.string().optional().nullable(),
  sortOrder: z.coerce.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
  surveyTemplateId: z.string().optional().nullable(), // BUG-06
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; stepId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const paramsValidation = workflowStepRouteParamsSchema.safeParse(await params);
  if (!paramsValidation.success) {
    return NextResponse.json(
      { error: "Invalid route parameters", details: paramsValidation.error.issues },
      { status: 400 }
    );
  }

  const bodyValidation = updateWorkflowStepSchema.safeParse(await request.json());
  if (!bodyValidation.success) {
    return NextResponse.json(
      { error: "Invalid request body", details: bodyValidation.error.issues },
      { status: 400 }
    );
  }

  const { stepId } = paramsValidation.data;
  const body = bodyValidation.data;

  const updateData: Record<string, unknown> = {};

  if (body.stepType !== undefined) {
    if (!Object.values(STEP_TYPES).includes(body.stepType as StepType)) {
      return NextResponse.json({ error: "Invalid stepType" }, { status: 400 });
    }
    updateData.stepType = body.stepType;
  }

  if (body.triggerType !== undefined) {
    if (!Object.values(TRIGGER_TYPES).includes(body.triggerType as TriggerType)) {
      return NextResponse.json({ error: "Invalid triggerType" }, { status: 400 });
    }
    updateData.triggerType = body.triggerType;
  }

  if (body.subject !== undefined) updateData.subject = body.subject;
  if (body.body !== undefined) updateData.body = body.body;
  if (body.emailTemplateId !== undefined) updateData.emailTemplateId = body.emailTemplateId;
  if (body.customRecipients !== undefined) updateData.customRecipients = body.customRecipients;
  if (body.offsetDays !== undefined) updateData.offsetDays = body.offsetDays;
  if (body.offsetHours !== undefined) updateData.offsetHours = body.offsetHours;
  if (body.sendTimeOfDay !== undefined) updateData.sendTimeOfDay = body.sendTimeOfDay;
  if (body.sortOrder !== undefined) updateData.sortOrder = body.sortOrder;
  if (body.isActive !== undefined) updateData.isActive = body.isActive;
  if (body.surveyTemplateId !== undefined) updateData.surveyTemplateId = body.surveyTemplateId ?? null; // BUG-06

  const step = await updateWorkflowStep(stepId, updateData);

  return NextResponse.json({ success: true, data: step });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; stepId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const paramsValidation = workflowStepRouteParamsSchema.safeParse(await params);
  if (!paramsValidation.success) {
    return NextResponse.json(
      { error: "Invalid route parameters", details: paramsValidation.error.issues },
      { status: 400 }
    );
  }

  const { stepId } = paramsValidation.data;
  await deleteWorkflowStep(stepId);

  return NextResponse.json({ success: true });
}
