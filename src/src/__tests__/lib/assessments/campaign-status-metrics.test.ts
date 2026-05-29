import {
  computeCampaignStatusMetrics,
  getInvitationBand,
  CampaignStatusMetricsInput,
} from "../../../lib/assessments/campaign-status-metrics";

function row(
  participantId: string,
  invitation: CampaignStatusMetricsInput["invitation"],
): CampaignStatusMetricsInput {
  return { participantId, invitation };
}

function inv(
  status: "PENDING" | "SENT" | "VIEWED" | "SUBMITTED",
  sentAt: Date | null,
  revokedAt: Date | null = null,
): CampaignStatusMetricsInput["invitation"] {
  return { status, sentAt, revokedAt };
}

describe("computeCampaignStatusMetrics", () => {
  test("1. empty array → all zeros", () => {
    expect(computeCampaignStatusMetrics([])).toEqual({
      total: 0,
      new: 0,
      invited: 0,
      started: 0,
      completed: 0,
      revoked: 0,
    });
  });

  test("2. single PENDING + sentAt null → new", () => {
    const result = computeCampaignStatusMetrics([
      row("p1", inv("PENDING", null)),
    ]);
    expect(result).toEqual({
      total: 1,
      new: 1,
      invited: 0,
      started: 0,
      completed: 0,
      revoked: 0,
    });
  });

  test("3. single SENT → invited", () => {
    const result = computeCampaignStatusMetrics([
      row("p1", inv("SENT", new Date())),
    ]);
    expect(result).toEqual({
      total: 1,
      new: 0,
      invited: 1,
      started: 0,
      completed: 0,
      revoked: 0,
    });
  });

  test("4. single VIEWED → started", () => {
    const result = computeCampaignStatusMetrics([
      row("p1", inv("VIEWED", new Date())),
    ]);
    expect(result).toEqual({
      total: 1,
      new: 0,
      invited: 0,
      started: 1,
      completed: 0,
      revoked: 0,
    });
  });

  test("5. single SUBMITTED → completed", () => {
    const result = computeCampaignStatusMetrics([
      row("p1", inv("SUBMITTED", new Date())),
    ]);
    expect(result).toEqual({
      total: 1,
      new: 0,
      invited: 0,
      started: 0,
      completed: 1,
      revoked: 0,
    });
  });

  test("6a. revoked+PENDING excluded from bands; revoked count goes up; total unaffected", () => {
    const result = computeCampaignStatusMetrics([
      row("p1", inv("PENDING", null, new Date())),
    ]);
    expect(result).toEqual({
      total: 0,
      new: 0,
      invited: 0,
      started: 0,
      completed: 0,
      revoked: 1,
    });
  });

  test("6b. revoked+SUBMITTED also excluded from bands", () => {
    const result = computeCampaignStatusMetrics([
      row("p1", inv("SUBMITTED", new Date(), new Date())),
    ]);
    expect(result).toEqual({
      total: 0,
      new: 0,
      invited: 0,
      started: 0,
      completed: 0,
      revoked: 1,
    });
  });

  test("7. participant with invitation null → counts as new", () => {
    const result = computeCampaignStatusMetrics([row("p1", null)]);
    expect(result).toEqual({
      total: 1,
      new: 1,
      invited: 0,
      started: 0,
      completed: 0,
      revoked: 0,
    });
  });

  test("8. PENDING with sentAt non-null (edge case) → counts as invited", () => {
    const result = computeCampaignStatusMetrics([
      row("p1", inv("PENDING", new Date())),
    ]);
    expect(result).toEqual({
      total: 1,
      new: 0,
      invited: 1,
      started: 0,
      completed: 0,
      revoked: 0,
    });
  });

  test("9. mixed batch: 1 new + 2 invited + 3 started + 4 completed + 1 revoked", () => {
    const rows: CampaignStatusMetricsInput[] = [
      // 1 new (no invitation)
      row("p-new-1", null),
      // 2 invited
      row("p-inv-1", inv("SENT", new Date())),
      row("p-inv-2", inv("SENT", new Date())),
      // 3 started
      row("p-start-1", inv("VIEWED", new Date())),
      row("p-start-2", inv("VIEWED", new Date())),
      row("p-start-3", inv("VIEWED", new Date())),
      // 4 completed
      row("p-done-1", inv("SUBMITTED", new Date())),
      row("p-done-2", inv("SUBMITTED", new Date())),
      row("p-done-3", inv("SUBMITTED", new Date())),
      row("p-done-4", inv("SUBMITTED", new Date())),
      // 1 revoked
      row("p-rev-1", inv("SENT", new Date(), new Date())),
    ];

    const result = computeCampaignStatusMetrics(rows);

    expect(result.new).toBe(1);
    expect(result.invited).toBe(2);
    expect(result.started).toBe(3);
    expect(result.completed).toBe(4);
    expect(result.revoked).toBe(1);
    expect(result.total).toBe(10);
  });

  test("10. bands sum to total invariant", () => {
    const rows: CampaignStatusMetricsInput[] = [
      row("p-new-1", null),
      row("p-inv-1", inv("SENT", new Date())),
      row("p-start-1", inv("VIEWED", new Date())),
      row("p-done-1", inv("SUBMITTED", new Date())),
      row("p-rev-1", inv("PENDING", null, new Date())),
    ];

    const result = computeCampaignStatusMetrics(rows);

    expect(result.new + result.invited + result.started + result.completed).toBe(
      result.total,
    );
  });
});

describe("getInvitationBand", () => {
  test("1. null invitation → 'new'", () => {
    expect(getInvitationBand(null)).toBe("new");
  });

  test("2. PENDING + sentAt null → 'new'", () => {
    expect(getInvitationBand(inv("PENDING", null))).toBe("new");
  });

  test("3. PENDING + sentAt set (defensive edge) → 'invited'", () => {
    expect(getInvitationBand(inv("PENDING", new Date()))).toBe("invited");
  });

  test("4. SENT + sentAt set → 'invited'", () => {
    expect(getInvitationBand(inv("SENT", new Date()))).toBe("invited");
  });

  test("5. VIEWED + sentAt set → 'started'", () => {
    expect(getInvitationBand(inv("VIEWED", new Date()))).toBe("started");
  });

  test("6. SUBMITTED + sentAt set → 'completed'", () => {
    expect(getInvitationBand(inv("SUBMITTED", new Date()))).toBe("completed");
  });

  test("7. revokedAt set (SENT) → 'revoked'", () => {
    expect(getInvitationBand(inv("SENT", new Date(), new Date()))).toBe("revoked");
  });

  test("8. aggregator and per-row helper agree on a mixed batch", () => {
    const rows: CampaignStatusMetricsInput[] = [
      row("p-new-1", null),
      row("p-inv-1", inv("SENT", new Date())),
      row("p-start-1", inv("VIEWED", new Date())),
      row("p-done-1", inv("SUBMITTED", new Date())),
      row("p-rev-1", inv("SENT", new Date(), new Date())),
    ];

    // Per-row helper returns the same classifications as the aggregator.
    const bands = rows.map((r) => getInvitationBand(r.invitation));
    expect(bands).toEqual(["new", "invited", "started", "completed", "revoked"]);

    const metrics = computeCampaignStatusMetrics(rows);
    expect(metrics.new).toBe(1);
    expect(metrics.invited).toBe(1);
    expect(metrics.started).toBe(1);
    expect(metrics.completed).toBe(1);
    expect(metrics.revoked).toBe(1);
  });
});
