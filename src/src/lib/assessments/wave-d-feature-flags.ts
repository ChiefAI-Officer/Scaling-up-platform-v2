/**
 * Wave D assessment feature flags — default-OFF runtime gates.
 *
 * Pattern mirrors Wave B's `isCustomHtmlEditorEnabled()` in
 * `/api/workshops/[id]/landing-pages/[template]/route.ts`:
 *   - Returns false when the env var is unset, empty, "0", or "false".
 *   - Returns true only on "1", "true", "TRUE", or "yes".
 *
 * Each flag is default-OFF so merging to main is dark by default;
 * launch is a separate env-var flip in Vercel (+ redeploy).
 */

function isTruthy(v: string | undefined): boolean {
  return v === "1" || v === "true" || v === "TRUE" || v === "yes";
}

/** Wave D: enables the auto-send path for assessment emails. Default OFF. */
export function waveDAutoSendEnabled(): boolean {
  return isTruthy(process.env.WAVE_D_AUTO_SEND_ENABLED);
}

/** Wave D: enables the results-email delivery path. Default OFF. */
export function waveDResultsEmailEnabled(): boolean {
  return isTruthy(process.env.WAVE_D_RESULTS_EMAIL_ENABLED);
}

/** Wave D: enables coach-notify emails on assessment submission. Default OFF. */
export function waveDCoachNotifyEnabled(): boolean {
  return isTruthy(process.env.WAVE_D_COACH_NOTIFY_ENABLED);
}

/** Wave D: enables custom-HTML substitution in assessment emails. Default OFF. */
export function waveDCustomHtmlEmailEnabled(): boolean {
  return isTruthy(process.env.WAVE_D_CUSTOM_HTML_EMAIL_ENABLED);
}

/**
 * Global assessment kill switch.
 *
 * Returns true (sends ARE paused) when ASSESSMENT_SENDS_PAUSED is set to a
 * truthy value ("1" / "true" / "TRUE" / "yes"). Returns false (sends proceed
 * normally) when unset or falsy.
 *
 * Semantics are intentionally inverted vs the enable flags above:
 * setting this to "1" STOPS sends, not starts them.
 */
export function assessmentSendsPaused(): boolean {
  return isTruthy(process.env.ASSESSMENT_SENDS_PAUSED);
}
