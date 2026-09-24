import {
  DeadlineExtensionError,
  extendCampaignDeadline,
  prepareCampaignDeadlineNotificationRetry,
} from "@/lib/assessments/extend-campaign-deadline";

function harness(closeAt = new Date("2026-10-16T06:00:00.000Z")) {
  const tx = {
    $executeRaw: jest.fn().mockResolvedValue(1),
    assessmentCampaign: {
      findUnique: jest.fn().mockResolvedValue({
        id: "campaign-1", name: "Campaign", closeAt, timezone: "Australia/Sydney", status: "ACTIVE",
      }),
      update: jest.fn().mockResolvedValue({}),
    },
    assessmentInvitation: {
      findMany: jest.fn().mockResolvedValue([
        { id: "invitation-1", status: "SENT", sentAt: new Date("2026-09-01T00:00:00.000Z"), respondent: { email: "a@example.test", firstName: "A", lastName: "One" } },
      ]),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    assessmentInvitationToken: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    auditLog: { create: jest.fn().mockResolvedValue({}) },
  };
  const db = {
    $transaction: jest.fn(async (fn: (client: typeof tx) => unknown) => fn(tx)),
    assessmentCampaign: tx.assessmentCampaign,
    assessmentInvitation: tx.assessmentInvitation,
    auditLog: {
      findFirst: jest.fn().mockResolvedValue({
        changes: JSON.stringify({
          closeAt: closeAt.toISOString(),
          notificationRecipientIds: ["invitation-1"],
        }),
      }),
    },
  };
  return { db, tx };
}

it("rejects shortening before changing campaign or invitation rows", async () => {
  const { db, tx } = harness();
  await expect(extendCampaignDeadline(db as never, {
    campaignId: "campaign-1",
    newCloseAt: new Date("2026-10-15T06:00:00.000Z"),
    performedBy: "coach@example.test",
    now: new Date("2026-09-24T00:00:00.000Z"),
  })).rejects.toMatchObject<Partial<DeadlineExtensionError>>({ code: "MUST_EXTEND" });
  expect(tx.assessmentCampaign.update).not.toHaveBeenCalled();
  expect(tx.assessmentInvitation.updateMany).not.toHaveBeenCalled();
});

it("supports a read-only, deterministic notification retry after the extension committed", async () => {
  const closeAt = new Date("2026-10-16T06:00:00.000Z");
  const { db, tx } = harness(closeAt);
  const result = await prepareCampaignDeadlineNotificationRetry(db as never, {
    campaignId: "campaign-1",
    closeAt,
  });
  expect(result.retryOnly).toBe(true);
  expect(result.notificationRecipients).toHaveLength(1);
  expect(db.auditLog.findFirst).toHaveBeenCalledWith(expect.objectContaining({
    where: expect.objectContaining({
      entityId: "campaign-1",
      action: "DEADLINE_EXTEND",
    }),
  }));
  expect(tx.assessmentInvitation.findMany).toHaveBeenCalledWith(expect.objectContaining({
    where: expect.objectContaining({ id: { in: ["invitation-1"] } }),
  }));
  expect(tx.assessmentCampaign.update).not.toHaveBeenCalled();
  expect(tx.assessmentInvitation.updateMany).not.toHaveBeenCalled();
});

it("rejects an extension that would still leave the deadline expired", async () => {
  const { db, tx } = harness(new Date("2020-01-01T00:00:00.000Z"));
  await expect(extendCampaignDeadline(db as never, {
    campaignId: "campaign-1",
    newCloseAt: new Date("2020-01-02T00:00:00.000Z"),
    performedBy: "coach@example.test",
    now: new Date("2026-09-24T00:00:00.000Z"),
  })).rejects.toMatchObject<Partial<DeadlineExtensionError>>({ code: "MUST_BE_FUTURE" });
  expect(tx.assessmentCampaign.update).not.toHaveBeenCalled();
  expect(tx.assessmentInvitation.updateMany).not.toHaveBeenCalled();
});

it("atomically extends parent, fallback, snapshots, and predecessor metadata", async () => {
  const { db, tx } = harness();
  const next = new Date("2026-11-01T06:00:00.000Z");
  const result = await extendCampaignDeadline(db as never, {
    campaignId: "campaign-1", newCloseAt: next, performedBy: "coach@example.test",
    now: new Date("2026-09-24T00:00:00.000Z"),
  });
  expect(result.notificationRecipients).toHaveLength(1);
  expect(tx.assessmentInvitation.findMany).toHaveBeenCalledWith({
    where: expect.objectContaining({
      revokedAt: null,
      respondent: { deletedAt: null },
    }),
    select: expect.any(Object),
  });
  expect(tx.assessmentInvitation.updateMany).toHaveBeenCalledWith({
    where: { id: { in: ["invitation-1"] } },
    data: { expiresAt: next, stableFallbackExpiresAt: next },
  });
  expect(tx.assessmentInvitationToken.updateMany).toHaveBeenNthCalledWith(1, {
    where: { invitationId: { in: ["invitation-1"] } },
    data: { expiresAtSnapshot: next },
  });
  expect(tx.assessmentInvitationToken.updateMany).toHaveBeenNthCalledWith(2, {
    where: { invitationId: { in: ["invitation-1"] }, previousExpiresAt: { not: null } },
    data: { previousExpiresAt: next },
  });
  expect(tx.auditLog.create).toHaveBeenCalledWith({
    data: expect.objectContaining({
      changes: expect.stringContaining('"notificationRecipientIds":["invitation-1"]'),
    }),
  });
});

it("does not add invitations sent after the extension to a dispatch retry", async () => {
  const closeAt = new Date("2026-10-16T06:00:00.000Z");
  const { db, tx } = harness(closeAt);
  db.auditLog.findFirst.mockResolvedValue({
    changes: JSON.stringify({ closeAt: closeAt.toISOString(), notificationRecipientIds: [] }),
  });
  tx.assessmentInvitation.findMany.mockResolvedValue([
    { id: "sent-later", status: "SENT", sentAt: new Date(), respondent: { email: "later@example.test" } },
  ]);

  const result = await prepareCampaignDeadlineNotificationRetry(db as never, {
    campaignId: "campaign-1",
    closeAt,
  });

  expect(result.notificationRecipients).toEqual([]);
  expect(tx.assessmentInvitation.findMany).not.toHaveBeenCalled();
});

it("extends pending rows without claiming that an unsent link remains valid", async () => {
  const { db, tx } = harness();
  tx.assessmentInvitation.findMany.mockResolvedValueOnce([
    {
      id: "pending-invitation",
      status: "PENDING",
      sentAt: null,
      respondent: { email: "pending@example.test", firstName: "Pending", lastName: "Person" },
    },
  ]);
  const result = await extendCampaignDeadline(db as never, {
    campaignId: "campaign-1",
    newCloseAt: new Date("2026-11-01T06:00:00.000Z"),
    performedBy: "coach@example.test",
    now: new Date("2026-09-24T00:00:00.000Z"),
  });
  expect(result.affected).toHaveLength(1);
  expect(result.notificationRecipients).toHaveLength(0);
});
