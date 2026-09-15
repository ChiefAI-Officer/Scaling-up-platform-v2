function isOn(value: string | undefined): boolean {
  return value === "1" || value === "true" || value === "TRUE" || value === "yes";
}

export function isReportHtmlLimitsEnabled(): boolean {
  if (isOn(process.env.WAVE_REPORT_HTML_LIMITS_KILL)) return false;
  return isOn(process.env.WAVE_REPORT_HTML_LIMITS_ENABLED);
}
