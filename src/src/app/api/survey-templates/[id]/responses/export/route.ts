/**
 * GET /api/survey-templates/[id]/responses/export — CSV export of all survey
 * responses for a template (Round 15 Wave 5).
 *
 * Auth: ADMIN/STAFF only. Mirrors /api/registrations/export and
 * /api/survey-templates/[id]/results — coach must not see cross-workshop data.
 *
 * Filters: same shape as the aggregate page — coachId / categoryId /
 * workshopFormat / startDate / endDate (YYYY-MM-DD).
 *
 * Unbounded: calls getSurveyResponseRows with { cap: null } so operators get
 * every row without the UI's 500-row cap.
 *
 * Per-question column serialization (one column per question, in sortOrder):
 *   TEXT/TEXTAREA → raw value (no truncation; spreadsheets handle long cells)
 *   RATING/NPS    → numeric value (numValue)
 *   SINGLE_CHOICE → selected option label (value)
 *   MULTI_CHOICE  → JSON-stringified array → "; "-joined option labels
 *   YES_NO        → "Yes" / "No" (mapped from value)
 *
 * CSV escape policy: shared rowsToCsv + escapeCsvCell from @/lib/utils/csv
 * (Wave 1 — RFC 4180, injection-protected for leading =,+,-,@,\t,\r).
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { SurveyQuestion } from "@prisma/client";
import { getApiActor, isPrivilegedRole } from "@/lib/auth/authorization";
import { getSurveyResponseRows } from "@/lib/surveys/survey-service";
import { rowsToCsv, type CsvCellInput } from "@/lib/utils/csv";

const isoDateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/u, "Expected YYYY-MM-DD");

const querySchema = z.object({
  coachId: z.string().min(1).optional(),
  categoryId: z.string().min(1).optional(),
  workshopFormat: z.string().min(1).optional(),
  startDate: isoDateString.optional(),
  endDate: isoDateString.optional(),
});

const paramsSchema = z.object({
  id: z.string().min(1),
});

/**
 * Slugify a template name for the filename. Mirrors the loose convention used
 * by generateSlug() but locked inline so a CSV filename can't accidentally
 * carry shell-special characters from arbitrary admin input.
 */
function slugifyTemplateName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/**
 * Map a single SurveyAnswer onto a CSV cell, branching on the question's type.
 *
 * MULTI_CHOICE storage: the survey form (components/surveys/survey-form-view.tsx
 * + app/survey/[id]/page.tsx) writes `JSON.stringify(selected[])`. The
 * fallback path (comma-separated) is defensive — if older data shapes ever
 * land in the DB the export still produces a human-readable cell.
 */
function serializeAnswer(
  question: Pick<SurveyQuestion, "questionType">,
  answer: { value: string | null; numValue: number | null } | undefined,
): string {
  if (!answer) return "";
  switch (question.questionType) {
    case "TEXT":
    case "TEXTAREA":
      return answer.value ?? "";
    case "RATING":
    case "NPS":
      return answer.numValue !== null ? String(answer.numValue) : "";
    case "SINGLE_CHOICE":
      return answer.value ?? "";
    case "MULTI_CHOICE": {
      if (!answer.value) return "";
      try {
        const parsed: unknown = JSON.parse(answer.value);
        if (Array.isArray(parsed)) return parsed.map((p) => String(p)).join("; ");
        return String(parsed);
      } catch {
        // Defensive: if the value isn't JSON, fall back to splitting on commas
        // and joining with "; " so the cell is still spreadsheet-friendly.
        return answer.value
          .split(",")
          .map((s) => s.trim())
          .join("; ");
      }
    }
    case "YES_NO": {
      const v = (answer.value ?? "").toLowerCase();
      if (v === "true" || v === "yes" || v === "1") return "Yes";
      if (v === "false" || v === "no" || v === "0") return "No";
      return answer.value ?? "";
    }
    default:
      return answer.value ?? "";
  }
}

function composeRespondentName(
  respondent: { firstName: string | null; lastName: string | null } | null,
): string {
  if (!respondent) return "";
  return `${respondent.firstName ?? ""} ${respondent.lastName ?? ""}`.trim();
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const actor = await getApiActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isPrivilegedRole(actor.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const paramsValidation = paramsSchema.safeParse(await params);
  if (!paramsValidation.success) {
    return NextResponse.json(
      { error: "Invalid template id", details: paramsValidation.error.issues },
      { status: 400 },
    );
  }

  const queryValidation = querySchema.safeParse(
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

  const result = await getSurveyResponseRows(
    templateId,
    {
      coachId: q.coachId,
      categoryId: q.categoryId,
      workshopFormat: q.workshopFormat,
      startDate: q.startDate,
      endDate: q.endDate,
    },
    { cap: null },
  );

  const baseHeaders = [
    "Workshop",
    "Workshop Code",
    "Coach",
    "Category",
    "Format",
    "Survey Type",
    "Respondent Name",
    "Respondent Email",
    "Sent At",
    "Completed At",
  ];

  const headers = [...baseHeaders, ...result.questions.map((q) => q.label)];

  const csvRows: Array<Array<CsvCellInput>> = result.rows.map((row) => [
    row.workshop.title,
    row.workshop.workshopCode ?? "",
    row.coach?.name ?? "",
    row.category?.name ?? "",
    row.workshop.format ?? "",
    result.template.surveyType,
    composeRespondentName(row.respondent),
    row.respondent?.email ?? "",
    row.sentAt ? row.sentAt.toISOString() : "",
    row.completedAt.toISOString(),
    ...result.questions.map((question) =>
      serializeAnswer(question, row.answersByQuestionId.get(question.id)),
    ),
  ]);

  const csv = rowsToCsv(headers, csvRows);
  const today = new Date().toISOString().slice(0, 10);
  const slug = slugifyTemplateName(result.template.name) || "survey";

  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="survey-${slug}-${today}.csv"`,
    },
  });
}
