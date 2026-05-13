/**
 * Round 15 Wave 3: getSurveyResponseRows — per-response flat-row helper that
 * powers both the new <SurveyResponsesTable> (Wave 4) and the CSV export (Wave 5).
 *
 * Contract:
 * - Only includes surveys where completedAt is NOT null (skips drafts).
 * - Ordered by completedAt DESC (newest first).
 * - Filters thread through the Workshop relation: coachId/categoryId/format.
 * - Date range goes through parseSurveyDateRange so YYYY-MM-DD endDate is
 *   inclusive-of-day (Wave 2 fix carried through to this surface).
 * - Default cap = 500; cap: null returns all rows.
 * - cappedAt is set when rows.length === cap AND totalCount > cap; null otherwise.
 * - Uses the Workshop.workshopCategory relation (NOT the legacy `category` enum).
 */

jest.mock("@/lib/db", () => ({
  db: {
    survey: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
    surveyTemplate: {
      findUnique: jest.fn(),
    },
  },
}));

import { db } from "@/lib/db";
import { getSurveyResponseRows } from "@/lib/surveys/survey-service";

const TEMPLATE = {
  id: "t1",
  name: "Post-Workshop Survey",
  surveyType: "POST_WORKSHOP",
  questions: [
    {
      id: "q1",
      templateId: "t1",
      sortOrder: 0,
      questionType: "RATING",
      label: "How was it?",
      description: null,
      isRequired: true,
      options: null,
      createdAt: new Date("2026-01-01"),
      updatedAt: new Date("2026-01-01"),
    },
    {
      id: "q2",
      templateId: "t1",
      sortOrder: 1,
      questionType: "TEXT",
      label: "Any feedback?",
      description: null,
      isRequired: false,
      options: null,
      createdAt: new Date("2026-01-01"),
      updatedAt: new Date("2026-01-01"),
    },
  ],
};

function makeSurvey(
  id: string,
  completedAt: Date | null,
  overrides: Record<string, unknown> = {},
) {
  return {
    id,
    completedAt,
    workshop: {
      id: "w1",
      title: "Workshop One",
      workshopCode: "WS-2026-AAAA",
      coachId: "c1",
      categoryId: "cat-1",
      format: "VIRTUAL",
      coach: { id: "c1", firstName: "Jane", lastName: "Doe" },
      workshopCategory: { id: "cat-1", name: "AI" },
    },
    answers: [],
    ...overrides,
  };
}

describe("getSurveyResponseRows", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (db.surveyTemplate.findUnique as jest.Mock).mockResolvedValue(TEMPLATE);
    (db.survey.count as jest.Mock).mockResolvedValue(0);
    (db.survey.findMany as jest.Mock).mockResolvedValue([]);
  });

  it("filters where completedAt is not null", async () => {
    await getSurveyResponseRows("t1", {});
    const call = (db.survey.findMany as jest.Mock).mock.calls[0][0];
    expect(call.where.completedAt).toMatchObject({ not: null });
    expect(call.where.templateId).toBe("t1");
  });

  it("orders rows by completedAt DESC", async () => {
    await getSurveyResponseRows("t1", {});
    const call = (db.survey.findMany as jest.Mock).mock.calls[0][0];
    expect(call.orderBy).toEqual({ completedAt: "desc" });
  });

  it("treats YYYY-MM-DD endDate as inclusive-of-day (Wave 2 carry-through)", async () => {
    // endDate "2026-05-13" should produce an exclusive bound of
    // 2026-05-14 00:00 UTC so a survey completed at 2026-05-13T14:32Z is
    // correctly included in the rows.
    await getSurveyResponseRows("t1", {
      startDate: "2026-05-10",
      endDate: "2026-05-13",
    });
    const call = (db.survey.findMany as jest.Mock).mock.calls[0][0];
    expect(call.where.completedAt.gte.toISOString()).toBe("2026-05-10T00:00:00.000Z");
    expect(call.where.completedAt.lt.toISOString()).toBe("2026-05-14T00:00:00.000Z");
    expect(call.where.completedAt.lte).toBeUndefined();
  });

  it("threads coachId / categoryId / workshopFormat into the workshop sub-clause", async () => {
    await getSurveyResponseRows("t1", {
      coachId: "c1",
      categoryId: "cat-ai",
      workshopFormat: "VIRTUAL",
    });
    const call = (db.survey.findMany as jest.Mock).mock.calls[0][0];
    expect(call.where.workshop).toMatchObject({
      coachId: "c1",
      categoryId: "cat-ai",
      format: "VIRTUAL",
    });
    // The include must reference the `workshopCategory` relation (NOT the
    // legacy `category` enum field). This is the Codex-flagged invariant.
    expect(call.include.workshop.select.workshopCategory).toBeDefined();
    expect(call.include.workshop.select.category).toBeUndefined();
  });

  it("caps at 500 rows by default; cap: null removes the take clause", async () => {
    await getSurveyResponseRows("t1", {});
    expect((db.survey.findMany as jest.Mock).mock.calls[0][0].take).toBe(500);

    jest.clearAllMocks();
    (db.surveyTemplate.findUnique as jest.Mock).mockResolvedValue(TEMPLATE);
    (db.survey.count as jest.Mock).mockResolvedValue(0);
    (db.survey.findMany as jest.Mock).mockResolvedValue([]);

    await getSurveyResponseRows("t1", {}, { cap: null });
    const unbounded = (db.survey.findMany as jest.Mock).mock.calls[0][0];
    expect(unbounded.take).toBeUndefined();
  });

  it("sets cappedAt = cap only when rows.length === cap AND totalCount > cap", async () => {
    // Scenario A: hit the cap and totalCount > cap → cappedAt = cap.
    const cappedRows = Array.from({ length: 3 }, (_, i) =>
      makeSurvey(`s${i}`, new Date(`2026-05-${10 + i}T12:00:00Z`)),
    );
    (db.survey.count as jest.Mock).mockResolvedValueOnce(10);
    (db.survey.findMany as jest.Mock).mockResolvedValueOnce(cappedRows);
    const capped = await getSurveyResponseRows("t1", {}, { cap: 3 });
    expect(capped.rows).toHaveLength(3);
    expect(capped.totalCount).toBe(10);
    expect(capped.cappedAt).toBe(3);

    // Scenario B: count <= cap → cappedAt is null even if rows.length === cap
    // (because no rows were truncated).
    jest.clearAllMocks();
    (db.surveyTemplate.findUnique as jest.Mock).mockResolvedValue(TEMPLATE);
    (db.survey.count as jest.Mock).mockResolvedValue(3);
    (db.survey.findMany as jest.Mock).mockResolvedValue(cappedRows);
    const exact = await getSurveyResponseRows("t1", {}, { cap: 3 });
    expect(exact.cappedAt).toBeNull();

    // Scenario C: rows below cap → cappedAt is null.
    jest.clearAllMocks();
    (db.surveyTemplate.findUnique as jest.Mock).mockResolvedValue(TEMPLATE);
    (db.survey.count as jest.Mock).mockResolvedValue(2);
    (db.survey.findMany as jest.Mock).mockResolvedValue(cappedRows.slice(0, 2));
    const under = await getSurveyResponseRows("t1", {}, { cap: 500 });
    expect(under.cappedAt).toBeNull();

    // Scenario D: cap: null → cappedAt is always null.
    jest.clearAllMocks();
    (db.surveyTemplate.findUnique as jest.Mock).mockResolvedValue(TEMPLATE);
    (db.survey.count as jest.Mock).mockResolvedValue(10);
    (db.survey.findMany as jest.Mock).mockResolvedValue(cappedRows);
    const unbounded = await getSurveyResponseRows("t1", {}, { cap: null });
    expect(unbounded.cappedAt).toBeNull();
  });

  it("maps rows with answersByQuestionId, coach name composition, and category", async () => {
    (db.survey.count as jest.Mock).mockResolvedValue(1);
    (db.survey.findMany as jest.Mock).mockResolvedValue([
      makeSurvey("s-row", new Date("2026-05-12T14:00:00Z"), {
        answers: [
          { questionId: "q1", value: "4", numValue: 4 },
          { questionId: "q2", value: "Loved it", numValue: null },
        ],
      }),
    ]);
    const result = await getSurveyResponseRows("t1", {});
    expect(result.rows).toHaveLength(1);
    const row = result.rows[0];
    expect(row.surveyId).toBe("s-row");
    expect(row.workshop).toEqual({
      id: "w1",
      title: "Workshop One",
      workshopCode: "WS-2026-AAAA",
    });
    expect(row.coach).toEqual({ id: "c1", name: "Jane Doe" });
    expect(row.category).toEqual({ id: "cat-1", name: "AI" });
    expect(row.completedAt.toISOString()).toBe("2026-05-12T14:00:00.000Z");
    expect(row.answersByQuestionId.get("q1")).toEqual({ value: "4", numValue: 4 });
    expect(row.answersByQuestionId.get("q2")).toEqual({ value: "Loved it", numValue: null });
    expect(row.answersByQuestionId.has("missing-q")).toBe(false);
  });

  it("returns coach.name = null when coach has no first/last name; null category when missing", async () => {
    (db.survey.count as jest.Mock).mockResolvedValue(1);
    (db.survey.findMany as jest.Mock).mockResolvedValue([
      makeSurvey("s-anon", new Date("2026-05-12T14:00:00Z"), {
        workshop: {
          id: "w1",
          title: "Workshop One",
          workshopCode: "WS-2026-AAAA",
          coach: { id: "c1", firstName: null, lastName: null },
          workshopCategory: null,
        },
      }),
    ]);
    const result = await getSurveyResponseRows("t1", {});
    expect(result.rows[0].coach).toEqual({ id: "c1", name: null });
    expect(result.rows[0].category).toBeNull();
  });

  it("returns template + ordered questions for downstream column layout", async () => {
    await getSurveyResponseRows("t1", {});
    const templateCall = (db.surveyTemplate.findUnique as jest.Mock).mock.calls[0][0];
    expect(templateCall.include.questions.orderBy).toEqual({ sortOrder: "asc" });
    // The helper's TEMPLATE mock pre-orders questions; the helper should
    // surface them unmodified for the consumer.
    const result = await getSurveyResponseRows("t1", {});
    expect(result.template).toEqual({
      id: "t1",
      name: "Post-Workshop Survey",
      surveyType: "POST_WORKSHOP",
    });
    expect(result.questions.map((q) => q.id)).toEqual(["q1", "q2"]);
  });
});
