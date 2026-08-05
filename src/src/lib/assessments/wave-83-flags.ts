function isOn(value: string | undefined): boolean {
  return value === "1" || value === "true" || value === "TRUE" || value === "yes";
}

export function isReferredResultsEnabled(): boolean {
  if (isOn(process.env.WAVE_83_REFERRED_RESULTS_KILL)) return false;
  return isOn(process.env.WAVE_83_REFERRED_RESULTS_ENABLED);
}
