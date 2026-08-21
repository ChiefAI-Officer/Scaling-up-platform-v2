import { isPreviewSettingsEnabled } from "@/lib/assessments/wave-ed10-flags";

function isOn(value: string | undefined): boolean {
  return value === "1" || value === "true" || value === "TRUE" || value === "yes";
}

export function isReportHtmlAuthoringEnabled(): boolean {
  if (isOn(process.env.WAVE_REPORT_HTML_AUTHORING_KILL)) return false;
  return isOn(process.env.WAVE_REPORT_HTML_AUTHORING_ENABLED);
}

export function isReportHtmlExperienceEnabled(): boolean {
  return isPreviewSettingsEnabled() && isReportHtmlAuthoringEnabled();
}
