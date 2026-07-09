/**
 * Wave Z (Z-2) — shared mapper: campaign rows → CampaignListItem[] for the
 * grouped-by-company list (CampaignsListWithFilter).
 *
 * Extracted VERBATIM from the coach portal list page (/portal/assessments) so
 * the coach view and the new admin oversight page compute identical staged
 * metrics — zero drift (the /co-validate concern). Each page keeps its OWN
 * query `where` (portal: createdByCoachId; admin: accessMode "INVITED", all
 * coaches); only this pure per-row mapping is shared.
 */
import {
  computeCampaignStatusMetrics,
  type CampaignStatusMetricsInput,
} from "@/lib/assessments/campaign-status-metrics";
import type { CampaignListItem } from "@/components/assessments/CampaignsListWithFilter";

/** The campaign row shape this mapper needs (a subset of the Prisma include). */
export interface CampaignListRow {
  id: string;
  name: string;
  alias: string;
  status: CampaignListItem["status"];
  openAt: Date;
  template: { name: string };
  organization: { id: string; name: string };
  participants: { id: string; respondentId: string }[];
  invitations: {
    respondentId: string;
    status: string;
    sentAt: Date | null;
    revokedAt: Date | null;
  }[];
}

export function toCampaignListItems(
  campaigns: CampaignListRow[],
): CampaignListItem[] {
  return campaigns.map((c) => {
    // respondentId → invitation (1-to-1 per campaign).
    const invByRespondentId = new Map(
      c.invitations.map((inv) => [inv.respondentId, inv]),
    );

    // One metrics row per participant. AssessmentInvitationStatus is a superset
    // of the helper's PENDING | SENT | VIEWED | SUBMITTED — the cast is safe
    // because those are the only values an active (non-revoked) invitation holds.
    const metricsInput: CampaignStatusMetricsInput[] = c.participants.map((p) => {
      const inv = invByRespondentId.get(p.respondentId) ?? null;
      return {
        participantId: p.id,
        invitation: inv
          ? {
              status: inv.status as "PENDING" | "SENT" | "VIEWED" | "SUBMITTED",
              sentAt: inv.sentAt,
              revokedAt: inv.revokedAt,
            }
          : null,
      };
    });

    return {
      id: c.id,
      name: c.name,
      alias: c.alias,
      status: c.status,
      templateName: c.template.name,
      organizationId: c.organization.id,
      organizationName: c.organization.name,
      openAt: c.openAt.toISOString(),
      metrics: computeCampaignStatusMetrics(metricsInput),
    };
  });
}
