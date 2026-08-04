export type ReportEmailChrome = "legacy" | "gh228";

function isOn(value: string | undefined): boolean {
  return value === "1" || value === "true" || value === "TRUE" || value === "yes";
}

function canaryMatches(
  raw: string | undefined,
  campaignId: string | undefined,
): boolean {
  if (!campaignId) return false;
  return (raw ?? "")
    .split(/[\s,]+/u)
    .map((value) => value.trim())
    .filter(Boolean)
    .includes(campaignId);
}

export function reportEmailChromeForCampaign(
  campaignId?: string,
): ReportEmailChrome {
  if (isOn(process.env.WAVE_228_REPORT_EMAIL_CHROME_KILL)) return "legacy";
  if (isOn(process.env.WAVE_228_REPORT_EMAIL_CHROME_ENABLED)) return "gh228";
  return canaryMatches(
    process.env.WAVE_228_REPORT_EMAIL_CHROME_CANARY,
    campaignId,
  )
    ? "gh228"
    : "legacy";
}
