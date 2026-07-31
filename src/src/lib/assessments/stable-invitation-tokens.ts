import { Prisma, type PrismaClient } from "@prisma/client";

export type StableTokenDb = Pick<
  PrismaClient,
  "$transaction" | "assessmentInvitation" | "assessmentInvitationToken"
>;

export type StableTokenLookupDb = Pick<
  PrismaClient,
  "assessmentInvitation" | "assessmentInvitationToken"
>;

export const invitationForExchangeArgs = Prisma.validator<
  Prisma.AssessmentInvitationDefaultArgs
>()({
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

export type InvitationWithCampaign =
  Prisma.AssessmentInvitationGetPayload<typeof invitationForExchangeArgs>;

export interface StagedStableToken {
  tokenId: string;
  invitationId: string;
  newTokenHash: string;
  previousTokenHash: string;
  previousExpiresAt: Date;
}

/** Retry bounded stable-token side effects without moving identity rules to callers. */
export async function retryStableInvitationOperation(
  operation: () => Promise<void>,
  attempts: number = 3,
): Promise<boolean> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      await operation();
      return true;
    } catch {
      // The injected operation owns its transaction and identity safeguards.
    }
  }
  return false;
}

function assertSha256Hash(value: string): void {
  if (!/^[a-f0-9]{64}$/.test(value)) {
    throw new Error(
      "Stable invitation token hashes must be lowercase SHA-256 hex.",
    );
  }
}

function stableTokenInvariant(message: string): Error {
  return new Error(`Stable invitation token invariant failed: ${message}`);
}

export async function registerNewOriginalToken(
  db: StableTokenDb,
  input: { invitationId: string; tokenHash: string },
): Promise<{ tokenId: string }> {
  assertSha256Hash(input.tokenHash);

  const token = await db.assessmentInvitationToken.upsert({
    where: { tokenHash: input.tokenHash },
    create: {
      invitationId: input.invitationId,
      tokenHash: input.tokenHash,
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

  if (
    token.invitationId !== input.invitationId ||
    token.tokenHash !== input.tokenHash ||
    token.source !== "ORIGINAL" ||
    !(
      token.deliveryState === "STAGED" ||
      token.deliveryState === "SENT" ||
      token.deliveryState === "UNCERTAIN"
    )
  ) {
    throw stableTokenInvariant("original token registration conflict");
  }

  return { tokenId: token.id };
}

export async function stageStableInvitationToken(
  db: StableTokenDb,
  input: {
    invitationId: string;
    newTokenHash: string;
    expiresAt: Date;
    source: "ORIGINAL" | "REMINDER";
  },
): Promise<StagedStableToken> {
  assertSha256Hash(input.newTokenHash);

  return db.$transaction(async (tx) => {
    await tx.$executeRaw`
      SELECT "id"
      FROM "assessment_invitations"
      WHERE "id" = ${input.invitationId}
      FOR UPDATE
    `;

    const current = await tx.assessmentInvitation.findUniqueOrThrow({
      where: { id: input.invitationId },
      select: {
        tokenHash: true,
        expiresAt: true,
        status: true,
        sentAt: true,
      },
    });

    const deliveryWasConfirmed =
      current.status === "SENT" ||
      current.status === "VIEWED" ||
      current.status === "SUBMITTED";

    assertSha256Hash(current.tokenHash);

    await tx.assessmentInvitationToken.upsert({
      where: { tokenHash: current.tokenHash },
      create: {
        invitationId: input.invitationId,
        tokenHash: current.tokenHash,
        source: "LEGACY_CURRENT",
        deliveryState: deliveryWasConfirmed ? "SENT" : "UNCERTAIN",
        deliveryConfirmedAt: deliveryWasConfirmed ? current.sentAt : null,
      },
      update: {},
    });

    const staged = await tx.assessmentInvitationToken.create({
      data: {
        invitationId: input.invitationId,
        tokenHash: input.newTokenHash,
        source: input.source,
        deliveryState: "STAGED",
        previousTokenHash: current.tokenHash,
        previousExpiresAt: current.expiresAt,
      },
      select: { id: true },
    });

    await tx.assessmentInvitation.update({
      where: { id: input.invitationId },
      data: {
        tokenHash: input.newTokenHash,
        expiresAt: input.expiresAt,
      },
      select: { id: true },
    });

    return {
      tokenId: staged.id,
      invitationId: input.invitationId,
      newTokenHash: input.newTokenHash,
      previousTokenHash: current.tokenHash,
      previousExpiresAt: current.expiresAt,
    };
  });
}

export async function confirmStableInvitationToken(
  db: StableTokenDb,
  input: {
    tokenId: string;
    invitationId: string;
    confirmedAt: Date;
    reminder: boolean;
  },
): Promise<void> {
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`
      SELECT "id"
      FROM "assessment_invitations"
      WHERE "id" = ${input.invitationId}
      FOR UPDATE
    `;

    const token = await tx.assessmentInvitationToken.findUnique({
      where: { id: input.tokenId },
      select: {
        id: true,
        invitationId: true,
        source: true,
        deliveryState: true,
      },
    });
    const isReminder = token?.source === "REMINDER";
    if (
      !token ||
      token.invitationId !== input.invitationId ||
      (token.source !== "ORIGINAL" && token.source !== "REMINDER") ||
      input.reminder !== isReminder
    ) {
      throw stableTokenInvariant("delivery confirmation identity mismatch");
    }

    const transitioned = await tx.assessmentInvitationToken.updateMany({
      where: {
        id: token.id,
        invitationId: token.invitationId,
        source: token.source,
        deliveryState: { in: ["STAGED", "UNCERTAIN"] },
      },
      data: {
        deliveryState: "SENT",
        deliveryConfirmedAt: input.confirmedAt,
      },
    });

    if (transitioned.count === 1 && isReminder) {
      await tx.assessmentInvitation.update({
        where: { id: token.invitationId },
        data: {
          resentCount: { increment: 1 },
          lastResentAt: input.confirmedAt,
        },
        select: { id: true },
      });
    }
  });
}

export async function markStableInvitationTokenUncertain(
  db: StableTokenDb,
  tokenId: string,
): Promise<void> {
  await db.assessmentInvitationToken.updateMany({
    where: {
      id: tokenId,
      deliveryState: "STAGED",
    },
    data: { deliveryState: "UNCERTAIN" },
  });
}

export async function removeRegisteredStableInvitationToken(
  db: StableTokenDb,
  tokenId: string,
): Promise<void> {
  const token = await db.assessmentInvitationToken.findUnique({
    where: { id: tokenId },
    select: {
      id: true,
      invitationId: true,
      tokenHash: true,
      source: true,
      deliveryState: true,
      previousTokenHash: true,
      previousExpiresAt: true,
    },
  });

  if (
    !token ||
    token.source !== "ORIGINAL" ||
    token.deliveryState !== "STAGED" ||
    token.previousTokenHash !== null ||
    token.previousExpiresAt !== null
  ) {
    throw stableTokenInvariant("original cleanup identity or state mismatch");
  }
  assertSha256Hash(token.tokenHash);

  const deleted = await db.assessmentInvitationToken.deleteMany({
    where: {
      id: token.id,
      invitationId: token.invitationId,
      tokenHash: token.tokenHash,
      source: "ORIGINAL",
      deliveryState: "STAGED",
      previousTokenHash: null,
      previousExpiresAt: null,
    },
  });
  if (deleted.count !== 1) {
    throw stableTokenInvariant("original token changed before cleanup");
  }
}

export async function rollbackRejectedStableInvitationToken(
  db: StableTokenDb,
  staged: StagedStableToken,
): Promise<void> {
  assertSha256Hash(staged.newTokenHash);
  assertSha256Hash(staged.previousTokenHash);

  await db.$transaction(async (tx) => {
    await tx.$executeRaw`
      SELECT "id"
      FROM "assessment_invitations"
      WHERE "id" = ${staged.invitationId}
      FOR UPDATE
    `;

    const failed = await tx.assessmentInvitationToken.findUnique({
      where: { id: staged.tokenId },
      select: {
        id: true,
        invitationId: true,
        tokenHash: true,
        source: true,
        deliveryState: true,
        previousTokenHash: true,
        previousExpiresAt: true,
      },
    });

    if (
      !failed ||
      failed.invitationId !== staged.invitationId ||
      failed.tokenHash !== staged.newTokenHash ||
      (failed.source !== "ORIGINAL" && failed.source !== "REMINDER") ||
      failed.deliveryState !== "STAGED" ||
      failed.previousTokenHash === null ||
      failed.previousExpiresAt === null
    ) {
      throw stableTokenInvariant(
        "rejected rotating token identity or state mismatch",
      );
    }

    assertSha256Hash(failed.tokenHash);
    assertSha256Hash(failed.previousTokenHash);

    const deleted = await tx.assessmentInvitationToken.deleteMany({
      where: {
        id: failed.id,
        invitationId: failed.invitationId,
        tokenHash: failed.tokenHash,
        source: failed.source,
        deliveryState: "STAGED",
      },
    });
    if (deleted.count !== 1) {
      throw stableTokenInvariant(
        "rejected rotating token changed before deletion",
      );
    }

    await tx.assessmentInvitationToken.updateMany({
      where: {
        invitationId: failed.invitationId,
        source: { in: ["ORIGINAL", "REMINDER"] },
        previousTokenHash: failed.tokenHash,
      },
      data: {
        previousTokenHash: failed.previousTokenHash,
        previousExpiresAt: failed.previousExpiresAt,
      },
    });

    await tx.assessmentInvitation.updateMany({
      where: {
        id: failed.invitationId,
        tokenHash: failed.tokenHash,
      },
      data: {
        tokenHash: failed.previousTokenHash,
        expiresAt: failed.previousExpiresAt,
      },
    });
  });
}

export async function resolveInvitationByStableTokenHash(
  db: StableTokenLookupDb,
  tokenHash: string,
): Promise<InvitationWithCampaign | null> {
  assertSha256Hash(tokenHash);

  const token = await db.assessmentInvitationToken.findUnique({
    where: { tokenHash },
    select: {
      invitation: invitationForExchangeArgs,
    },
  });

  if (token) {
    return token.invitation;
  }

  return db.assessmentInvitation.findUnique({
    where: { tokenHash },
    ...invitationForExchangeArgs,
  });
}

export function classifyInvitationSendError(
  error: unknown,
): "DEFINITE_REJECTION" | "UNCERTAIN" {
  if (typeof error === "object" && error !== null && "responseCode" in error) {
    const responseCode = (error as { responseCode?: unknown }).responseCode;
    if (
      typeof responseCode === "number" &&
      responseCode >= 500 &&
      responseCode <= 599
    ) {
      return "DEFINITE_REJECTION";
    }
  }

  return "UNCERTAIN";
}
