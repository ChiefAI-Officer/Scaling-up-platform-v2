/**
 * Scaling Up Full landscape-report release gate (default OFF).
 *
 * This renderer is used by both server and client report paths, so its
 * build-time public environment keys are deliberately client-safe. KILL takes
 * precedence over ENABLED; values are read at call time for testability.
 */

function isOn(value: string | undefined): boolean {
  return value === "1" || value === "true" || value === "TRUE" || value === "yes";
}

/** Whether the dark-released SU Full landscape composition may render. */
export function isSuFullLandscapeReportEnabled(): boolean {
  if (isOn(process.env.NEXT_PUBLIC_WAVE_SU_FULL_LANDSCAPE_REPORT_KILL)) {
    return false;
  }
  return isOn(process.env.NEXT_PUBLIC_WAVE_SU_FULL_LANDSCAPE_REPORT_ENABLED);
}
