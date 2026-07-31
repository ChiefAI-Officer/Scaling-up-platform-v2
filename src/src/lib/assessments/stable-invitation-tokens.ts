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

export async function registerNewOriginalToken(
  db: StableTokenDb,
  input: { invitationId: string; tokenHash: string },
): Promise<{ tokenId: string }> {
  const token = await db.assessmentInvitationToken.upsert({
    where: { tokenHash: input.tokenHash },
    create: {
      invitationId: input.invitationId,
      tokenHash: input.tokenHash,
      source: "ORIGINAL",
      deliveryState: "STAGED",
    },
    update: {},
    select: { id: true },
  });

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
    await tx.assessmentInvitationToken.update({
      where: { id: input.tokenId },
      data: {
        deliveryState: "SENT",
        deliveryConfirmedAt: input.confirmedAt,
      },
      select: { id: true },
    });

    if (input.reminder) {
      await tx.assessmentInvitation.update({
        where: { id: input.invitationId },
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
  await db.assessmentInvitationToken.update({
    where: { id: tokenId },
    data: { deliveryState: "UNCERTAIN" },
    select: { id: true },
  });
}

export async function removeRegisteredStableInvitationToken(
  db: StableTokenDb,
  tokenId: string,
): Promise<void> {
  await db.assessmentInvitationToken.delete({
    where: { id: tokenId },
    select: { id: true },
  });
}

export async function rollbackRejectedStableInvitationToken(
  db: StableTokenDb,
  staged: StagedStableToken,
): Promise<void> {
  await db.$transaction(async (tx) => {
    await tx.assessmentInvitationToken.delete({
      where: { id: staged.tokenId },
      select: { id: true },
    });

    await tx.assessmentInvitation.updateMany({
      where: {
        id: staged.invitationId,
        tokenHash: staged.newTokenHash,
      },
      data: {
        tokenHash: staged.previousTokenHash,
        expiresAt: staged.previousExpiresAt,
      },
    });
  });
}

export async function resolveInvitationByStableTokenHash(
  db: StableTokenLookupDb,
  tokenHash: string,
): Promise<InvitationWithCampaign | null> {
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
