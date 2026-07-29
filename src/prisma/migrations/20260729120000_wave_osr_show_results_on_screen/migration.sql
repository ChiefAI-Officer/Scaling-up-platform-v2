-- Wave OSR (spec 19an, Jeff July-10 #71) — on-screen respondent results.
--
-- Adds a single additive, NOT NULL DEFAULT false opt-in column to
-- assessment_campaigns. When true (AND the WAVE_OSR_RESPONDENT_RESULTS_ENABLED
-- flag is on), the INVITED submit route returns the respondent's own already-
-- computed Results report so the survey client can render it in place instead
-- of redirecting to the text-only thank-you page. See ADR-0027.
--
-- Deliberately independent of the two existing email toggles:
--   * "sendResultsToRespondent" governs the EMAILED results copy, which is
--     additionally gated on the template's results-email approval hash because
--     that email carries operator-authored copy. This render carries none, so
--     coupling them would have shipped the feature permanently dark (no
--     template is currently approved).
--   * "notifyCoachOnCompletion" is the coach-facing notification.
--
-- Non-destructive: additive column with a default, so existing rows keep their
-- current behaviour (no on-screen report) with no backfill and no rewrite of
-- respondent-visible state.

ALTER TABLE "assessment_campaigns"
  ADD COLUMN "showResultsOnScreen" BOOLEAN NOT NULL DEFAULT false;
