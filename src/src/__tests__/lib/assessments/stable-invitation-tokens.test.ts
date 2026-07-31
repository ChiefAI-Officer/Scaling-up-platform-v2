import {
  classifyInvitationSendError,
  confirmStableInvitationToken,
  markStableInvitationTokenUncertain,
  registerNewOriginalToken,
  removeRegisteredStableInvitationToken,
  resolveInvitationByStableTokenHash,
  rollbackRejectedStableInvitationToken,
  stageStableInvitationToken,
  type StableTokenDb,
  type StableTokenLookupDb,
} from "@/lib/assessments/stable-invitation-tokens";

const INVITATION_WITH_CAMPAIGN = {
  id: "inv-1",
  campaignId: "campaign-1",
  respondentId: "respondent-1",
  tokenHash: "hash",
  status: "SENT" as const,
  expiresAt: new Date("2026-12-01T00:00:00Z"),
  sentAt: new Date("2026-09-01T00:00:00Z"),
  submittedAt: null,
  revokedAt: null,
  resentCount: 0,
  lastResentAt: null,
  createdAt: new Date("2026-08-01T00:00:00Z"),
  campaign: {
    id: "campaign-1",
    alias: "leadership-vitality",
    status: "ACTIVE" as const,
    openAt: new Date("2026-08-01T00:00:00Z"),
    closeAt: null,
    deletedAt: null,
  },
};

describe("stable invitation tokens", () => {
  test("staging locks the parent, preserves its current hash, and installs the new mirror", async () => {
    const expiresAt = new Date("2026-12-01T00:00:00Z");
    const previousExpiresAt = new Date("2026-10-01T00:00:00Z");
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      assessmentInvitation: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          tokenHash: "old-hash",
          expiresAt: previousExpiresAt,
          status: "SENT",
          sentAt: new Date("2026-09-01T00:00:00Z"),
        }),
        update: jest.fn().mockResolvedValue({ id: "inv-1" }),
      },
      assessmentInvitationToken: {
        upsert: jest.fn().mockResolvedValue({ id: "legacy-token" }),
        create: jest.fn().mockResolvedValue({ id: "new-token" }),
      },
    };
    const db = {
      $transaction: jest.fn(
        async (callback: (client: typeof tx) => Promise<unknown>) =>
          callback(tx),
      ),
      assessmentInvitation: {},
      assessmentInvitationToken: {},
    } as unknown as StableTokenDb;

    const staged = await stageStableInvitationToken(db, {
      invitationId: "inv-1",
      newTokenHash: "new-hash",
      expiresAt,
      source: "REMINDER",
    });

    expect(tx.$executeRaw).toHaveBeenCalled();
    const [lockSql, lockedInvitationId] = tx.$executeRaw.mock.calls[0] as [
      TemplateStringsArray,
      string,
    ];
    expect(lockSql.join(" ")).toMatch(
      /SELECT "id"\s+FROM "assessment_invitations"\s+WHERE "id" =\s+FOR UPDATE/,
    );
    expect(lockedInvitationId).toBe("inv-1");
    expect(tx.assessmentInvitation.findUniqueOrThrow).toHaveBeenCalledWith({
      where: { id: "inv-1" },
      select: {
        tokenHash: true,
        expiresAt: true,
        status: true,
        sentAt: true,
      },
    });
    expect(tx.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(
      tx.assessmentInvitation.findUniqueOrThrow.mock.invocationCallOrder[0],
    );
    expect(tx.assessmentInvitationToken.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tokenHash: "old-hash" },
        create: expect.objectContaining({
          invitationId: "inv-1",
          tokenHash: "old-hash",
          source: "LEGACY_CURRENT",
          deliveryState: "SENT",
        }),
      }),
    );
    expect(tx.assessmentInvitationToken.create).toHaveBeenCalledWith({
      data: {
        invitationId: "inv-1",
        tokenHash: "new-hash",
        source: "REMINDER",
        deliveryState: "STAGED",
      },
      select: { id: true },
    });
    expect(tx.assessmentInvitation.update).toHaveBeenCalledWith({
      where: { id: "inv-1" },
      data: { tokenHash: "new-hash", expiresAt },
      select: { id: true },
    });
    expect(staged).toEqual({
      tokenId: "new-token",
      invitationId: "inv-1",
      newTokenHash: "new-hash",
      previousTokenHash: "old-hash",
      previousExpiresAt,
    });
  });

  test("confirming a reminder atomically records delivery and increments reminder counters", async () => {
    const confirmedAt = new Date("2026-11-01T00:00:00Z");
    const tx = {
      assessmentInvitationToken: {
        update: jest.fn().mockResolvedValue({ id: "token-1" }),
      },
      assessmentInvitation: {
        update: jest.fn().mockResolvedValue({ id: "inv-1" }),
      },
    };
    const db = {
      $transaction: jest.fn(
        async (callback: (client: typeof tx) => Promise<unknown>) =>
          callback(tx),
      ),
      assessmentInvitation: {},
      assessmentInvitationToken: {},
    } as unknown as StableTokenDb;

    await confirmStableInvitationToken(db, {
      tokenId: "token-1",
      invitationId: "inv-1",
      confirmedAt,
      reminder: true,
    });

    expect(tx.assessmentInvitationToken.update).toHaveBeenCalledWith({
      where: { id: "token-1" },
      data: {
        deliveryState: "SENT",
        deliveryConfirmedAt: confirmedAt,
      },
      select: { id: true },
    });
    expect(tx.assessmentInvitation.update).toHaveBeenCalledWith({
      where: { id: "inv-1" },
      data: {
        resentCount: { increment: 1 },
        lastResentAt: confirmedAt,
      },
      select: { id: true },
    });
    expect(db.$transaction).toHaveBeenCalledTimes(1);
  });

  test("confirming an original token does not change reminder counters", async () => {
    const tx = {
      assessmentInvitationToken: {
        update: jest.fn().mockResolvedValue({ id: "token-1" }),
      },
      assessmentInvitation: {
        update: jest.fn().mockResolvedValue({ id: "inv-1" }),
      },
    };
    const db = {
      $transaction: jest.fn(
        async (callback: (client: typeof tx) => Promise<unknown>) =>
          callback(tx),
      ),
      assessmentInvitation: {},
      assessmentInvitationToken: {},
    } as unknown as StableTokenDb;

    await confirmStableInvitationToken(db, {
      tokenId: "token-1",
      invitationId: "inv-1",
      confirmedAt: new Date("2026-11-01T00:00:00Z"),
      reminder: false,
    });

    expect(tx.assessmentInvitationToken.update).toHaveBeenCalledTimes(1);
    expect(tx.assessmentInvitation.update).not.toHaveBeenCalled();
  });

  test("an ambiguous send outcome marks the staged child uncertain", async () => {
    const update = jest.fn().mockResolvedValue({ id: "token-1" });
    const db = {
      assessmentInvitationToken: { update },
    } as unknown as StableTokenDb;

    await markStableInvitationTokenUncertain(db, "token-1");

    expect(update).toHaveBeenCalledWith({
      where: { id: "token-1" },
      data: { deliveryState: "UNCERTAIN" },
      select: { id: true },
    });
  });

  test("an unclassified send error is uncertain", () => {
    expect(classifyInvitationSendError(new Error("socket closed"))).toBe(
      "UNCERTAIN",
    );
  });

  test("a numeric SMTP response code from 500 through 599 is a definite rejection", () => {
    expect(classifyInvitationSendError({ responseCode: 500 })).toBe(
      "DEFINITE_REJECTION",
    );
    expect(classifyInvitationSendError({ responseCode: 550 })).toBe(
      "DEFINITE_REJECTION",
    );
    expect(classifyInvitationSendError({ responseCode: 599 })).toBe(
      "DEFINITE_REJECTION",
    );
  });

  test("response codes outside the numeric 500 through 599 range remain uncertain", () => {
    expect(classifyInvitationSendError({ responseCode: 499 })).toBe(
      "UNCERTAIN",
    );
    expect(classifyInvitationSendError({ responseCode: 600 })).toBe(
      "UNCERTAIN",
    );
    expect(classifyInvitationSendError({ responseCode: "550" })).toBe(
      "UNCERTAIN",
    );
  });

  test("removing a rejected newly registered original deletes only its child", async () => {
    const deleteToken = jest.fn().mockResolvedValue({ id: "token-1" });
    const parentUpdate = jest.fn();
    const db = {
      assessmentInvitationToken: { delete: deleteToken },
      assessmentInvitation: { update: parentUpdate },
    } as unknown as StableTokenDb;

    await removeRegisteredStableInvitationToken(db, "token-1");

    expect(deleteToken).toHaveBeenCalledWith({
      where: { id: "token-1" },
      select: { id: true },
    });
    expect(parentUpdate).not.toHaveBeenCalled();
  });

  test("rolling back a rejected staged token deletes its child and restores the parent with compare-and-swap", async () => {
    const tx = {
      assessmentInvitationToken: {
        delete: jest.fn().mockResolvedValue({ id: "token-1" }),
      },
      assessmentInvitation: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const db = {
      $transaction: jest.fn(
        async (callback: (client: typeof tx) => Promise<unknown>) =>
          callback(tx),
      ),
      assessmentInvitation: {},
      assessmentInvitationToken: {},
    } as unknown as StableTokenDb;
    const previousExpiresAt = new Date("2026-10-01T00:00:00Z");

    await rollbackRejectedStableInvitationToken(db, {
      tokenId: "token-1",
      invitationId: "inv-1",
      newTokenHash: "new-hash",
      previousTokenHash: "old-hash",
      previousExpiresAt,
    });

    expect(tx.assessmentInvitationToken.delete).toHaveBeenCalledWith({
      where: { id: "token-1" },
      select: { id: true },
    });
    expect(tx.assessmentInvitation.updateMany).toHaveBeenCalledWith({
      where: { id: "inv-1", tokenHash: "new-hash" },
      data: { tokenHash: "old-hash", expiresAt: previousExpiresAt },
    });
    expect(db.$transaction).toHaveBeenCalledTimes(1);
  });

  test("a zero-count rollback leaves a newer parent mirror untouched", async () => {
    const overwriteNewerMirror = jest.fn();
    const tx = {
      assessmentInvitationToken: {
        delete: jest.fn().mockResolvedValue({ id: "token-1" }),
      },
      assessmentInvitation: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        update: overwriteNewerMirror,
      },
    };
    const db = {
      $transaction: jest.fn(
        async (callback: (client: typeof tx) => Promise<unknown>) =>
          callback(tx),
      ),
      assessmentInvitation: {},
      assessmentInvitationToken: {},
    } as unknown as StableTokenDb;

    await rollbackRejectedStableInvitationToken(db, {
      tokenId: "token-1",
      invitationId: "inv-1",
      newTokenHash: "failed-hash",
      previousTokenHash: "old-hash",
      previousExpiresAt: new Date("2026-10-01T00:00:00Z"),
    });

    expect(tx.assessmentInvitation.updateMany).toHaveBeenCalledTimes(1);
    expect(overwriteNewerMirror).not.toHaveBeenCalled();
    expect(tx.assessmentInvitationToken.delete).toHaveBeenCalledTimes(1);
  });

  test("registering a new original token creates an idempotent staged child", async () => {
    const upsert = jest.fn().mockResolvedValue({ id: "token-1" });
    const db = {
      assessmentInvitationToken: { upsert },
    } as unknown as StableTokenDb;

    const registered = await registerNewOriginalToken(db, {
      invitationId: "inv-1",
      tokenHash: "original-hash",
    });

    expect(upsert).toHaveBeenCalledWith({
      where: { tokenHash: "original-hash" },
      create: {
        invitationId: "inv-1",
        tokenHash: "original-hash",
        source: "ORIGINAL",
        deliveryState: "STAGED",
      },
      update: {},
      select: { id: true },
    });
    expect(registered).toEqual({ tokenId: "token-1" });
  });

  test("stable-token lookup resolves the invitation through the child first", async () => {
    const childFindUnique = jest.fn().mockResolvedValue({
      invitation: INVITATION_WITH_CAMPAIGN,
    });
    const parentFindUnique = jest.fn();
    const db = {
      assessmentInvitationToken: { findUnique: childFindUnique },
      assessmentInvitation: { findUnique: parentFindUnique },
    } as unknown as StableTokenLookupDb;

    const invitation = await resolveInvitationByStableTokenHash(db, "hash");

    expect(childFindUnique).toHaveBeenCalledWith({
      where: { tokenHash: "hash" },
      select: {
        invitation: {
          include: {
            campaign: {
              select: {
                id: true,
                alias: true,
                status: true,
                openAt: true,
                closeAt: true,
                deletedAt: true,
              },
            },
          },
        },
      },
    });
    expect(parentFindUnique).not.toHaveBeenCalled();
    expect(invitation?.id).toBe("inv-1");
  });

  test("stable-token lookup falls back to the parent compatibility mirror", async () => {
    const childFindUnique = jest.fn().mockResolvedValue(null);
    const parentFindUnique = jest
      .fn()
      .mockResolvedValue(INVITATION_WITH_CAMPAIGN);
    const db = {
      assessmentInvitationToken: { findUnique: childFindUnique },
      assessmentInvitation: { findUnique: parentFindUnique },
    } as unknown as StableTokenLookupDb;

    const invitation = await resolveInvitationByStableTokenHash(
      db,
      "legacy-hash",
    );

    expect(parentFindUnique).toHaveBeenCalledWith({
      where: { tokenHash: "legacy-hash" },
      include: {
        campaign: {
          select: {
            id: true,
            alias: true,
            status: true,
            openAt: true,
            closeAt: true,
            deletedAt: true,
          },
        },
      },
    });
    expect(invitation?.id).toBe("inv-1");
  });
});
