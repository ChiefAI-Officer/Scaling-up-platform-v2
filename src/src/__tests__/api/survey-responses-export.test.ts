/**
 * Round 15 Wave 5: GET /api/survey-templates/[id]/responses/export — CSV export.
 *
 * Contract:
 * - Auth: ADMIN + STAFF only (mirrors /api/registrations/export and /results)
 * - Calls getSurveyResponseRows with { cap: null } so the export is unbounded
 * - Base columns: Workshop, Workshop Code, Coach, Category, Format, Survey Type,
 *   Respondent Name, Respondent Email, Sent At, Completed At
 * - Per-question columns in template sortOrder, named after question.label
 * - Per-type serialization:
 *     TEXT/TEXTAREA → raw value
 *     RATING/NPS    → numValue
 *     SINGLE_CHOICE → value (selected label)
 *     MULTI_CHOICE  → JSON-stringified array joined with "; "
 *     YES_NO        → "Yes" / "No"
 * - CSV injection: cells starting with =,+,-,@,\t,\r get a leading single quote
 * - Filename: survey-<slug>-YYYY-MM-DD.csv
 */

jest.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) =>
      new Response(JSON.stringify(body), {
        status: init?.status || 200,
        headers: init?.headers,
      }),
  },
  NextRequest: class MockNextRequest extends Request {
    nextUrl: URL;
    constructor(input: string | URL, init?: RequestInit) {
      super(input, init);
      this.nextUrl = new URL(typeof input === "string" ? input : input.toString());
    }
  },
}));

jest.mock("@/lib/auth/authorization", () => ({
  getApiActor: jest.fn(),
  isPrivilegedRole: jest.fn((role: string) => role === "ADMIN" || role === "STAFF"),
}));

jest.mock("@/lib/surveys/survey-service", () => ({
  getSurveyResponseRows: jest.fn(),
}));

import { NextRequest } from "next/server";
import { getApiActor } from "@/lib/auth/authorization";
import { getSurveyResponseRows } from "@/lib/surveys/survey-service";
import { GET } from "@/app/api/survey-templates/[id]/responses/export/route";

const adminActor = {
  userId: "u-admin",
  email: "admin@example.com",
  role: "ADMIN" as const,
  coachId: null,
};

const staffActor = {
  userId: "u-staff",
  email: "staff@example.com",
  role: "STAFF" as const,
  coachId: null,
};

const coachActor = {
  userId: "u-coach",
  email: "coach@example.com",
  role: "COACH" as const,
  coachId: "c1",
};

const ctx = { params: Promise.resolve({ id: "t1" }) };

function buildReq(qs: string = ""): NextRequest {
  return new NextRequest(
    `http://localhost/api/survey-templates/t1/responses/export${qs ? `?${qs}` : ""}`,
  );
}

/**
 * The jest.setup.js polyfill stores Response.body on `_body` and uses a Map
 * (case-sensitive) for headers. These helpers smooth over that so each test
 * doesn't repeat the cast.
 */
function readBody(res: Response): string {
  return String((res as unknown as { _body: unknown })._body ?? "");
}

function readHeader(res: Response, name: string): string | null {
  // Polyfill stores headers in original case (Map is case-sensitive). Try a
  // few common casings: title-case-with-hyphens, lower-case, then whatever the
  // caller passed in. Stays portable when the test polyfill changes.
  const map = res.headers as unknown as Map<string, string>;
  const titleCase = name
    .split("-")
    .map((p) => (p.length === 0 ? p : p[0].toUpperCase() + p.slice(1).toLowerCase()))
    .join("-");
  return map.get(titleCase) ?? map.get(name.toLowerCase()) ?? map.get(name) ?? null;
}

function makeQuestion(over: Partial<{ id: string; label: string; questionType: string; sortOrder: number }>) {
  return {
    id: over.id ?? "q1",
    templateId: "t1",
    sortOrder: over.sortOrder ?? 0,
    questionType: over.questionType ?? "TEXT",
    label: over.label ?? "Question",
    description: null,
    isRequired: true,
    options: null,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
  };
}

function makeRow(
  over: Partial<{
    surveyId: string;
    workshop: { id: string; title: string; workshopCode: string | null; format: string | null };
    coach: { id: string; name: string | null } | null;
    category: { id: string; name: string } | null;
    respondent: { firstName: string | null; lastName: string | null; email: string | null } | null;
    sentAt: Date | null;
    completedAt: Date;
    answersByQuestionId: Map<string, { value: string | null; numValue: number | null }>;
  }> = {},
) {
  // Use `"key" in over` checks for nullable fields so passing `null`/`undefined`
  // explicitly is honored (instead of being replaced by the default via `??`).
  return {
    surveyId: over.surveyId ?? "s1",
    workshop: over.workshop ?? {
      id: "w1",
      title: "Workshop One",
      workshopCode: "WS-2026-AAAA",
      format: "VIRTUAL",
    },
    coach: "coach" in over ? over.coach : { id: "c1", name: "Jane Doe" },
    category: "category" in over ? over.category : { id: "cat-1", name: "AI" },
    respondent:
      "respondent" in over
        ? over.respondent
        : { firstName: "Riley", lastName: "Chen", email: "riley@example.com" },
    sentAt: "sentAt" in over ? over.sentAt : new Date("2026-05-10T09:00:00Z"),
    completedAt: over.completedAt ?? new Date("2026-05-12T14:00:00Z"),
    answersByQuestionId: over.answersByQuestionId ?? new Map(),
  };
}

describe("GET /api/survey-templates/[id]/responses/export", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ============================================
  // Auth gate
  // ============================================

  it("returns 401 when actor is unauthenticated", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(null);
    const res = await GET(buildReq(), ctx);
    expect(res.status).toBe(401);
    expect(getSurveyResponseRows).not.toHaveBeenCalled();
  });

  it("returns 403 when actor is a coach", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(coachActor);
    const res = await GET(buildReq(), ctx);
    expect(res.status).toBe(403);
    expect(getSurveyResponseRows).not.toHaveBeenCalled();
  });

  it("returns 200 for ADMIN and STAFF", async () => {
    (getSurveyResponseRows as jest.Mock).mockResolvedValue({
      template: { id: "t1", name: "My Survey", surveyType: "POST_WORKSHOP" },
      questions: [],
      rows: [],
      totalCount: 0,
      cappedAt: null,
    });

    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
    const adminRes = await GET(buildReq(), ctx);
    expect(adminRes.status).toBe(200);

    (getApiActor as jest.Mock).mockResolvedValue(staffActor);
    const staffRes = await GET(buildReq(), ctx);
    expect(staffRes.status).toBe(200);
  });

  // ============================================
  // CSV shape
  // ============================================

  it("CSV header line contains all base columns + one per-question column in sortOrder", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
    (getSurveyResponseRows as jest.Mock).mockResolvedValue({
      template: { id: "t1", name: "Post-Workshop Survey", surveyType: "POST_WORKSHOP" },
      questions: [
        makeQuestion({ id: "q1", label: "Overall rating", questionType: "RATING", sortOrder: 0 }),
        makeQuestion({ id: "q2", label: "Comments", questionType: "TEXT", sortOrder: 1 }),
        makeQuestion({ id: "q3", label: "Recommend?", questionType: "YES_NO", sortOrder: 2 }),
      ],
      rows: [],
      totalCount: 0,
      cappedAt: null,
    });

    const res = await GET(buildReq(), ctx);
    expect(res.status).toBe(200);
    const body = readBody(res);
    const headerLine = body.split("\r\n")[0];

    // Base columns (in spec order)
    expect(headerLine).toContain('"Workshop"');
    expect(headerLine).toContain('"Workshop Code"');
    expect(headerLine).toContain('"Coach"');
    expect(headerLine).toContain('"Category"');
    expect(headerLine).toContain('"Format"');
    expect(headerLine).toContain('"Survey Type"');
    expect(headerLine).toContain('"Respondent Name"');
    expect(headerLine).toContain('"Respondent Email"');
    expect(headerLine).toContain('"Sent At"');
    expect(headerLine).toContain('"Completed At"');

    // Question columns appear AFTER base columns, in sortOrder
    const qPositions = ["Overall rating", "Comments", "Recommend?"].map((q) =>
      headerLine.indexOf(`"${q}"`),
    );
    expect(qPositions[0]).toBeGreaterThan(headerLine.indexOf('"Completed At"'));
    expect(qPositions[1]).toBeGreaterThan(qPositions[0]);
    expect(qPositions[2]).toBeGreaterThan(qPositions[1]);
  });

  it("serializes MULTI_CHOICE answer as semicolon-joined option labels", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
    (getSurveyResponseRows as jest.Mock).mockResolvedValue({
      template: { id: "t1", name: "Survey", surveyType: "POST_WORKSHOP" },
      questions: [makeQuestion({ id: "q1", label: "Pick all", questionType: "MULTI_CHOICE" })],
      rows: [
        makeRow({
          answersByQuestionId: new Map([
            ["q1", { value: JSON.stringify(["Option A", "Option B"]), numValue: null }],
          ]),
        }),
      ],
      totalCount: 1,
      cappedAt: null,
    });

    const res = await GET(buildReq(), ctx);
    const body = readBody(res);
    expect(body).toContain('"Option A; Option B"');
  });

  it("serializes per-type answers: RATING/NPS numeric, YES_NO mapped, SINGLE_CHOICE label", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
    (getSurveyResponseRows as jest.Mock).mockResolvedValue({
      template: { id: "t1", name: "Survey", surveyType: "POST_WORKSHOP" },
      questions: [
        makeQuestion({ id: "qR", label: "Rate", questionType: "RATING", sortOrder: 0 }),
        makeQuestion({ id: "qN", label: "NPS", questionType: "NPS", sortOrder: 1 }),
        makeQuestion({ id: "qY", label: "Yes?", questionType: "YES_NO", sortOrder: 2 }),
        makeQuestion({ id: "qS", label: "Pick one", questionType: "SINGLE_CHOICE", sortOrder: 3 }),
      ],
      rows: [
        makeRow({
          answersByQuestionId: new Map([
            ["qR", { value: "4", numValue: 4 }],
            ["qN", { value: "9", numValue: 9 }],
            ["qY", { value: "true", numValue: null }],
            ["qS", { value: "Choice B", numValue: null }],
          ]),
        }),
      ],
      totalCount: 1,
      cappedAt: null,
    });

    const res = await GET(buildReq(), ctx);
    const body = readBody(res);
    const dataLine = body.split("\r\n")[1];
    // RATING numeric
    expect(dataLine).toContain('"4"');
    // NPS numeric
    expect(dataLine).toContain('"9"');
    // YES_NO mapped
    expect(dataLine).toContain('"Yes"');
    // SINGLE_CHOICE label
    expect(dataLine).toContain('"Choice B"');
  });

  it("applies CSV injection escape: a value of =foo becomes the escaped form", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
    (getSurveyResponseRows as jest.Mock).mockResolvedValue({
      template: { id: "t1", name: "Survey", surveyType: "POST_WORKSHOP" },
      questions: [makeQuestion({ id: "q1", label: "Comment", questionType: "TEXT" })],
      rows: [
        makeRow({
          answersByQuestionId: new Map([["q1", { value: "=SUM(A1:A10)", numValue: null }]]),
        }),
      ],
      totalCount: 1,
      cappedAt: null,
    });

    const res = await GET(buildReq(), ctx);
    const body = readBody(res);
    // Wave 1's escapeCsvCell prepends a single quote when the cell starts with =
    expect(body).toContain(`"'=SUM(A1:A10)"`);
  });

  it("Content-Disposition includes today's date in YYYY-MM-DD and a slugified template name", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
    (getSurveyResponseRows as jest.Mock).mockResolvedValue({
      template: { id: "t1", name: "Post-Workshop Survey", surveyType: "POST_WORKSHOP" },
      questions: [],
      rows: [],
      totalCount: 0,
      cappedAt: null,
    });

    const res = await GET(buildReq(), ctx);
    const cd = readHeader(res, "content-disposition");
    expect(cd).toBeTruthy();
    const today = new Date().toISOString().slice(0, 10);
    expect(cd).toContain(`survey-post-workshop-survey-${today}.csv`);
    expect(readHeader(res, "content-type")).toMatch(/text\/csv/);
  });

  // ============================================
  // No-cap behaviour
  // ============================================

  it("calls getSurveyResponseRows with { cap: null } for unbounded export", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
    (getSurveyResponseRows as jest.Mock).mockResolvedValue({
      template: { id: "t1", name: "Survey", surveyType: "POST_WORKSHOP" },
      questions: [],
      rows: [],
      totalCount: 0,
      cappedAt: null,
    });

    await GET(buildReq(), ctx);
    expect(getSurveyResponseRows).toHaveBeenCalledTimes(1);
    const call = (getSurveyResponseRows as jest.Mock).mock.calls[0];
    // call args: (templateId, filters, options)
    expect(call[0]).toBe("t1");
    expect(call[2]).toEqual({ cap: null });
  });

  it("threads coachId/categoryId/workshopFormat/startDate/endDate from query into filters", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
    (getSurveyResponseRows as jest.Mock).mockResolvedValue({
      template: { id: "t1", name: "Survey", surveyType: "POST_WORKSHOP" },
      questions: [],
      rows: [],
      totalCount: 0,
      cappedAt: null,
    });

    await GET(
      buildReq(
        "coachId=c1&categoryId=cat1&workshopFormat=VIRTUAL&startDate=2026-05-01&endDate=2026-05-13",
      ),
      ctx,
    );
    const filters = (getSurveyResponseRows as jest.Mock).mock.calls[0][1];
    expect(filters).toMatchObject({
      coachId: "c1",
      categoryId: "cat1",
      workshopFormat: "VIRTUAL",
      startDate: "2026-05-01",
      endDate: "2026-05-13",
    });
  });

  it("rejects bad date format with 400 (YYYY-MM-DD regex enforced)", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
    const res = await GET(buildReq("startDate=05/01/2026"), ctx);
    expect(res.status).toBe(400);
    expect(getSurveyResponseRows).not.toHaveBeenCalled();
  });

  // ============================================
  // Respondent + Sent At column population
  // ============================================

  it("Respondent Name is composed firstName + lastName; empty when respondent is null", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
    (getSurveyResponseRows as jest.Mock).mockResolvedValue({
      template: { id: "t1", name: "Survey", surveyType: "POST_WORKSHOP" },
      questions: [],
      rows: [
        makeRow({
          surveyId: "s-named",
          respondent: { firstName: "Riley", lastName: "Chen", email: "riley@example.com" },
        }),
        makeRow({
          surveyId: "s-anon",
          respondent: null,
        }),
      ],
      totalCount: 2,
      cappedAt: null,
    });

    const res = await GET(buildReq(), ctx);
    const body = readBody(res);
    const lines = body.split("\r\n");
    expect(lines[1]).toContain('"Riley Chen"');
    expect(lines[1]).toContain('"riley@example.com"');
    // Anonymous row: name + email cells are RFC-4180 empty-quoted strings.
    // The escape policy always quotes, so two empty cells in a row render as `"",""`.
    expect(lines[2]).toContain('"","",'); // empty name + empty email + comma to next column
    // And explicitly: the anon row does not include "Riley Chen".
    expect(lines[2]).not.toContain("Riley Chen");
  });

  it("Sent At column is the survey.sentAt ISO timestamp; blank when null", async () => {
    (getApiActor as jest.Mock).mockResolvedValue(adminActor);
    (getSurveyResponseRows as jest.Mock).mockResolvedValue({
      template: { id: "t1", name: "Survey", surveyType: "POST_WORKSHOP" },
      questions: [],
      rows: [
        makeRow({
          surveyId: "s-sent",
          sentAt: new Date("2026-05-10T09:00:00Z"),
        }),
        makeRow({
          surveyId: "s-null-sent",
          sentAt: null,
        }),
      ],
      totalCount: 2,
      cappedAt: null,
    });

    const res = await GET(buildReq(), ctx);
    const body = readBody(res);
    expect(body).toContain('"2026-05-10T09:00:00.000Z"');
    // Second row: empty Sent At cell — at minimum the ISO string from the
    // first row must NOT appear twice.
    const occurrences = body.match(/2026-05-10T09:00:00\.000Z/g) ?? [];
    expect(occurrences.length).toBe(1);
  });
});
