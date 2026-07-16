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
