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
