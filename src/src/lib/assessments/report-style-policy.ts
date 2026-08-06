import { isReportStyleKey, type ReportStyleKey } from "@/lib/assessments/report-style-registry";

const REPORT_STYLE_ELIGIBLE_ALIAS = "scaling-up-full";

export function isReportStyleEligible(alias: string | null | undefined): boolean {
  return alias === REPORT_STYLE_ELIGIBLE_ALIAS;
}

/**
 * Applies the defensive rendering fallback. Stored values can originate from
 * persisted data, so this function validates them rather than trusting a cast.
 */
export function effectiveReportStyle({
  alias,
  storedStyle,
  available,
}: {
  alias: string | null | undefined;
  storedStyle: string | null | undefined;
  available: boolean;
}): ReportStyleKey {
  if (!available || !isReportStyleEligible(alias) || !isReportStyleKey(storedStyle)) {
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
  if (explicit !== null && explicit !== undefined && explicit !== templateDefault) {
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
