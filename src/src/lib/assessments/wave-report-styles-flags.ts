function isOn(value: string | undefined): boolean {
  return value === "1" || value === "true" || value === "TRUE" || value === "yes";
}

function canaryMatches(
  csv: string | undefined,
  templateId: string | undefined,
  campaignId: string | undefined,
): boolean {
  const allowlist = (csv ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  return [templateId, campaignId].some(
    (id) => typeof id === "string" && id.length > 0 && allowlist.includes(id),
  );
}

/**
 * Report styles are default-OFF. A hard kill switch overrides both global and
 * exact campaign/template canary enablement; env values are read at call time.
 */
export function isReportStylesEnabled(opts?: {
  templateId?: string;
  campaignId?: string;
}): boolean {
  if (isOn(process.env.WAVE_REPORT_STYLES_KILL)) return false;

  return (
    isOn(process.env.WAVE_REPORT_STYLES_ENABLED) ||
    canaryMatches(
      process.env.WAVE_REPORT_STYLES_CANARY,
      opts?.templateId,
      opts?.campaignId,
    )
  );
}
