import { isReportStyleKey, type ReportStyleKey } from "@/lib/assessments/report-style-registry";

/**
 * Kept as a compatibility seam for existing callers. Report-style eligibility
 * is catalog-wide; launch availability is decided separately by
 * isReportStylesEnabled.
 */
export function isReportStyleEligible(_alias: string | null | undefined): boolean {
  void _alias;
  return true;
}

/**
 * Applies the defensive rendering fallback. Stored values can originate from
 * persisted data, so this function validates them rather than trusting a cast.
 */
export function effectiveReportStyle({
  alias: _alias,
  storedStyle,
  available,
}: {
  alias: string | null | undefined;
  storedStyle: string | null | undefined;
  available: boolean;
}): ReportStyleKey {
  void _alias;
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
