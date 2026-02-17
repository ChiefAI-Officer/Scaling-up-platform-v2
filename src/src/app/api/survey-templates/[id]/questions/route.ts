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

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: templateId } = await params;
  const body = await request.json();
  const { sortOrder, questionType, label, description, isRequired, options } = body;

  if (!questionType || !label) {
    return NextResponse.json(
      { error: "questionType and label are required" },
      { status: 400 }
    );
  }

  const validTypes = Object.values(QUESTION_TYPES);
  if (!validTypes.includes(questionType as QuestionType)) {
    return NextResponse.json(
      { error: `Invalid questionType. Must be one of: ${validTypes.join(", ")}` },
      { status: 400 }
    );
  }

  const question = await addQuestion({
    templateId,
    sortOrder: sortOrder ?? 0,
    questionType,
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

  const { id: templateId } = await params;
  const body = await request.json();
  const { questionIds } = body;

  if (!Array.isArray(questionIds)) {
    return NextResponse.json(
      { error: "questionIds array is required" },
      { status: 400 }
    );
  }

  await reorderQuestions(templateId, questionIds);
  return NextResponse.json({ success: true });
}
