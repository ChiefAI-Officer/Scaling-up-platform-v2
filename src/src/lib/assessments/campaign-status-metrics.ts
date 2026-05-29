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
    const inv = row.invitation;

    if (inv === null) {
      metrics.new += 1;
      metrics.total += 1;
      continue;
    }

    // revoked invitations are excluded from all status bands
    if (inv.revokedAt !== null) {
      metrics.revoked += 1;
      continue;
    }

    // sentAt is the source of truth for whether the invitation was sent;
    // a PENDING row with sentAt set is treated as invited (defensive)
    if (inv.status === "PENDING" && inv.sentAt === null) {
      metrics.new += 1;
    } else {
      switch (inv.status) {
        case "PENDING":
        case "SENT":
          metrics.invited += 1;
          break;
        case "VIEWED":
          metrics.started += 1;
          break;
        case "SUBMITTED":
          metrics.completed += 1;
          break;
      }
    }

    metrics.total += 1;
  }

  return metrics;
}
