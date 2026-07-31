import {
  runStableInvitationRejectionRetry,
  STABLE_INVITATION_REJECTION_RETRY_EVENT,
} from "@/inngest/functions/stable-invitation-rejection-retry";

describe("stable invitation rejection durable retry", () => {
  it("uses an identifier-only event contract", () => {
    expect(STABLE_INVITATION_REJECTION_RETRY_EVENT).toBe(
      "assessment/invitation.rejection-retry",
    );
  });

  it("quarantines before separately reconciling successor metadata", async () => {
    const quarantine = jest.fn().mockResolvedValue(undefined);
    const reconcile = jest.fn().mockResolvedValue(undefined);
    const isResolved = jest.fn().mockResolvedValue(false);
    const markResolved = jest.fn().mockResolvedValue(undefined);

    await expect(
      runStableInvitationRejectionRetry(
        { quarantine, reconcile, isResolved, markResolved },
        { invitationId: "inv-1", tokenId: "token-1" },
      ),
    ).resolves.toEqual({
      invitationId: "inv-1",
      tokenId: "token-1",
      quarantined: true,
      reconciled: true,
    });

    expect(quarantine).toHaveBeenCalledWith({
      invitationId: "inv-1",
      tokenId: "token-1",
    });
    expect(reconcile).toHaveBeenCalledWith({
      invitationId: "inv-1",
      tokenId: "token-1",
    });
    expect(markResolved).toHaveBeenCalledWith({
      invitationId: "inv-1",
      tokenId: "token-1",
    });
    expect(quarantine.mock.invocationCallOrder[0]).toBeLessThan(
      reconcile.mock.invocationCallOrder[0],
    );
  });

  it("throws for Inngest retry when quarantine infrastructure is still unavailable", async () => {
    const quarantine = jest
      .fn()
      .mockRejectedValue(new Error("database unavailable"));
    const reconcile = jest.fn();
    const isResolved = jest.fn().mockResolvedValue(false);
    const markResolved = jest.fn();

    await expect(
      runStableInvitationRejectionRetry(
        { quarantine, reconcile, isResolved, markResolved },
        { invitationId: "inv-1", tokenId: "token-1" },
      ),
    ).rejects.toThrow("database unavailable");
    expect(reconcile).not.toHaveBeenCalled();
    expect(markResolved).not.toHaveBeenCalled();
  });

  it("retries reconciliation without undoing a completed quarantine", async () => {
    const quarantine = jest.fn().mockResolvedValue(undefined);
    const reconcile = jest
      .fn()
      .mockRejectedValueOnce(new Error("transient successor rewrite"))
      .mockResolvedValueOnce(undefined);
    const isResolved = jest.fn().mockResolvedValue(false);
    const markResolved = jest.fn().mockResolvedValue(undefined);
    const input = { invitationId: "inv-1", tokenId: "token-1" };

    await expect(
      runStableInvitationRejectionRetry(
        { quarantine, reconcile, isResolved, markResolved },
        input,
      ),
    ).rejects.toThrow("transient successor rewrite");
    await expect(
      runStableInvitationRejectionRetry(
        { quarantine, reconcile, isResolved, markResolved },
        input,
      ),
    ).resolves.toMatchObject({ quarantined: true, reconciled: true });

    expect(quarantine).toHaveBeenCalledTimes(2);
    expect(reconcile).toHaveBeenCalledTimes(2);
    expect(markResolved).toHaveBeenCalledTimes(1);
  });

  it("skips work when the audit outbox intent is already resolved", async () => {
    const quarantine = jest.fn();
    const reconcile = jest.fn();
    const markResolved = jest.fn();

    await expect(
      runStableInvitationRejectionRetry(
        {
          quarantine,
          reconcile,
          isResolved: jest.fn().mockResolvedValue(true),
          markResolved,
        },
        { invitationId: "inv-1", tokenId: "token-1" },
      ),
    ).resolves.toMatchObject({ skipped: true });
    expect(quarantine).not.toHaveBeenCalled();
    expect(reconcile).not.toHaveBeenCalled();
    expect(markResolved).not.toHaveBeenCalled();
  });
});
