/**
 * Client-safe answer-length limits. NO Zod / server imports — safe to import
 * from participant client components without bundling the scoring module.
 */
/** Maximum character length accepted for a TEXT answer. */
export const MAX_TEXT_ANSWER_LENGTH = 10_000;
