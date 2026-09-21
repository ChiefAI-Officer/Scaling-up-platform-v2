function isOn(value: string | undefined): boolean {
  return value === "1" || value === "true" || value === "TRUE" || value === "yes";
}

/**
 * Whether member-portal routes and surfaces may be reached.
 *
 * Read at call time so a test or long-lived process observes configuration
 * changes. The kill switch always wins and the feature defaults off.
 */
export function isMemberPortalEnabled(): boolean {
  if (isOn(process.env.WAVE_MP_MEMBER_PORTAL_KILL)) return false;
  return isOn(process.env.WAVE_MP_MEMBER_PORTAL_ENABLED);
}
