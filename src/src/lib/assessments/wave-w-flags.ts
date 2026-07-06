/**
 * Wave W — conditional (show-if) authoring feature flag (default-OFF).
 *
 * Gates ONLY the editor's "Show only when…" panel (spec 19w §2.8).
 *
 * Deliberately NOT gated by this flag (Wave Q durable rule — flags gate
 * capability, never persisted data):
 *   - runtime showIf evaluation in the survey clients (form-visibility.ts)
 *   - the publish-time checkShowIfIntegrity gate (scoring.ts)
 *   - the submit-route hidden-answer prune (pruneHiddenAnswers)
 *   - conditionally-emptied page suppression (section-pages.ts)
 * Once a version with showIf is published, surveys must honor it regardless
 * of flag state. Kill for those pieces = revert-commit.
 *
 * Kill = zero the flag: authoring disappears; published showIf rules keep
 * rendering (persisted data).
 *
 * Two levers (no canary — the panel is admin-only authoring UI):
 * - `WAVE_W_CONDITIONAL_AUTHORING_KILL` hard-overrides everything.
 * - `WAVE_W_CONDITIONAL_AUTHORING_ENABLED` enables globally.
 *
 * Truthiness matches the Wave-M/N/O/S/T/U/V convention:
 *   - false when unset / "" / "0" / "false"
 *   - true only for "1" / "true" / "TRUE" / "yes"
 *
 * Env vars are read at call time (never cached) so tests can set process.env.
 */

function isOn(v: string | undefined): boolean {
  return v === "1" || v === "true" || v === "TRUE" || v === "yes";
}

/**
 * Whether the editor shows the per-question "Show only when…" panel.
 * Pure + never-throwing. Default-OFF when all unset.
 */
export function isConditionalAuthoringEnabled(): boolean {
  if (isOn(process.env.WAVE_W_CONDITIONAL_AUTHORING_KILL)) return false;
  return isOn(process.env.WAVE_W_CONDITIONAL_AUTHORING_ENABLED);
}
