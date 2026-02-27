/**
 * POST /api/survey-templates/[id]/questions — Add a question to template
 * PATCH /api/survey-templates/[id]/questions — Reorder questions
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { addQuestion, reorderQuestions } from "@/lib/survey-service";
import { QUESTION_TYPES } from "@/lib/survey-types";
import type { QuestionType } from "@/lib/survey-types";
import { z } from "zod";

const surveyTemplateQuestionParamsSchema = z.object({
  id: z.string().min(1, "Template id is required"),
});

const validQuestionTypes = Object.values(QUESTION_TYPES) as [QuestionType, ...QuestionType[]];

const addSurveyQuestionSchema = z.object({
  sortOrder: z.coerce.number().int().min(0).optional(),
  questionType: z.enum(validQuestionTypes),
  label: z.string().trim().min(1, "label is required"),
  description: z.string().optional(),
  isRequired: z.boolean().optional(),
  options: z.array(z.string()).optional(),
});

const reorderSurveyQuestionsSchema = z.object({
  questionIds: z.array(z.string().min(1)).min(1, "questionIds array is required"),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const paramsValidation = surveyTemplateQuestionParamsSchema.safeParse(await params);
  if (!paramsValidation.success) {
    return NextResponse.json(
      { error: "Invalid template id", details: paramsValidation.error.issues },
      { status: 400 }
    );
  }

  const bodyValidation = addSurveyQuestionSchema.safeParse(await request.json());
  if (!bodyValidation.success) {
    return NextResponse.json(
      { error: "Invalid request body", details: bodyValidation.error.issues },
      { status: 400 }
    );
  }

  const { id: templateId } = paramsValidation.data;
  const { sortOrder, questionType, label, description, isRequired, options } = bodyValidation.data;

  const question = await addQuestion({
    templateId,
    sortOrder: sortOrder ?? 0,
    questionType: questionType as QuestionType,
    label,
    description,
    isRequired,
    options,
  });

  return NextResponse.json({ success: true, data: question }, { status: 201 });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const paramsValidation = surveyTemplateQuestionParamsSchema.safeParse(await params);
  if (!paramsValidation.success) {
    return NextResponse.json(
      { error: "Invalid template id", details: paramsValidation.error.issues },
      { status: 400 }
    );
  }

  const bodyValidation = reorderSurveyQuestionsSchema.safeParse(await request.json());
  if (!bodyValidation.success) {
    return NextResponse.json(
      { error: "Invalid request body", details: bodyValidation.error.issues },
      { status: 400 }
    );
  }

  const { id: templateId } = paramsValidation.data;
  const { questionIds } = bodyValidation.data;

  await reorderQuestions(templateId, questionIds);
  return NextResponse.json({ success: true });
}
