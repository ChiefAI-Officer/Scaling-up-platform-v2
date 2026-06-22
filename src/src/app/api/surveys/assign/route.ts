/**
 * POST /api/surveys/assign — Create survey instances for a workshop
 * Body: { templateId, workshopId, registrationId? }
 *
 * If registrationId is omitted, creates a single survey for the workshop.
 * If provided, links the survey to a specific attendee registration.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiActor } from "@/lib/auth/api-actor-gate";
import { createSurveyForWorkshop } from "@/lib/surveys/survey-service";
import { z } from "zod";

const assignSurveySchema = z.object({
  templateId: z.string().min(1, "templateId is required"),
  workshopId: z.string().min(1, "workshopId is required"),
  registrationId: z.string().min(1).optional(),
});

export async function POST(request: NextRequest) {
  const gate = await requireAdminApiActor();
  if (!gate.ok) {
    return NextResponse.json(
      { error: gate.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: gate.status }
    );
  }

  const bodyValidation = assignSurveySchema.safeParse(await request.json());
  if (!bodyValidation.success) {
    return NextResponse.json(
      { error: "Invalid request body", details: bodyValidation.error.issues },
      { status: 400 }
    );
  }

  const { templateId, workshopId, registrationId } = bodyValidation.data;

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
