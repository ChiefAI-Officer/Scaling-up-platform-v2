/**
 * Wave ED7 — friendly display labels for author-facing enum values.
 *
 * Display text ONLY: every consumer keeps the raw enum string as the
 * option/payload VALUE (serialization contract unchanged) and renders
 * `LABELS[value] ?? value` so an unknown enum degrades to itself.
 */

/** Question types — the 4 engine types plus the dormant v1.5 placeholders
 *  still listed (disabled) in the legacy locked type select. */
export const QUESTION_TYPE_LABELS: Record<string, string> = {
  SLIDER_LIKERT: "Slider",
  MULTI_CHOICE: "Multiple choice",
  NUMBER: "Number",
  TEXT: "Short text",
  TEXTAREA: "Paragraph",
  COMPOUND: "Compound",
};

/**
 * Wave ED10 (spec 19am-plan, T2) — friendly labels for the template-editor
 * header pills + (reserved) language display. Values stay the raw enum
 * strings everywhere; consumers render `LABELS[value] ?? value`, gated behind
 * the ED10 flag so the flag-OFF path keeps the raw enum byte-identical.
 */

/** Access mode — how respondents reach the survey. */
export const ACCESS_MODE_LABELS: Record<string, string> = {
  INVITED: "Invited",
  PUBLIC: "Public",
};

/** Aggregation mode — who can see aggregated results. */
export const AGGREGATION_MODE_LABELS: Record<string, string> = {
  FULL_VISIBILITY: "Everyone",
  CEO_ONLY: "CEO-only",
};

/**
 * Template/version language, keyed by the REAL stored values — camelCase
 * `enUS` (= `DEFAULT_TEMPLATE_LANGUAGE` in `lib/assessments/active-version.ts`),
 * NOT the hyphenated `en-US`. An unstored language degrades to itself.
 */
export const LANGUAGE_LABELS: Record<string, string> = {
  enUS: "English (US)",
  enGB: "English (UK)",
  esES: "Spanish (Spain)",
  frFR: "French (France)",
};
