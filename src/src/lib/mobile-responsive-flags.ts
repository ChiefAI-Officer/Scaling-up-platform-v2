function isOn(value: string | undefined): boolean {
  return value === "1" || value === "true" || value === "TRUE" || value === "yes";
}

export function isMobileResponsiveEnabled(): boolean {
  if (isOn(process.env.WAVE_MOBILE_RESPONSIVE_KILL)) return false;
  return isOn(process.env.WAVE_MOBILE_RESPONSIVE_ENABLED);
}
