export interface CampaignStatusMetricsInput {
  participantId: string;
  invitation: {
    status: "PENDING" | "SENT" | "VIEWED" | "SUBMITTED";
    sentAt: Date | null;
    revokedAt: Date | null;
  } | null;
}

export interface CampaignStatusMetrics {
  total: number;
  new: number;
  invited: number;
  started: number;
  completed: number;
  revoked: number;
}

export type InvitationBand =
  | "new"
  | "invited"
  | "started"
  | "completed"
  | "revoked";

/**
 * Classify a single invitation row into its staged-progress band.
 * This is the single source of truth — `computeCampaignStatusMetrics`
 * calls this internally so per-row display and aggregate counts can
 * never drift.
 *
 * Rules (in priority order):
 *  1. null invitation                          → "new"
 *  2. revokedAt is set                         → "revoked"  (excluded from total)
 *  3. PENDING + sentAt null                    → "new"
 *  4. PENDING + sentAt set (defensive edge)    → "invited"
 *  5. SENT                                     → "invited"
 *  6. VIEWED                                   → "started"
 *  7. SUBMITTED                                → "completed"
 */
export function getInvitationBand(
  invitation: CampaignStatusMetricsInput["invitation"],
): InvitationBand {
  if (invitation === null) return "new";
  if (invitation.revokedAt !== null) return "revoked";
  if (invitation.status === "PENDING" && invitation.sentAt === null) return "new";
  switch (invitation.status) {
    case "PENDING":
    case "SENT":
      return "invited";
    case "VIEWED":
      return "started";
    case "SUBMITTED":
      return "completed";
  }
}

export function computeCampaignStatusMetrics(
  rows: ReadonlyArray<CampaignStatusMetricsInput>,
): CampaignStatusMetrics {
  const metrics: CampaignStatusMetrics = {
    total: 0,
    new: 0,
    invited: 0,
    started: 0,
    completed: 0,
    revoked: 0,
  };

  for (const row of rows) {
    const band = getInvitationBand(row.invitation);
    if (band === "revoked") {
      metrics.revoked += 1;
      continue;
    }
    metrics[band] += 1;
    metrics.total += 1;
  }

  return metrics;
}
