/**
 * PATCH /api/survey-templates/[id]/questions/[questionId] — Update a question
 * DELETE /api/survey-templates/[id]/questions/[questionId] — Delete a question
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { updateQuestion, deleteQuestion } from "@/lib/survey-service";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; questionId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { questionId } = await params;
  const body = await request.json();

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

  const { questionId } = await params;
  await deleteQuestion(questionId);
  return NextResponse.json({ success: true });
}
