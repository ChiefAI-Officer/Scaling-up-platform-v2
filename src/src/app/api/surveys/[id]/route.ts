/**
 * GET /api/surveys/[id] — Get a survey instance with questions (public-facing)
 * Used by the survey form renderer to display questions to attendees
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const survey = await db.survey.findUnique({
    where: { id },
    include: {
      template: {
        include: {
          questions: {
            where: { template: { isActive: true } },
            orderBy: { sortOrder: "asc" },
          },
        },
      },
      workshop: {
        select: { title: true, workshopCode: true, eventDate: true },
      },
    },
  });

  if (!survey) {
    return NextResponse.json({ error: "Survey not found" }, { status: 404 });
  }

  if (survey.completedAt) {
    return NextResponse.json(
      { error: "Survey already completed", completedAt: survey.completedAt },
      { status: 410 }
    );
  }

  // Return sanitized data (no internal IDs exposed unnecessarily)
  return NextResponse.json({
    success: true,
    data: {
      id: survey.id,
      surveyType: survey.surveyType,
      workshopTitle: survey.workshop.title,
      workshopCode: survey.workshop.workshopCode,
      eventDate: survey.workshop.eventDate,
      templateName: survey.template?.name,
      questions: (survey.template?.questions || []).map((q) => ({
        id: q.id,
        questionType: q.questionType,
        label: q.label,
        description: q.description,
        isRequired: q.isRequired,
        options: q.options ? JSON.parse(q.options) : undefined,
        sortOrder: q.sortOrder,
      })),
    },
  });
}
