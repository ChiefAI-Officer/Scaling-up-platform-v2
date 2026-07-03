/**
 * GET /api/survey-templates — List all survey templates
 * POST /api/survey-templates — Create a new survey template
 */

import { NextRequest, NextResponse } from "next/server";
// Wave Q (#7): auth resolves through getApiActor() — the liveness checkpoint
// (soft-removed users 401 immediately, not at 30-day JWT expiry).
import { getApiActor } from "@/lib/auth/authorization";
import {
  createSurveyTemplate,
  listSurveyTemplates,
} from "@/lib/surveys/survey-service";
import type { SurveyType } from "@/lib/surveys/survey-types";
import { SURVEY_TYPES } from "@/lib/surveys/survey-types";
import { z } from "zod";

const validSurveyTypes = Object.values(SURVEY_TYPES) as [SurveyType, ...SurveyType[]];

const createSurveyTemplateSchema = z.object({
  name: z.string().trim().min(1, "name is required"),
  description: z.string().trim().optional(),
  surveyType: z.enum(validSurveyTypes),
  categoryId: z.string().min(1).optional(),
});

export async function GET() {
  const actor = await getApiActor();
  if (!actor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (actor.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const templates = await listSurveyTemplates();
  return NextResponse.json({ success: true, data: templates });
}

export async function POST(request: NextRequest) {
  const actor = await getApiActor();
  if (!actor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (actor.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const bodyValidation = createSurveyTemplateSchema.safeParse(await request.json());
  if (!bodyValidation.success) {
    return NextResponse.json(
      { error: "Invalid request body", details: bodyValidation.error.issues },
      { status: 400 }
    );
  }

  const { name, description, surveyType, categoryId } = bodyValidation.data;

  const template = await createSurveyTemplate({
    name,
    description,
    surveyType,
    categoryId,
    createdBy: actor.userId,
  });

  return NextResponse.json({ success: true, data: template }, { status: 201 });
}
