/**
 * GET /api/survey-templates — List all survey templates
 * POST /api/survey-templates — Create a new survey template
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  createSurveyTemplate,
  listSurveyTemplates,
} from "@/lib/survey-service";
import type { SurveyType } from "@/lib/survey-types";
import { SURVEY_TYPES } from "@/lib/survey-types";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const templates = await listSurveyTemplates();
  return NextResponse.json({ success: true, data: templates });
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { name, description, surveyType, categoryId } = body;

  if (!name || !surveyType) {
    return NextResponse.json(
      { error: "name and surveyType are required" },
      { status: 400 }
    );
  }

  const validTypes = Object.values(SURVEY_TYPES);
  if (!validTypes.includes(surveyType as SurveyType)) {
    return NextResponse.json(
      { error: `Invalid surveyType. Must be one of: ${validTypes.join(", ")}` },
      { status: 400 }
    );
  }

  const template = await createSurveyTemplate({
    name,
    description,
    surveyType,
    categoryId,
    createdBy: session.user.id,
  });

  return NextResponse.json({ success: true, data: template }, { status: 201 });
}
