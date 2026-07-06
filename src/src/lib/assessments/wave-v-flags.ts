/**
 * Wave V — import-alerting feature flag (default-OFF runtime gate).
 *
 * Gates ONLY the alert cron's evaluation + email send (spec 19v D6).
 *
 * Deliberately NOT gated by this flag (Wave Q durable rule — flags gate
 * capability, never persisted data):
 *   - the AuditLog signal rows written by the import routes
 *     (`alert-signals.ts` writers) — they persist unconditionally so a
 *     later flag flip can still see the history.
 *
 * Kill = zero the flag: signal rows persist inert; the cron stops
 * evaluating and sending.
 *
 * Two levers (no canary — the cron is a single global consumer):
 * - `WAVE_V_IMPORT_ALERTING_KILL` hard-overrides everything.
 * - `WAVE_V_IMPORT_ALERTING_ENABLED` enables globally.
 *
 * Truthiness matches the Wave-M/N/O/S/T/U convention:
 *   - false when unset / "" / "0" / "false"
 *   - true only for "1" / "true" / "TRUE" / "yes"
 *
 * Env vars are read at call time (never cached) so tests can set process.env.
 */

function isOn(v: string | undefined): boolean {
  return v === "1" || v === "true" || v === "TRUE" || v === "yes";
}

/**
 * Whether the import-alerting cron may evaluate + send.
 * Pure + never-throwing. Default-OFF when all unset.
 */
export function isImportAlertingEnabled(): boolean {
  if (isOn(process.env.WAVE_V_IMPORT_ALERTING_KILL)) return false;
  return isOn(process.env.WAVE_V_IMPORT_ALERTING_ENABLED);
}
