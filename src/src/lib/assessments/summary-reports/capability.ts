import { resolveSummaryReportingState } from "./flags";
import { SUMMARY_REPORT_REGISTRY } from "./registry";
import type { SummaryReportType } from "./types";

export interface SummaryReportingCapability {
  campaignId: string;
  campaignName: string;
  assessmentName: string;
  implementedTypes: Array<{
    type: SummaryReportType;
    label: string;
    description: string;
  }>;
}

interface SummaryReportingCampaign {
  id: string;
  accessMode: string;
  template: { alias: string | null } | null;
  version: { publishedAt: Date | null } | null;
}

/**
 * Resolves the non-authorizing portion of the campaign-local Summary Reports
 * capability. Callers must still check `canViewGroupReport` before exposing
 * the returned value to a client.
 *
 * This deliberately runs before the access check: when the umbrella flag is
 * off (or the campaign is not this tracer's implemented Scaling family), the
 * host performs no additional authorization/database lookup.
 */
export function resolveSummaryReportingCapability(
  env: NodeJS.ProcessEnv,
  campaign: SummaryReportingCampaign | null,
  campaignName: string,
  assessmentName: string,
): SummaryReportingCapability | null {
  if (!campaign) return null;

  const umbrella = resolveSummaryReportingState(env, campaign.id);
  if (
    !umbrella.enabled ||
    campaign.accessMode !== "INVITED" ||
    campaign.template?.alias !== "scaling-up-full" ||
    campaign.version?.publishedAt == null
  ) {
    return null;
  }

  const implementedTypes = SUMMARY_REPORT_REGISTRY.filter(
    (definition) =>
      definition.implemented &&
      definition.templateAliases.includes("scaling-up-full"),
  ).map(({ type, label, description }) => ({ type, label, description }));

  if (implementedTypes.length === 0) return null;

  return {
    campaignId: campaign.id,
    campaignName,
    assessmentName,
    implementedTypes,
  };
}
