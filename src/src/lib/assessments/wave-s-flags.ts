/**
 * Wave S — peer-benchmarks feature flag (default-OFF runtime gate).
 *
 * Gates BOTH sides of the LVA peer-benchmarks capability (Jeff July-1 #12/#13,
 * spec 19s): the admin editor (panel render + PUT reconcile API) and the two
 * report render joins (group rating rows + the individual "compared to peers"
 * section). Flag OFF ⇒ zero benchmark DB reads on report paths and
 * byte-identical reports/pages; persisted rows are inert (kill = zero the
 * flag, values survive for a later re-enable).
 *
 * Two levers only (no canary — benchmarks are template-level platform config,
 * not per-org content):
 * - `WAVE_S_PEER_BENCHMARKS_KILL` hard-overrides everything.
 * - `WAVE_S_PEER_BENCHMARKS_ENABLED` enables globally.
 *
 * Truthiness matches the Wave-M/N/O convention:
 *   - false when unset / "" / "0" / "false"
 *   - true only for "1" / "true" / "TRUE" / "yes"
 *
 * Env vars are read at call time (never cached) so tests can set process.env.
 */

function isOn(v: string | undefined): boolean {
  return v === "1" || v === "true" || v === "TRUE" || v === "yes";
}

/**
 * Whether the peer-benchmarks capability (editor + report joins) is enabled.
 * Pure + never-throwing. Default-OFF when all unset.
 */
export function isPeerBenchmarksEnabled(): boolean {
  if (isOn(process.env.WAVE_S_PEER_BENCHMARKS_KILL)) return false;
  return isOn(process.env.WAVE_S_PEER_BENCHMARKS_ENABLED);
}
