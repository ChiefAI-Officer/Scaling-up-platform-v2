/**
 * Versioned public marketing result and CTA release gate.
 *
 * Default OFF. The kill switch takes precedence. Values are read at call time
 * so server requests and tests never retain a stale flag decision.
 */
function isOn(value: string | undefined): boolean {
  return (
    value === "1" ||
    value === "true" ||
    value === "TRUE" ||
    value === "yes"
  );
}

export function isPublicMarketingCtaEnabled(): boolean {
  if (isOn(process.env.WAVE_PUBLIC_MARKETING_CTA_KILL)) return false;
  return isOn(process.env.WAVE_PUBLIC_MARKETING_CTA_ENABLED);
}
