/**
 * Round 15 Wave 2: parseSurveyDateRange — shared helper for survey date range
 * filters. Fixes the long-standing end-date midnight bug where filtering by
 * `endDate=2026-05-13` excluded same-day responses with `completedAt > 00:00 UTC`.
 *
 * Contract:
 * - Empty input → empty output.
 * - startDate "YYYY-MM-DD" → startDate as that day at 00:00 UTC (inclusive).
 * - endDate "YYYY-MM-DD" → endDateExclusive as the NEXT day at 00:00 UTC
 *   (so the Prisma filter becomes `lt: nextDay`, including the entire endDate day).
 * - null/undefined params are no-ops.
 * - Month-end and year-end rollover handled correctly via setUTCDate(...+1).
 */

import { parseSurveyDateRange } from "@/lib/surveys/survey-types";

describe("parseSurveyDateRange", () => {
  it("returns empty object when no params provided", () => {
    const result = parseSurveyDateRange({});
    expect(result.startDate).toBeUndefined();
    expect(result.endDateExclusive).toBeUndefined();
  });

  it("parses startDate as 00:00 UTC of that day with no endDateExclusive", () => {
    const result = parseSurveyDateRange({ startDate: "2026-05-13" });
    expect(result.startDate?.toISOString()).toBe("2026-05-13T00:00:00.000Z");
    expect(result.endDateExclusive).toBeUndefined();
  });

  it("parses endDate as exclusive bound = start of next day, no startDate", () => {
    const result = parseSurveyDateRange({ endDate: "2026-05-13" });
    expect(result.startDate).toBeUndefined();
    expect(result.endDateExclusive?.toISOString()).toBe("2026-05-14T00:00:00.000Z");
  });

  it("parses both startDate + endDate together", () => {
    const result = parseSurveyDateRange({
      startDate: "2026-05-10",
      endDate: "2026-05-13",
    });
    expect(result.startDate?.toISOString()).toBe("2026-05-10T00:00:00.000Z");
    expect(result.endDateExclusive?.toISOString()).toBe("2026-05-14T00:00:00.000Z");
  });

  it("rolls over month-end correctly (May 31 → June 1)", () => {
    const result = parseSurveyDateRange({ endDate: "2026-05-31" });
    expect(result.endDateExclusive?.toISOString()).toBe("2026-06-01T00:00:00.000Z");
  });

  it("rolls over year-end correctly (Dec 31 → Jan 1)", () => {
    const result = parseSurveyDateRange({ endDate: "2026-12-31" });
    expect(result.endDateExclusive?.toISOString()).toBe("2027-01-01T00:00:00.000Z");
  });

  it("treats null and undefined params as no-ops", () => {
    const nullResult = parseSurveyDateRange({ startDate: null, endDate: null });
    expect(nullResult.startDate).toBeUndefined();
    expect(nullResult.endDateExclusive).toBeUndefined();

    const undefinedResult = parseSurveyDateRange({
      startDate: undefined,
      endDate: undefined,
    });
    expect(undefinedResult.startDate).toBeUndefined();
    expect(undefinedResult.endDateExclusive).toBeUndefined();
  });
});
