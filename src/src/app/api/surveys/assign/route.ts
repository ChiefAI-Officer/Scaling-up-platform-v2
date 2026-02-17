/**
 * POST /api/surveys/assign — Create survey instances for a workshop
 * Body: { templateId, workshopId, registrationId? }
 *
 * If registrationId is omitted, creates a single survey for the workshop.
 * If provided, links the survey to a specific attendee registration.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { createSurveyForWorkshop } from "@/lib/survey-service";

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { templateId, workshopId, registrationId } = body;

  if (!templateId || !workshopId) {
    return NextResponse.json(
      { error: "templateId and workshopId are required" },
      { status: 400 }
    );
  }

  try {
    const survey = await createSurveyForWorkshop({
      templateId,
      workshopId,
      registrationId,
    });

    return NextResponse.json({ success: true, data: survey }, { status: 201 });
  } catch (err) {
    if (err instanceof Error && err.message === "Workshop or template not found") {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    throw err;
  }
}
