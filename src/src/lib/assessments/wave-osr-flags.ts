/**
 * Wave OSR — on-screen respondent results feature flag (default-OFF).
 *
 * Jeff July-10 #71: a campaign may opt in to rendering the respondent's OWN
 * Results report in place, immediately after they submit, instead of the
 * text-only thank-you page. Spec: docs/specs/v7.6/19an.
 *
 * Gates ONLY the disclosure decision on the INVITED submit route — i.e.
 * whether the already-computed report is returned to the browser at all. The
 * decision is made SERVER-side under the Phase-2 submission lock (spec 19an
 * §6), never by the client: there is no client-visible flag, and the presence
 * of the report payload in the submit response is the entire signal.
 *
 * Deliberately NOT gated by this flag (the Wave Q/W durable rule — flags gate
 * capability, never persisted data):
 *   - the stored `AssessmentCampaign.showResultsOnScreen` value.
 *
 *     ⚠️ NOTE (added when PATCH learned this field): the campaign PATCH route DOES
 *     consult this flag before accepting a WRITE to that column, and silently drops
 *     the field when the flag is off — answering 200 over a column that never
 *     changed. The in-repo control handles that by comparing the echoed row against
 *     what it sent (`handleToggleOnScreenResults`) and surfacing it as a failure; a
 *     hand-rolled client skipping that comparison would appear to save and change
 *     nothing. That is not a coercion of
 *     stored data (nothing is rewritten) and it is not a security boundary (CREATE
 *     writes the column with no flag check, and disclosure is decided under the
 *     submission lock); it exists for consistency with the route's other
 *     flag-gated fields. The wizard
 *     hides the checkbox when the flag is off but NEVER coerces the column,
 *     unlike the `sendResultsToRespondent` force-false precedent in CampaignWizard.
 *     (Cited by symbol, not line: the old `CampaignWizard.tsx:641` citation was
 *     already stale when written — it points into a different file's coordinates.)
 *     That coercion exists because a stale `true` would make the thank-you page
 *     promise an email the send path won't deliver — a user-visible lie. No
 *     such hazard exists here: with the server deciding, a stale `true`
 *     promises nobody anything.
 *   - scoring, submission persistence, and the results/coach-notify emails.
 *     Nothing about the submission itself depends on this flag.
 *
 * Kill = zero the flag: the report stops being returned, respondents fall back
 * to the thank-you page, and every stored toggle keeps its value.
 *
 * Two levers (no canary — the surface is respondent-facing, so a per-campaign
 * canary would expose the feature to real end users on a guess):
 * - `WAVE_OSR_RESPONDENT_RESULTS_KILL` hard-overrides everything.
 * - `WAVE_OSR_RESPONDENT_RESULTS_ENABLED` enables globally.
 *
 * Truthiness matches the Wave M/N/O/S/T/U/V/W convention:
 *   - false when unset / "" / "0" / "false"
 *   - true only for "1" / "true" / "TRUE" / "yes"
 *
 * Env vars are read at call time (never cached) so tests can set process.env.
 */

function isOn(v: string | undefined): boolean {
  return v === "1" || v === "true" || v === "TRUE" || v === "yes";
}

/**
 * Whether the INVITED submit route may return the respondent's own report for
 * in-place rendering. Pure + never-throwing. Default-OFF when all unset.
 *
 * This is necessary but NOT sufficient: the campaign's own
 * `showResultsOnScreen` column must also be true, re-read under the submission
 * lock (spec 19an §6).
 */
export function isOnScreenResultsEnabled(): boolean {
  if (isOn(process.env.WAVE_OSR_RESPONDENT_RESULTS_KILL)) return false;
  return isOn(process.env.WAVE_OSR_RESPONDENT_RESULTS_ENABLED);
}
