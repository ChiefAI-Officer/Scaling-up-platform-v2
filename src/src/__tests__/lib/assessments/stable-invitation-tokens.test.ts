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

const HASH = "a".repeat(64);
const OLD_HASH = "b".repeat(64);
const NEW_HASH = "c".repeat(64);
const FAILED_HASH = "d".repeat(64);
const ORIGINAL_HASH = "e".repeat(64);
const LEGACY_HASH = "f".repeat(64);
const ATTEMPT_A_HASH = "1".repeat(64);
const ATTEMPT_B_HASH = "2".repeat(64);
const ATTEMPT_C_HASH = "3".repeat(64);

const INVITATION_WITH_CAMPAIGN = {
  id: "inv-1",
  campaignId: "campaign-1",
  respondentId: "respondent-1",
  tokenHash: HASH,
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

type HarnessTokenSource = "LEGACY_CURRENT" | "ORIGINAL" | "REMINDER";
type HarnessDeliveryState = "STAGED" | "SENT" | "UNCERTAIN";

interface HarnessToken {
  id: string;
  invitationId: string;
  tokenHash: string;
  source: HarnessTokenSource;
  deliveryState: HarnessDeliveryState;
  deliveryConfirmedAt: Date | null;
  previousTokenHash: string | null;
  previousExpiresAt: Date | null;
}

function buildStatefulTokenDb() {
  const parent = {
    id: "inv-1",
    tokenHash: OLD_HASH,
    expiresAt: new Date("2026-10-01T00:00:00Z"),
    status: "SENT" as const,
    sentAt: new Date("2026-09-01T00:00:00Z"),
    resentCount: 0,
    lastResentAt: null as Date | null,
  };
  const tokens: HarnessToken[] = [];
  let nextTokenId = 1;

  function findToken(where: { id?: string; tokenHash?: string }) {
    return (
      tokens.find(
        (token) =>
          (where.id === undefined || token.id === where.id) &&
          (where.tokenHash === undefined || token.tokenHash === where.tokenHash),
      ) ?? null
    );
  }

  function tokenMatches(
    token: HarnessToken,
    where: {
      id?: string;
      invitationId?: string;
      tokenHash?: string;
      source?: HarnessTokenSource;
      deliveryState?:
        | HarnessDeliveryState
        | { in: HarnessDeliveryState[] };
      previousTokenHash?: string;
    },
  ) {
    if (where.id !== undefined && token.id !== where.id) return false;
    if (
      where.invitationId !== undefined &&
      token.invitationId !== where.invitationId
    ) {
      return false;
    }
    if (where.tokenHash !== undefined && token.tokenHash !== where.tokenHash) {
      return false;
    }
    if (where.source !== undefined && token.source !== where.source) {
      return false;
    }
    if (where.previousTokenHash !== undefined) {
      if (token.previousTokenHash !== where.previousTokenHash) return false;
    }
    if (typeof where.deliveryState === "string") {
      if (token.deliveryState !== where.deliveryState) return false;
    } else if (
      where.deliveryState !== undefined &&
      !where.deliveryState.in.includes(token.deliveryState)
    ) {
      return false;
    }
    return true;
  }

  const tx = {
    $executeRaw: jest.fn().mockResolvedValue(1),
    assessmentInvitation: {
      findUniqueOrThrow: jest.fn().mockImplementation(async () => ({
        tokenHash: parent.tokenHash,
        expiresAt: parent.expiresAt,
        status: parent.status,
        sentAt: parent.sentAt,
      })),
      update: jest.fn().mockImplementation(
        async (args: {
          data: {
            tokenHash?: string;
            expiresAt?: Date;
            resentCount?: { increment: number };
            lastResentAt?: Date;
          };
        }) => {
          if (args.data.tokenHash !== undefined) {
            parent.tokenHash = args.data.tokenHash;
          }
          if (args.data.expiresAt !== undefined) {
            parent.expiresAt = args.data.expiresAt;
          }
          if (args.data.resentCount !== undefined) {
            parent.resentCount += args.data.resentCount.increment;
          }
          if (args.data.lastResentAt !== undefined) {
            parent.lastResentAt = args.data.lastResentAt;
          }
          return { id: parent.id };
        },
      ),
      updateMany: jest.fn().mockImplementation(
        async (args: {
          where: { id: string; tokenHash: string };
          data: { tokenHash: string; expiresAt: Date };
        }) => {
          if (
            args.where.id !== parent.id ||
            args.where.tokenHash !== parent.tokenHash
          ) {
            return { count: 0 };
          }
          parent.tokenHash = args.data.tokenHash;
          parent.expiresAt = args.data.expiresAt;
          return { count: 1 };
        },
      ),
    },
    assessmentInvitationToken: {
      findUnique: jest
        .fn()
        .mockImplementation(
          async (args: { where: { id?: string; tokenHash?: string } }) =>
            findToken(args.where),
        ),
      upsert: jest.fn().mockImplementation(
        async (args: {
          where: { tokenHash: string };
          create: Omit<HarnessToken, "id" | "deliveryConfirmedAt" | "previousTokenHash" | "previousExpiresAt"> & {
            deliveryConfirmedAt?: Date | null;
            previousTokenHash?: string | null;
            previousExpiresAt?: Date | null;
          };
        }) => {
          const existing = findToken(args.where);
          if (existing) return existing;
          const created: HarnessToken = {
            id: `token-${nextTokenId++}`,
            deliveryConfirmedAt: null,
            previousTokenHash: null,
            previousExpiresAt: null,
            ...args.create,
          };
          tokens.push(created);
          return created;
        },
      ),
      create: jest.fn().mockImplementation(
        async (args: {
          data: Omit<HarnessToken, "id" | "deliveryConfirmedAt" | "previousTokenHash" | "previousExpiresAt"> & {
            deliveryConfirmedAt?: Date | null;
            previousTokenHash?: string | null;
            previousExpiresAt?: Date | null;
          };
        }) => {
          const created: HarnessToken = {
            id: `token-${nextTokenId++}`,
            deliveryConfirmedAt: null,
            previousTokenHash: null,
            previousExpiresAt: null,
            ...args.data,
          };
          tokens.push(created);
          return created;
        },
      ),
      update: jest.fn().mockImplementation(
        async (args: {
          where: { id: string };
          data: {
            deliveryState?: HarnessDeliveryState;
            deliveryConfirmedAt?: Date;
          };
        }) => {
          const token = findToken(args.where);
          if (!token) throw new Error("token missing");
          Object.assign(token, args.data);
          return token;
        },
      ),
      updateMany: jest.fn().mockImplementation(
        async (args: {
          where: Parameters<typeof tokenMatches>[1];
          data: {
            deliveryState?: HarnessDeliveryState;
            deliveryConfirmedAt?: Date;
            previousTokenHash?: string;
            previousExpiresAt?: Date;
          };
        }) => {
          const matching = tokens.filter((token) =>
            tokenMatches(token, args.where),
          );
          for (const token of matching) {
            Object.assign(token, args.data);
          }
          return { count: matching.length };
        },
      ),
      delete: jest
        .fn()
        .mockImplementation(async (args: { where: { id: string } }) => {
          const index = tokens.findIndex((token) => token.id === args.where.id);
          if (index < 0) throw new Error("token missing");
          return tokens.splice(index, 1)[0];
        }),
      deleteMany: jest.fn().mockImplementation(
        async (args: { where: Parameters<typeof tokenMatches>[1] }) => {
          const matchingIds = new Set(
            tokens
              .filter((token) => tokenMatches(token, args.where))
              .map((token) => token.id),
          );
          const kept = tokens.filter((token) => !matchingIds.has(token.id));
          const count = tokens.length - kept.length;
          tokens.splice(0, tokens.length, ...kept);
          return { count };
        },
      ),
    },
  };

  const db = {
    $transaction: jest.fn(
      async (callback: (client: typeof tx) => Promise<unknown>) =>
        callback(tx),
    ),
    assessmentInvitation: tx.assessmentInvitation,
    assessmentInvitationToken: tx.assessmentInvitationToken,
  } as unknown as StableTokenDb;

  return { db, parent, tokens, tx };
}

describe("stable invitation tokens", () => {
  test("persistence rejects non-SHA-256 hashes before opening a transaction or writing", async () => {
    const upsert = jest.fn();
    const transaction = jest.fn();
    const db = {
      $transaction: transaction,
      assessmentInvitation: {},
      assessmentInvitationToken: { upsert },
    } as unknown as StableTokenDb;

    await expect(
      registerNewOriginalToken(db, {
        invitationId: "inv-1",
        tokenHash: "not-a-sha-256-hash",
      }),
    ).rejects.toThrow("SHA-256");
    await expect(
      stageStableInvitationToken(db, {
        invitationId: "inv-1",
        newTokenHash: "A".repeat(64),
        expiresAt: new Date("2026-12-01T00:00:00Z"),
        source: "REMINDER",
      }),
    ).rejects.toThrow("SHA-256");
    await expect(
      rollbackRejectedStableInvitationToken(db, {
        tokenId: "token-1",
        invitationId: "inv-1",
        newTokenHash: NEW_HASH,
        previousTokenHash: "short",
        previousExpiresAt: new Date("2026-10-01T00:00:00Z"),
      }),
    ).rejects.toThrow("SHA-256");

    expect(upsert).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });

  test("staging locks the parent, preserves its current hash, and installs the new mirror", async () => {
    const expiresAt = new Date("2026-12-01T00:00:00Z");
    const previousExpiresAt = new Date("2026-10-01T00:00:00Z");
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      assessmentInvitation: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          tokenHash: OLD_HASH,
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
      newTokenHash: NEW_HASH,
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
        where: { tokenHash: OLD_HASH },
        create: expect.objectContaining({
          invitationId: "inv-1",
          tokenHash: OLD_HASH,
          source: "LEGACY_CURRENT",
          deliveryState: "SENT",
        }),
      }),
    );
    expect(tx.assessmentInvitationToken.create).toHaveBeenCalledWith({
      data: {
        invitationId: "inv-1",
        tokenHash: NEW_HASH,
        source: "REMINDER",
        deliveryState: "STAGED",
        previousTokenHash: OLD_HASH,
        previousExpiresAt,
      },
      select: { id: true },
    });
    expect(tx.assessmentInvitation.update).toHaveBeenCalledWith({
      where: { id: "inv-1" },
      data: { tokenHash: NEW_HASH, expiresAt },
      select: { id: true },
    });
    expect(staged).toEqual({
      tokenId: "new-token",
      invitationId: "inv-1",
      newTokenHash: NEW_HASH,
      previousTokenHash: OLD_HASH,
      previousExpiresAt,
    });
  });

  test("confirming a reminder atomically records delivery and increments reminder counters", async () => {
    const confirmedAt = new Date("2026-11-01T00:00:00Z");
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      assessmentInvitationToken: {
        findUnique: jest.fn().mockResolvedValue({
          id: "token-1",
          invitationId: "inv-1",
          source: "REMINDER",
          deliveryState: "STAGED",
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
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

    expect(tx.assessmentInvitationToken.updateMany).toHaveBeenCalledWith({
      where: {
        id: "token-1",
        invitationId: "inv-1",
        source: "REMINDER",
        deliveryState: { in: ["STAGED", "UNCERTAIN"] },
      },
      data: {
        deliveryState: "SENT",
        deliveryConfirmedAt: confirmedAt,
      },
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
      $executeRaw: jest.fn().mockResolvedValue(1),
      assessmentInvitationToken: {
        findUnique: jest.fn().mockResolvedValue({
          id: "token-1",
          invitationId: "inv-1",
          source: "ORIGINAL",
          deliveryState: "STAGED",
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
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

    expect(tx.assessmentInvitationToken.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.assessmentInvitation.update).not.toHaveBeenCalled();
  });

  test("an ambiguous send outcome marks the staged child uncertain", async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const db = {
      assessmentInvitationToken: { updateMany },
    } as unknown as StableTokenDb;

    await markStableInvitationTokenUncertain(db, "token-1");

    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "token-1", deliveryState: "STAGED" },
      data: { deliveryState: "UNCERTAIN" },
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
    const deleteMany = jest.fn().mockResolvedValue({ count: 1 });
    const parentUpdate = jest.fn();
    const db = {
      assessmentInvitationToken: {
        findUnique: jest.fn().mockResolvedValue({
          id: "token-1",
          invitationId: "inv-1",
          tokenHash: ORIGINAL_HASH,
          source: "ORIGINAL",
          deliveryState: "STAGED",
        }),
        deleteMany,
      },
      assessmentInvitation: { update: parentUpdate },
    } as unknown as StableTokenDb;

    await removeRegisteredStableInvitationToken(db, "token-1");

    expect(deleteMany).toHaveBeenCalledWith({
      where: {
        id: "token-1",
        invitationId: "inv-1",
        tokenHash: ORIGINAL_HASH,
        source: "ORIGINAL",
        deliveryState: "STAGED",
      },
    });
    expect(parentUpdate).not.toHaveBeenCalled();
  });

  test.each([
    ["REMINDER", "STAGED"],
    ["ORIGINAL", "SENT"],
  ] as const)(
    "original cleanup rejects a %s/%s token without deleting it",
    async (source, deliveryState) => {
      const deleteMany = jest.fn();
      const db = {
        assessmentInvitationToken: {
          findUnique: jest.fn().mockResolvedValue({
            id: "token-1",
            invitationId: "inv-1",
            tokenHash: ORIGINAL_HASH,
            source,
            deliveryState,
          }),
          deleteMany,
        },
      } as unknown as StableTokenDb;

      await expect(
        removeRegisteredStableInvitationToken(db, "token-1"),
      ).rejects.toThrow("cleanup identity or state mismatch");
      expect(deleteMany).not.toHaveBeenCalled();
    },
  );

  test("rolling back a rejected staged token deletes its child and restores the parent with compare-and-swap", async () => {
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      assessmentInvitationToken: {
        findUnique: jest.fn().mockResolvedValue({
          id: "token-1",
          invitationId: "inv-1",
          tokenHash: NEW_HASH,
          source: "REMINDER",
          deliveryState: "STAGED",
          previousTokenHash: OLD_HASH,
          previousExpiresAt: new Date("2026-10-01T00:00:00Z"),
        }),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
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
      newTokenHash: NEW_HASH,
      previousTokenHash: OLD_HASH,
      previousExpiresAt,
    });

    expect(tx.assessmentInvitationToken.deleteMany).toHaveBeenCalledWith({
      where: {
        id: "token-1",
        invitationId: "inv-1",
        tokenHash: NEW_HASH,
        source: "REMINDER",
        deliveryState: "STAGED",
      },
    });
    expect(tx.assessmentInvitationToken.updateMany).toHaveBeenCalledWith({
      where: {
        invitationId: "inv-1",
        source: "REMINDER",
        previousTokenHash: NEW_HASH,
      },
      data: {
        previousTokenHash: OLD_HASH,
        previousExpiresAt,
      },
    });
    expect(tx.assessmentInvitation.updateMany).toHaveBeenCalledWith({
      where: { id: "inv-1", tokenHash: NEW_HASH },
      data: { tokenHash: OLD_HASH, expiresAt: previousExpiresAt },
    });
    expect(db.$transaction).toHaveBeenCalledTimes(1);
  });

  test("a zero-count rollback leaves a newer parent mirror untouched", async () => {
    const overwriteNewerMirror = jest.fn();
    const previousExpiresAt = new Date("2026-10-01T00:00:00Z");
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      assessmentInvitationToken: {
        findUnique: jest.fn().mockResolvedValue({
          id: "token-1",
          invitationId: "inv-1",
          tokenHash: FAILED_HASH,
          source: "REMINDER",
          deliveryState: "STAGED",
          previousTokenHash: OLD_HASH,
          previousExpiresAt,
        }),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
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
      newTokenHash: FAILED_HASH,
      previousTokenHash: OLD_HASH,
      previousExpiresAt,
    });

    expect(tx.assessmentInvitation.updateMany).toHaveBeenCalledTimes(1);
    expect(overwriteNewerMirror).not.toHaveBeenCalled();
    expect(tx.assessmentInvitationToken.deleteMany).toHaveBeenCalledTimes(1);
  });

  test.each([
    [
      "invitation",
      "other-invitation",
      NEW_HASH,
      "REMINDER",
      "STAGED",
    ],
    ["hash", "inv-1", ATTEMPT_A_HASH, "REMINDER", "STAGED"],
    ["source", "inv-1", NEW_HASH, "ORIGINAL", "STAGED"],
    ["state", "inv-1", NEW_HASH, "REMINDER", "UNCERTAIN"],
  ] as const)(
    "rejected reminder rollback refuses a mismatched %s without deletion",
    async (
      _label,
      rowInvitationId,
      rowHash,
      source,
      deliveryState,
    ) => {
      const deleteMany = jest.fn().mockResolvedValue({ count: 1 });
      const tx = {
        $executeRaw: jest.fn().mockResolvedValue(1),
        assessmentInvitationToken: {
          findUnique: jest.fn().mockResolvedValue({
            id: "token-1",
            invitationId: rowInvitationId,
            tokenHash: rowHash,
            source,
            deliveryState,
            previousTokenHash: OLD_HASH,
            previousExpiresAt: new Date("2026-10-01T00:00:00Z"),
          }),
          deleteMany,
          updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        },
        assessmentInvitation: {
          updateMany: jest.fn().mockResolvedValue({ count: 0 }),
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

      await expect(
        rollbackRejectedStableInvitationToken(db, {
          tokenId: "token-1",
          invitationId: "inv-1",
          newTokenHash: NEW_HASH,
          previousTokenHash: OLD_HASH,
          previousExpiresAt: new Date("2026-10-01T00:00:00Z"),
        }),
      ).rejects.toThrow("identity or state mismatch");
      expect(deleteMany).not.toHaveBeenCalled();
    },
  );

  test("out-of-order A/B/C rejection never resurrects a deleted predecessor hash", async () => {
    const harness = buildStatefulTokenDb();
    const attempts = [
      await stageStableInvitationToken(harness.db, {
        invitationId: "inv-1",
        newTokenHash: ATTEMPT_A_HASH,
        expiresAt: new Date("2026-11-01T00:00:00Z"),
        source: "REMINDER",
      }),
      await stageStableInvitationToken(harness.db, {
        invitationId: "inv-1",
        newTokenHash: ATTEMPT_B_HASH,
        expiresAt: new Date("2026-12-01T00:00:00Z"),
        source: "REMINDER",
      }),
      await stageStableInvitationToken(harness.db, {
        invitationId: "inv-1",
        newTokenHash: ATTEMPT_C_HASH,
        expiresAt: new Date("2027-01-01T00:00:00Z"),
        source: "REMINDER",
      }),
    ];

    expect(new Set(attempts.map((attempt) => attempt.tokenId)).size).toBe(3);
    expect(
      harness.tokens.filter((token) => token.source === "REMINDER"),
    ).toHaveLength(3);

    await rollbackRejectedStableInvitationToken(harness.db, attempts[0]);
    await rollbackRejectedStableInvitationToken(harness.db, attempts[2]);
    await rollbackRejectedStableInvitationToken(harness.db, attempts[1]);

    expect(harness.parent.tokenHash).toBe(OLD_HASH);
    expect(
      harness.tokens.some(
        (token) => token.tokenHash === harness.parent.tokenHash,
      ),
    ).toBe(true);
    expect(
      harness.tokens.some((token) => token.source === "REMINDER"),
    ).toBe(false);
  });

  test.each([
    ["earlier-first", [0, 1]],
    ["later-first", [1, 0]],
  ] as const)(
    "two overlapping reminders reject safely in %s order",
    async (_label, rejectionOrder) => {
      const harness = buildStatefulTokenDb();
      const attempts = [
        await stageStableInvitationToken(harness.db, {
          invitationId: "inv-1",
          newTokenHash: ATTEMPT_A_HASH,
          expiresAt: new Date("2026-11-01T00:00:00Z"),
          source: "REMINDER",
        }),
        await stageStableInvitationToken(harness.db, {
          invitationId: "inv-1",
          newTokenHash: ATTEMPT_B_HASH,
          expiresAt: new Date("2026-12-01T00:00:00Z"),
          source: "REMINDER",
        }),
      ];

      for (const index of rejectionOrder) {
        await rollbackRejectedStableInvitationToken(
          harness.db,
          attempts[index],
        );
      }

      expect(harness.parent.tokenHash).toBe(OLD_HASH);
      expect(
        harness.tokens.some(
          (token) => token.tokenHash === harness.parent.tokenHash,
        ),
      ).toBe(true);
    },
  );

  test("confirm retry is idempotent and increments reminder counters exactly once", async () => {
    const harness = buildStatefulTokenDb();
    const staged = await stageStableInvitationToken(harness.db, {
      invitationId: "inv-1",
      newTokenHash: ATTEMPT_A_HASH,
      expiresAt: new Date("2026-11-01T00:00:00Z"),
      source: "REMINDER",
    });
    const confirmedAt = new Date("2026-10-15T00:00:00Z");

    await confirmStableInvitationToken(harness.db, {
      tokenId: staged.tokenId,
      invitationId: "inv-1",
      confirmedAt,
      reminder: true,
    });
    await confirmStableInvitationToken(harness.db, {
      tokenId: staged.tokenId,
      invitationId: "inv-1",
      confirmedAt,
      reminder: true,
    });

    expect(harness.parent.resentCount).toBe(1);
    expect(harness.parent.lastResentAt).toEqual(confirmedAt);
    expect(
      harness.tokens.find((token) => token.id === staged.tokenId),
    ).toMatchObject({
      source: "REMINDER",
      deliveryState: "SENT",
      deliveryConfirmedAt: confirmedAt,
    });
  });

  test.each([
    ["invitation ownership", "other-invitation", true],
    ["source classification", "inv-1", false],
  ] as const)(
    "confirmation rejects a mismatched %s without changing state",
    async (_label, invitationId, reminder) => {
      const harness = buildStatefulTokenDb();
      const staged = await stageStableInvitationToken(harness.db, {
        invitationId: "inv-1",
        newTokenHash: ATTEMPT_A_HASH,
        expiresAt: new Date("2026-11-01T00:00:00Z"),
        source: "REMINDER",
      });

      await expect(
        confirmStableInvitationToken(harness.db, {
          tokenId: staged.tokenId,
          invitationId,
          confirmedAt: new Date("2026-10-15T00:00:00Z"),
          reminder,
        }),
      ).rejects.toThrow("identity mismatch");

      expect(harness.parent.resentCount).toBe(0);
      expect(
        harness.tokens.find((token) => token.id === staged.tokenId),
      ).toMatchObject({ deliveryState: "STAGED" });
    },
  );

  test("marking an uncertain outcome cannot overwrite a confirmed SENT token", async () => {
    const harness = buildStatefulTokenDb();
    const staged = await stageStableInvitationToken(harness.db, {
      invitationId: "inv-1",
      newTokenHash: ATTEMPT_A_HASH,
      expiresAt: new Date("2026-11-01T00:00:00Z"),
      source: "REMINDER",
    });

    await confirmStableInvitationToken(harness.db, {
      tokenId: staged.tokenId,
      invitationId: "inv-1",
      confirmedAt: new Date("2026-10-15T00:00:00Z"),
      reminder: true,
    });
    await markStableInvitationTokenUncertain(harness.db, staged.tokenId);

    expect(
      harness.tokens.find((token) => token.id === staged.tokenId),
    ).toMatchObject({ deliveryState: "SENT" });
    expect(harness.parent.resentCount).toBe(1);
  });

  test("registering a new original token creates an idempotent staged child", async () => {
    const upsert = jest.fn().mockResolvedValue({
      id: "token-1",
      invitationId: "inv-1",
      tokenHash: ORIGINAL_HASH,
      source: "ORIGINAL",
      deliveryState: "STAGED",
    });
    const db = {
      assessmentInvitationToken: { upsert },
    } as unknown as StableTokenDb;

    const registered = await registerNewOriginalToken(db, {
      invitationId: "inv-1",
      tokenHash: ORIGINAL_HASH,
    });

    expect(upsert).toHaveBeenCalledWith({
      where: { tokenHash: ORIGINAL_HASH },
      create: {
        invitationId: "inv-1",
        tokenHash: ORIGINAL_HASH,
        source: "ORIGINAL",
        deliveryState: "STAGED",
      },
      update: {},
      select: {
        id: true,
        invitationId: true,
        tokenHash: true,
        source: true,
        deliveryState: true,
      },
    });
    expect(registered).toEqual({ tokenId: "token-1" });
  });

  test.each([
    ["another invitation", "inv-2", "ORIGINAL"],
    ["a reminder child", "inv-1", "REMINDER"],
  ] as const)(
    "original registration rejects a hash already owned by %s",
    async (_label, invitationId, source) => {
      const upsert = jest.fn().mockResolvedValue({
        id: "conflicting-token",
        invitationId,
        tokenHash: ORIGINAL_HASH,
        source,
        deliveryState: "STAGED",
      });
      const db = {
        assessmentInvitationToken: { upsert },
      } as unknown as StableTokenDb;

      await expect(
        registerNewOriginalToken(db, {
          invitationId: "inv-1",
          tokenHash: ORIGINAL_HASH,
        }),
      ).rejects.toThrow("registration conflict");
    },
  );

  test("stable-token lookup resolves the invitation through the child first", async () => {
    const childFindUnique = jest.fn().mockResolvedValue({
      invitation: INVITATION_WITH_CAMPAIGN,
    });
    const parentFindUnique = jest.fn();
    const db = {
      assessmentInvitationToken: { findUnique: childFindUnique },
      assessmentInvitation: { findUnique: parentFindUnique },
    } as unknown as StableTokenLookupDb;

    const invitation = await resolveInvitationByStableTokenHash(db, HASH);

    expect(childFindUnique).toHaveBeenCalledWith({
      where: { tokenHash: HASH },
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
      LEGACY_HASH,
    );

    expect(parentFindUnique).toHaveBeenCalledWith({
      where: { tokenHash: LEGACY_HASH },
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
