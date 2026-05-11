/**
 * ENH-MAY6-9 + Round 1 M7: aggregator filters on getSurveyResults.
 *
 * Filters mirror the Financials filter pattern (coach + category + workshop
 * format + date range). New `groupBy` option produces a `groups` field with
 * per-bucket response counts (workshop, coach, category, format).
 */

jest.mock("@/lib/db", () => ({
  db: {
    survey: {
      findMany: jest.fn(),
    },
    surveyTemplate: {
      findUnique: jest.fn(),
    },
  },
}));

import { db } from "@/lib/db";
import { getSurveyResults } from "@/lib/surveys/survey-service";

describe("getSurveyResults — filters (ENH-MAY6-9)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (db.surveyTemplate.findUnique as jest.Mock).mockResolvedValue({
      id: "t1",
      name: "Pre-Workshop Survey",
      surveyType: "PRE_WORKSHOP",
      questions: [],
    });
    (db.survey.findMany as jest.Mock).mockResolvedValue([]);
  });

  it("threads coachId into the Prisma where clause via workshop relation", async () => {
    await getSurveyResults("t1", { coachId: "c1" });
    const call = (db.survey.findMany as jest.Mock).mock.calls[0][0];
    expect(call.where.workshop).toMatchObject({ coachId: "c1" });
  });

  it("threads categoryId into the Prisma where clause via workshop relation", async () => {
    await getSurveyResults("t1", { categoryId: "cat-ai" });
    const call = (db.survey.findMany as jest.Mock).mock.calls[0][0];
    expect(call.where.workshop).toMatchObject({ categoryId: "cat-ai" });
  });

  it("threads workshopFormat into the Prisma where clause via workshop relation", async () => {
    await getSurveyResults("t1", { workshopFormat: "VIRTUAL" });
    const call = (db.survey.findMany as jest.Mock).mock.calls[0][0];
    expect(call.where.workshop).toMatchObject({ format: "VIRTUAL" });
  });

  it("combines coachId + categoryId in the same workshop sub-clause", async () => {
    await getSurveyResults("t1", { coachId: "c1", categoryId: "cat-ai" });
    const call = (db.survey.findMany as jest.Mock).mock.calls[0][0];
    expect(call.where.workshop).toMatchObject({ coachId: "c1", categoryId: "cat-ai" });
  });

  it("threads startDate + endDate as completedAt range", async () => {
    const start = new Date("2026-04-01");
    const end = new Date("2026-05-01");
    await getSurveyResults("t1", { startDate: start, endDate: end });
    const call = (db.survey.findMany as jest.Mock).mock.calls[0][0];
    expect(call.where.completedAt).toMatchObject({ gte: start, lte: end });
  });

  it("preserves the legacy single-workshop filter via workshopId option", async () => {
    await getSurveyResults("t1", { workshopId: "w42" });
    const call = (db.survey.findMany as jest.Mock).mock.calls[0][0];
    expect(call.where.workshopId).toBe("w42");
  });

  it("produces per-coach `groups` when groupBy=coach", async () => {
    (db.survey.findMany as jest.Mock).mockResolvedValue([
      {
        id: "s1",
        answers: [],
        workshop: { title: "WS1", workshopCode: "WS-1", coachId: "c1", categoryId: null, format: "VIRTUAL", coach: { firstName: "Lynne", lastName: "V" }, workshopCategory: null },
        registration: null,
      },
      {
        id: "s2",
        answers: [],
        workshop: { title: "WS2", workshopCode: "WS-2", coachId: "c1", categoryId: null, format: "VIRTUAL", coach: { firstName: "Lynne", lastName: "V" }, workshopCategory: null },
        registration: null,
      },
      {
        id: "s3",
        answers: [],
        workshop: { title: "WS3", workshopCode: "WS-3", coachId: "c2", categoryId: null, format: "VIRTUAL", coach: { firstName: "Jeff", lastName: "V" }, workshopCategory: null },
        registration: null,
      },
    ]);
    const result = await getSurveyResults("t1", { groupBy: "coach" });
    expect(result?.groups).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "c1", label: "Lynne V", responseCount: 2 }),
        expect.objectContaining({ key: "c2", label: "Jeff V", responseCount: 1 }),
      ])
    );
  });

  it("produces per-format `groups` when groupBy=format", async () => {
    (db.survey.findMany as jest.Mock).mockResolvedValue([
      { id: "s1", answers: [], workshop: { format: "VIRTUAL", coachId: "c1", coach: { firstName: "", lastName: "" }, workshopCategory: null }, registration: null },
      { id: "s2", answers: [], workshop: { format: "IN_PERSON", coachId: "c1", coach: { firstName: "", lastName: "" }, workshopCategory: null }, registration: null },
      { id: "s3", answers: [], workshop: { format: "VIRTUAL", coachId: "c1", coach: { firstName: "", lastName: "" }, workshopCategory: null }, registration: null },
    ]);
    const result = await getSurveyResults("t1", { groupBy: "format" });
    expect(result?.groups).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "VIRTUAL", responseCount: 2 }),
        expect.objectContaining({ key: "IN_PERSON", responseCount: 1 }),
      ])
    );
  });

  it("omits `groups` when groupBy is not provided", async () => {
    const result = await getSurveyResults("t1", {});
    expect(result?.groups).toBeUndefined();
  });
});
