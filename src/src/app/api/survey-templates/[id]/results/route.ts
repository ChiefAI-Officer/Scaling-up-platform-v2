/**
 * GET /api/survey-templates/[id]/results — Get aggregated survey results
 * Query params: ?workshopId=xxx (filter by workshop) or ?workshopId=all (aggregate across all)
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/auth";
import { getSurveyResults } from "@/lib/surveys/survey-service";
import { z } from "zod";

const surveyResultsParamsSchema = z.object({
  id: z.string().min(1, "Template id is required"),
});

const surveyResultsQuerySchema = z.object({
  workshopId: z.string().min(1).optional(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const paramsValidation = surveyResultsParamsSchema.safeParse(await params);
  if (!paramsValidation.success) {
    return NextResponse.json(
      { error: "Invalid template id", details: paramsValidation.error.issues },
      { status: 400 }
    );
  }

  const queryValidation = surveyResultsQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams.entries())
  );
  if (!queryValidation.success) {
    return NextResponse.json(
      { error: "Invalid query parameters", details: queryValidation.error.issues },
      { status: 400 }
    );
  }

  const { id: templateId } = paramsValidation.data;
  // "all" = aggregate across all workshops (pass undefined to service)
  const rawWorkshopId = queryValidation.data.workshopId;
  const workshopId = rawWorkshopId === "all" ? undefined : rawWorkshopId;

  const results = await getSurveyResults(templateId, workshopId);

  if (!results) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true, data: results });
}
