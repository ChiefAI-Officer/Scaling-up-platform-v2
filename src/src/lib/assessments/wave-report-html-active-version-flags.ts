import { isReportHtmlExperienceEnabled } from "@/lib/assessments/wave-report-html-authoring-flags";

function isOn(value: string | undefined): boolean {
  return value === "1" || value === "true" || value === "TRUE" || value === "yes";
}

export function isReportHtmlActiveVersionEnabled(): boolean {
  if (isOn(process.env.WAVE_REPORT_HTML_ACTIVE_VERSION_KILL)) return false;
  return (
    isReportHtmlExperienceEnabled() &&
    isOn(process.env.WAVE_REPORT_HTML_ACTIVE_VERSION_ENABLED)
  );
}
