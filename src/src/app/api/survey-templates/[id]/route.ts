/**
 * GET /api/survey-templates/[id] — Get a single survey template with questions
 * PATCH /api/survey-templates/[id] — Update template metadata
 * DELETE /api/survey-templates/[id] — Delete template
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  getSurveyTemplate,
  updateSurveyTemplate,
  deleteSurveyTemplate,
} from "@/lib/survey-service";
import { SURVEY_TYPES } from "@/lib/survey-types";
import type { SurveyType } from "@/lib/survey-types";
import { z } from "zod";

const surveyTemplateParamsSchema = z.object({
  id: z.string().min(1, "Template id is required"),
});

const validSurveyTypes = Object.values(SURVEY_TYPES) as [SurveyType, ...SurveyType[]];

const updateSurveyTemplateSchema = z.object({
  name: z.string().trim().min(1).optional(),
  description: z.string().trim().optional(),
  surveyType: z.enum(validSurveyTypes).optional(),
  isActive: z.boolean().optional(),
});

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const paramsValidation = surveyTemplateParamsSchema.safeParse(await params);
  if (!paramsValidation.success) {
    return NextResponse.json(
      { error: "Invalid template id", details: paramsValidation.error.issues },
      { status: 400 }
    );
  }

  const { id } = paramsValidation.data;
  const template = await getSurveyTemplate(id);

  if (!template) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true, data: template });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const paramsValidation = surveyTemplateParamsSchema.safeParse(await params);
  if (!paramsValidation.success) {
    return NextResponse.json(
      { error: "Invalid template id", details: paramsValidation.error.issues },
      { status: 400 }
    );
  }

  const bodyValidation = updateSurveyTemplateSchema.safeParse(await request.json());
  if (!bodyValidation.success) {
    return NextResponse.json(
      { error: "Invalid request body", details: bodyValidation.error.issues },
      { status: 400 }
    );
  }

  const { id } = paramsValidation.data;
  const body = bodyValidation.data;

  const template = await updateSurveyTemplate(id, body);
  return NextResponse.json({ success: true, data: template });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const paramsValidation = surveyTemplateParamsSchema.safeParse(await params);
  if (!paramsValidation.success) {
    return NextResponse.json(
      { error: "Invalid template id", details: paramsValidation.error.issues },
      { status: 400 }
    );
  }

  const { id } = paramsValidation.data;
  const result = await deleteSurveyTemplate(id);
  return NextResponse.json({ success: true, action: result.action });
}
