import { isReportStyleKey, type ReportStyleKey } from "@/lib/assessments/report-style-registry";

/**
 * Applies the defensive rendering fallback. Stored values can originate from
 * persisted data, so this function validates them rather than trusting a cast.
 */
export function effectiveReportStyle({
  storedStyle,
  available,
}: {
  storedStyle: string | null | undefined;
  available: boolean;
}): ReportStyleKey {
  if (!available || !isReportStyleKey(storedStyle)) {
    return "CLASSIC";
  }

  return storedStyle;
}

export type CampaignReportStyleResolution = Readonly<{
  reportStyle: ReportStyleKey;
  reportStyleSource: "TEMPLATE_DEFAULT" | "CAMPAIGN_OVERRIDE";
}>;

/**
 * Resolves typed persisted defaults and overrides. API input validation belongs
 * at the boundary; callers of this inheritance helper supply catalog keys.
 */
export function resolveCampaignReportStyle(
  explicit: ReportStyleKey | null | undefined,
  templateDefault: ReportStyleKey,
): CampaignReportStyleResolution {
  if (explicit !== null && explicit !== undefined) {
    return {
      reportStyle: explicit,
      reportStyleSource: "CAMPAIGN_OVERRIDE",
    };
  }

  return {
    reportStyle: templateDefault,
    reportStyleSource: "TEMPLATE_DEFAULT",
  };
}
