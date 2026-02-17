/**
 * GET /api/survey-templates/[id]/results — Get aggregated survey results
 * Query params: ?workshopId=xxx (optional filter)
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getSurveyResults } from "@/lib/survey-service";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: templateId } = await params;
  const workshopId = request.nextUrl.searchParams.get("workshopId") || undefined;

  const results = await getSurveyResults(templateId, workshopId);

  if (!results) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true, data: results });
}
