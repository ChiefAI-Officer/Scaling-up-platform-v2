/**
 * GET /api/survey-templates/[id]/results — Get aggregated survey results.
 *
 * ENH-MAY6-9: filter + group-by support. Filter params mirror the Financials
 * filter pattern (coach + category + workshop format + date range).
 *
 * Round 2 M7: all query params Zod-validated. Bad input returns 400 instead
 * of leaking past Prisma as 500.
 *
 * Gate: ADMIN/STAFF only (was session-only). The aggregator surfaces
 * cross-workshop data, which a coach must not see.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/auth";
import { isPrivilegedRole } from "@/lib/auth/authorization";
import { getSurveyResults } from "@/lib/surveys/survey-service";
import { z } from "zod";

const surveyResultsParamsSchema = z.object({
  id: z.string().min(1, "Template id is required"),
});

// Round 15 Wave 2: accept dates as YYYY-MM-DD strings (not coerced Dates) so
// the service-layer parseSurveyDateRange helper applies the inclusive-of-day
// end-date fix. Lexicographic comparison works for ISO date strings.
const isoDateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/u, "Expected YYYY-MM-DD");

const surveyResultsQuerySchema = z
  .object({
    workshopId: z.string().min(1).optional(), // "all" handled below
    coachId: z.string().min(1).optional(),
    categoryId: z.string().min(1).optional(),
    workshopFormat: z.enum(["VIRTUAL", "IN_PERSON", "HYBRID"]).optional(),
    startDate: isoDateString.optional(),
    endDate: isoDateString.optional(),
    groupBy: z.enum(["coach", "category", "format", "workshopType"]).optional(),
  })
  .refine(
    (v) => !v.startDate || !v.endDate || v.startDate <= v.endDate,
    { message: "startDate must be <= endDate", path: ["startDate"] },
  );

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Round 2 M7: tighten gate from session-only to admin/staff.
  if (!isPrivilegedRole(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const paramsValidation = surveyResultsParamsSchema.safeParse(await params);
  if (!paramsValidation.success) {
    return NextResponse.json(
      { error: "Invalid template id", details: paramsValidation.error.issues },
      { status: 400 },
    );
  }

  const queryValidation = surveyResultsQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams.entries()),
  );
  if (!queryValidation.success) {
    return NextResponse.json(
      { error: "Invalid query parameters", details: queryValidation.error.issues },
      { status: 400 },
    );
  }

  const { id: templateId } = paramsValidation.data;
  const q = queryValidation.data;
  // "all" = aggregate across all workshops (pass undefined to service).
  const workshopId = q.workshopId === "all" ? undefined : q.workshopId;

  const results = await getSurveyResults(templateId, {
    workshopId,
    coachId: q.coachId,
    categoryId: q.categoryId,
    workshopFormat: q.workshopFormat,
    startDate: q.startDate,
    endDate: q.endDate,
    groupBy: q.groupBy,
  });

  if (!results) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true, data: results });
}
