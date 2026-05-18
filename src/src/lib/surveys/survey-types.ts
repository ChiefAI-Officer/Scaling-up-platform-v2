/**
 * Survey System Types & Constants (JV-13)
 */

export const SURVEY_TYPES = {
  PRE_WORKSHOP: "PRE_WORKSHOP",
  POST_WORKSHOP: "POST_WORKSHOP",
  NPS: "NPS",
} as const;

export type SurveyType = (typeof SURVEY_TYPES)[keyof typeof SURVEY_TYPES];

export const SURVEY_TYPE_LABELS: Record<SurveyType, string> = {
  PRE_WORKSHOP: "Pre-Workshop",
  POST_WORKSHOP: "Post-Workshop",
  NPS: "NPS Score",
};

export const QUESTION_TYPES = {
  TEXT: "TEXT",
  TEXTAREA: "TEXTAREA",
  RATING: "RATING",
  NPS: "NPS",
  SINGLE_CHOICE: "SINGLE_CHOICE",
  MULTI_CHOICE: "MULTI_CHOICE",
  YES_NO: "YES_NO",
} as const;

export type QuestionType = (typeof QUESTION_TYPES)[keyof typeof QUESTION_TYPES];

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  TEXT: "Short Text",
  TEXTAREA: "Long Text",
  RATING: "Rating (1-5)",
  NPS: "NPS Score (0-10)",
  SINGLE_CHOICE: "Single Choice",
  MULTI_CHOICE: "Multiple Choice",
  YES_NO: "Yes / No",
};

// Default NPS question for quick template creation
export const DEFAULT_NPS_QUESTION = {
  questionType: QUESTION_TYPES.NPS,
  label: "How likely are you to recommend this workshop to a colleague?",
  description: "0 = Not at all likely, 10 = Extremely likely",
  isRequired: true,
};

// ============================================
// Date range filter (Round 15 Wave 2)
// ============================================
//
// Survey date filters are surfaced as "YYYY-MM-DD" strings in the UI but Prisma
// queries need true Date objects. The naive `new Date("YYYY-MM-DD")` for the
// end-of-range produces 00:00 UTC of that day — which excludes same-day
// responses (e.g. a survey completed at 2026-05-13T14:32Z is dropped when the
// admin filters `endDate=2026-05-13`).
//
// `parseSurveyDateRange` normalizes this: the start date stays inclusive at
// 00:00 UTC, and the end date becomes an EXCLUSIVE bound at 00:00 UTC of the
// NEXT day. Callers then use `{ gte: startDate, lt: endDateExclusive }` in
// Prisma to include the full endDate day.

export interface SurveyDateRangeFilter {
  startDate?: Date; // inclusive
  endDateExclusive?: Date; // exclusive (start of next day)
}

export function parseSurveyDateRange(params: {
  startDate?: string | null;
  endDate?: string | null;
}): SurveyDateRangeFilter {
  const out: SurveyDateRangeFilter = {};
  if (params.startDate) {
    // 00:00 UTC of that day
    out.startDate = new Date(params.startDate);
  }
  if (params.endDate) {
    // Treat "2026-05-13" as inclusive-of-day → exclusive bound = 2026-05-14 00:00 UTC.
    // setUTCDate(...+1) correctly rolls over month-ends and year-ends.
    const end = new Date(params.endDate);
    end.setUTCDate(end.getUTCDate() + 1);
    out.endDateExclusive = end;
  }
  return out;
}
