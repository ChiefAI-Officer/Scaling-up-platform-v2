/**
 * Wave Q — admin & coach controls feature flag (default-OFF runtime gate).
 *
 * Jeff July-1 items #1 (results-email template default), #6 (disable retired
 * templates) and #7 (remove departed admins) ship behind a default-OFF global
 * flag + hard kill-switch — the dark-merge pattern of Waves M/N/O/P
 * (`@/lib/assessments/wave-p-flags`) MINUS the canary lever: these are
 * admin-global controls, so an org/template-scoped canary is meaningless
 * (documented departure, spec 19q).
 *
 * DURABLE RULE (spec 19q, co-validated): this flag gates CAPABILITIES and
 * WRITES only — the wizard default derivation, the Enable/Disable control +
 * PATCH, the remove-admin endpoint + UI. It NEVER gates the enforcement of
 * persisted admin intent: the `disabledAt` picker filter + campaign-create
 * 409 and the `User.deletedAt` login/liveness checks are unconditional
 * (inert until a row carries the marker, which only the flag-gated writes
 * can set). A kill stops further operations; it never un-retires a template
 * or un-fires an offboarding.
 *
 * Truthiness matches the Wave-O/P convention:
 *   - false when unset / "" / "0" / "false"
 *   - true only for "1" / "true" / "TRUE" / "yes"
 *
 * Env vars (read at call time so tests can set process.env):
 * - `WAVE_Q_ADMIN_CONTROLS_KILL` hard-overrides a global enable.
 * - `WAVE_Q_ADMIN_CONTROLS_ENABLED` enables globally.
 */

function isOn(v: string | undefined): boolean {
  return v === "1" || v === "true" || v === "TRUE" || v === "yes";
}

/**
 * Whether the Wave-Q admin & coach controls (capabilities/writes only — see
 * module doc) are enabled. Pure + never-throwing; default-OFF when all unset.
 */
export function isWaveQAdminControlsEnabled(): boolean {
  if (isOn(process.env.WAVE_Q_ADMIN_CONTROLS_KILL)) return false;
  return isOn(process.env.WAVE_Q_ADMIN_CONTROLS_ENABLED);
}
