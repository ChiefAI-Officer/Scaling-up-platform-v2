import { createHash } from "crypto";
import {
  createStableOriginalTokenAdapter,
  sendInvitesBatch,
} from "@/lib/assessments/invite-send";
import {
  classifyInvitationExchangeAvailability,
  confirmStableInvitationToken,
  quarantineRejectedStableInvitationToken,
  resolveInvitationByStableTokenHash,
  stageStableInvitationToken,
  type StableTokenDb,
  type StableTokenLookupDb,
} from "@/lib/assessments/stable-invitation-tokens";

type TokenState = "STAGED" | "SENT" | "UNCERTAIN" | "REJECTED";
type TokenSource = "LEGACY_CURRENT" | "ORIGINAL" | "REMINDER";

interface StoredToken {
  id: string;
  invitationId: string;
  tokenHash: string;
  source: TokenSource;
  deliveryState: TokenState;
  deliveryConfirmedAt: Date | null;
  previousTokenHash: string | null;
  previousExpiresAt: Date | null;
}

interface StatefulDb {
  $executeRaw: jest.Mock;
  $transaction: jest.Mock;
  assessmentInvitation: Record<string, jest.Mock>;
  assessmentInvitationToken: Record<string, jest.Mock>;
}

function sha256(raw: string) {
  return createHash("sha256").update(raw).digest("hex");
}

function createStatefulPrismaFake() {
  const campaign = {
    id: "campaign-1",
    alias: "leadership-vitality",
    status: "ACTIVE" as const,
    openAt: new Date("2026-01-01T00:00:00.000Z"),
    closeAt: null as Date | null,
    deletedAt: null as Date | null,
  };
  let parent:
    | {
        id: string;
        campaignId: string;
        respondentId: string;
        tokenHash: string;
        status: "PENDING" | "SENT" | "VIEWED" | "SUBMITTED";
        expiresAt: Date;
        sentAt: Date | null;
        submittedAt: Date | null;
        revokedAt: Date | null;
        resentCount: number;
        lastResentAt: Date | null;
        createdAt: Date;
      }
    | null = null;
  const tokens: StoredToken[] = [];
  let tokenSequence = 0;

  const invitationSnapshot = () => {
    if (!parent) return null;
    return { ...parent, campaign: { ...campaign } };
  };
  const findToken = (where: { id?: string; tokenHash?: string }) =>
    tokens.find(
      (token) =>
        (where.id === undefined || token.id === where.id) &&
        (where.tokenHash === undefined || token.tokenHash === where.tokenHash),
    ) ?? null;
  const tokenMatches = (
    token: StoredToken,
    where: {
      id?: string;
      invitationId?: string;
      tokenHash?: string;
      source?: TokenSource | { in: TokenSource[] };
      deliveryState?: TokenState | { in: TokenState[] };
      previousTokenHash?: string;
    },
  ) => {
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
    if (
      typeof where.source === "string" &&
      token.source !== where.source
    ) {
      return false;
    }
    if (
      typeof where.source === "object" &&
      !where.source.in.includes(token.source)
    ) {
      return false;
    }
    if (
      typeof where.deliveryState === "string" &&
      token.deliveryState !== where.deliveryState
    ) {
      return false;
    }
    if (
      typeof where.deliveryState === "object" &&
      !where.deliveryState.in.includes(token.deliveryState)
    ) {
      return false;
    }
    return (
      where.previousTokenHash === undefined ||
      token.previousTokenHash === where.previousTokenHash
    );
  };

  const db: StatefulDb = {
    $executeRaw: jest.fn().mockResolvedValue(1),
    $transaction: jest.fn(
      async (callback: (tx: StatefulDb) => Promise<unknown>) => callback(db),
    ),
    assessmentInvitation: {
      findMany: jest.fn().mockImplementation(async () =>
        parent
          ? [
              {
                id: parent.id,
                respondentId: parent.respondentId,
                status: parent.status,
                revokedAt: parent.revokedAt,
              },
            ]
          : [],
      ),
      create: jest.fn().mockImplementation(async (args) => {
        parent = {
          id: "invitation-1",
          campaignId: args.data.campaignId,
          respondentId: args.data.respondentId,
          tokenHash: args.data.tokenHash,
          status: args.data.status,
          expiresAt: args.data.expiresAt,
          sentAt: null,
          submittedAt: null,
          revokedAt: null,
          resentCount: 0,
          lastResentAt: null,
          createdAt: new Date("2026-07-31T00:00:00.000Z"),
        };
        return { id: parent.id, expiresAt: parent.expiresAt };
      }),
      findUniqueOrThrow: jest.fn().mockImplementation(async () => {
        if (!parent) throw new Error("missing invitation");
        return {
          tokenHash: parent.tokenHash,
          expiresAt: parent.expiresAt,
          status: parent.status,
          sentAt: parent.sentAt,
        };
      }),
      findUnique: jest.fn().mockImplementation(async (args) =>
        parent?.tokenHash === args.where.tokenHash
          ? invitationSnapshot()
          : null,
      ),
      update: jest.fn().mockImplementation(async (args) => {
        if (!parent || parent.id !== args.where.id) {
          throw new Error("missing invitation");
        }
        if (args.data.tokenHash !== undefined) {
          parent.tokenHash = args.data.tokenHash;
        }
        if (args.data.expiresAt !== undefined) {
          parent.expiresAt = args.data.expiresAt;
        }
        if (args.data.status !== undefined) {
          parent.status = args.data.status;
        }
        if (args.data.sentAt !== undefined) {
          parent.sentAt = args.data.sentAt;
        }
        if (args.data.resentCount !== undefined) {
          parent.resentCount += args.data.resentCount.increment;
        }
        if (args.data.lastResentAt !== undefined) {
          parent.lastResentAt = args.data.lastResentAt;
        }
        return { id: parent.id, expiresAt: parent.expiresAt };
      }),
      updateMany: jest.fn().mockImplementation(async (args) => {
        if (
          !parent ||
          parent.id !== args.where.id ||
          parent.tokenHash !== args.where.tokenHash
        ) {
          return { count: 0 };
        }
        parent.tokenHash = args.data.tokenHash;
        parent.expiresAt = args.data.expiresAt;
        return { count: 1 };
      }),
    },
    assessmentInvitationToken: {
      findUnique: jest.fn().mockImplementation(async (args) => {
        const token = findToken(args.where);
        if (!token) return null;
        if (args.select?.invitation) {
          return {
            deliveryState: token.deliveryState,
            invitation: invitationSnapshot(),
          };
        }
        return { ...token };
      }),
      upsert: jest.fn().mockImplementation(async (args) => {
        const existing = findToken(args.where);
        if (existing) return { ...existing };
        const created: StoredToken = {
          id: `token-${++tokenSequence}`,
          deliveryConfirmedAt: null,
          previousTokenHash: null,
          previousExpiresAt: null,
          ...args.create,
        };
        tokens.push(created);
        return { ...created };
      }),
      create: jest.fn().mockImplementation(async (args) => {
        const created: StoredToken = {
          id: `token-${++tokenSequence}`,
          deliveryConfirmedAt: null,
          previousTokenHash: null,
          previousExpiresAt: null,
          ...args.data,
        };
        tokens.push(created);
        return { id: created.id };
      }),
      updateMany: jest.fn().mockImplementation(async (args) => {
        const matching = tokens.filter((token) =>
          tokenMatches(token, args.where),
        );
        for (const token of matching) Object.assign(token, args.data);
        return { count: matching.length };
      }),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  };

  return {
    db: db as unknown as StableTokenDb & StableTokenLookupDb,
    campaign,
    get parent() {
      return parent;
    },
    tokens,
  };
}

const inviteInput = {
  campaign: {
    id: "campaign-1",
    name: "Leadership Vitality",
    alias: "leadership-vitality",
    closeAt: null,
    invitationSubject: null,
    invitationBodyMarkdown: null,
    template: {
      alias: "leadership-vitality",
      invitationSubject: "Invitation",
      invitationBodyMarkdown: "Hello",
    },
  },
  recipients: [
    {
      respondentId: "respondent-1",
      respondent: {
        id: "respondent-1",
        firstName: "Alex",
        lastName: "Example",
        email: "alex@example.com",
      },
    },
  ],
  baseUrl: "https://app.example.com",
  stableLinksEnabled: true,
};

describe("stable invitation composed acceptance", () => {
  test("original plus two reminders stay exchangeable through shared parent lifecycle gates", async () => {
    const harness = createStatefulPrismaFake();
    const rawTokens: string[] = [];
    const adapter = createStableOriginalTokenAdapter(harness.db);

    const inviteResult = await sendInvitesBatch(
      {
        db: harness.db,
        sendEmail: jest.fn(),
        prepareEmail: (input) => {
          rawTokens.push(input.rawToken);
          return { send: async () => undefined };
        },
        stableTokens: adapter,
        persistRejectedCleanupAudit: async () => undefined,
        now: () => new Date("2026-07-31T12:00:00.000Z"),
      },
      inviteInput,
    );
    expect(inviteResult.sent).toEqual(["respondent-1"]);

    for (const [index, rawToken] of [
      "reminder-token-one",
      "reminder-token-two",
    ].entries()) {
      rawTokens.push(rawToken);
      const staged = await stageStableInvitationToken(harness.db, {
        invitationId: "invitation-1",
        newTokenHash: sha256(rawToken),
        expiresAt: new Date("2026-12-31T00:00:00.000Z"),
        source: "REMINDER",
      });
      await confirmStableInvitationToken(harness.db, {
        tokenId: staged.tokenId,
        invitationId: staged.invitationId,
        confirmedAt: new Date(`2026-08-0${index + 1}T00:00:00.000Z`),
        reminder: true,
      });
    }

    for (const rawToken of rawTokens) {
      const resolved = await resolveInvitationByStableTokenHash(
        harness.db,
        sha256(rawToken),
      );
      expect(resolved?.id).toBe("invitation-1");
      expect(
        classifyInvitationExchangeAvailability(
          resolved!,
          new Date("2026-08-15T00:00:00.000Z"),
        ),
      ).toBe("USABLE");
    }

    harness.parent!.status = "SUBMITTED";
    for (const rawToken of rawTokens) {
      const resolved = await resolveInvitationByStableTokenHash(
        harness.db,
        sha256(rawToken),
      );
      expect(
        classifyInvitationExchangeAvailability(
          resolved!,
          new Date("2026-08-15T00:00:00.000Z"),
        ),
      ).toBe("UNAVAILABLE");
    }
  });

  test("a definitely rejected brand-new original cannot exchange and restores the non-delivered root", async () => {
    const harness = createStatefulPrismaFake();
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    let rejectedRawToken = "";
    const result = await sendInvitesBatch(
      {
        db: harness.db,
        sendEmail: jest.fn(),
        prepareEmail: (input) => {
          rejectedRawToken = input.rawToken;
          return {
            send: async () => {
              throw { responseCode: 550 };
            },
          };
        },
        stableTokens: createStableOriginalTokenAdapter(harness.db),
        persistRejectedCleanupAudit: async () => undefined,
      },
      inviteInput,
    );

    expect(result.failed).toEqual(["respondent-1"]);
    await expect(
      resolveInvitationByStableTokenHash(harness.db, sha256(rejectedRawToken)),
    ).resolves.toBeNull();
    expect(harness.parent?.tokenHash).not.toBe(sha256(rejectedRawToken));
    errorSpy.mockRestore();
  });

  test("a quarantined token stays rejected when successor reconciliation is exhausted while older links remain valid", async () => {
    const harness = createStatefulPrismaFake();
    let originalRawToken = "";
    await sendInvitesBatch(
      {
        db: harness.db,
        sendEmail: jest.fn(),
        prepareEmail: (input) => {
          originalRawToken = input.rawToken;
          return { send: async () => undefined };
        },
        stableTokens: createStableOriginalTokenAdapter(harness.db),
        persistRejectedCleanupAudit: async () => undefined,
      },
      inviteInput,
    );

    const rejectedRawToken = "rejected-reminder";
    const staged = await stageStableInvitationToken(harness.db, {
      invitationId: "invitation-1",
      newTokenHash: sha256(rejectedRawToken),
      expiresAt: new Date("2026-12-31T00:00:00.000Z"),
      source: "REMINDER",
    });
    await quarantineRejectedStableInvitationToken(harness.db, staged);
    // No reconciliation call: this is the durable state after exhaustion.

    await expect(
      resolveInvitationByStableTokenHash(harness.db, sha256(rejectedRawToken)),
    ).resolves.toBeNull();
    await expect(
      resolveInvitationByStableTokenHash(harness.db, sha256(originalRawToken)),
    ).resolves.toMatchObject({ id: "invitation-1" });
    expect(harness.parent?.tokenHash).toBe(sha256(originalRawToken));
  });
});
