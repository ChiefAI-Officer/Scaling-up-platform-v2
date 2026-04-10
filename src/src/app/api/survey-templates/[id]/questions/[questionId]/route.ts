/**
 * PATCH /api/survey-templates/[id]/questions/[questionId] — Update a question
 * DELETE /api/survey-templates/[id]/questions/[questionId] — Delete a question
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/auth";
import { updateQuestion, deleteQuestion } from "@/lib/surveys/survey-service";
import { QUESTION_TYPES } from "@/lib/surveys/survey-types";
import type { QuestionType } from "@/lib/surveys/survey-types";
import { z } from "zod";

const surveyQuestionParamsSchema = z.object({
  id: z.string().min(1, "Template id is required"),
  questionId: z.string().min(1, "Question id is required"),
});

const validQuestionTypes = Object.values(QUESTION_TYPES) as [QuestionType, ...QuestionType[]];

const updateSurveyQuestionSchema = z.object({
  sortOrder: z.coerce.number().int().min(0).optional(),
  questionType: z.enum(validQuestionTypes).optional(),
  label: z.string().trim().min(1).optional(),
  description: z.string().optional(),
  isRequired: z.boolean().optional(),
  options: z.array(z.string()).optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; questionId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const paramsValidation = surveyQuestionParamsSchema.safeParse(await params);
  if (!paramsValidation.success) {
    return NextResponse.json(
      { error: "Invalid route parameters", details: paramsValidation.error.issues },
      { status: 400 }
    );
  }

  const bodyValidation = updateSurveyQuestionSchema.safeParse(await request.json());
  if (!bodyValidation.success) {
    return NextResponse.json(
      { error: "Invalid request body", details: bodyValidation.error.issues },
      { status: 400 }
    );
  }

  const { questionId } = paramsValidation.data;
  const body = bodyValidation.data;

  const question = await updateQuestion(questionId, body);
  return NextResponse.json({ success: true, data: question });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; questionId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const paramsValidation = surveyQuestionParamsSchema.safeParse(await params);
  if (!paramsValidation.success) {
    return NextResponse.json(
      { error: "Invalid route parameters", details: paramsValidation.error.issues },
      { status: 400 }
    );
  }

  const { questionId } = paramsValidation.data;
  await deleteQuestion(questionId);
  return NextResponse.json({ success: true });
}
