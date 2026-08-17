import type { Prisma } from "@prisma/client";
import type { AuditAction } from "@/lib/audit";

type CredentialRotationAction = Extract<
  AuditAction,
  "ADMIN_PASSWORD_SET" | "PASSWORD_RESET" | "PASSWORD_CHANGE"
>;

interface RotateUserPasswordParams {
  userId: string;
  passwordHash: string;
  action: CredentialRotationAction;
  performedBy: string;
  changes?: Record<string, unknown>;
}

/**
 * Rotates a credential and invalidates existing JWT sessions. Callers must
 * supply a Prisma transaction client so the audit row commits atomically.
 */
export async function rotateUserPassword(
  tx: Prisma.TransactionClient,
  params: RotateUserPasswordParams,
) {
  const user = await tx.user.update({
    where: { id: params.userId },
    data: {
      passwordHash: params.passwordHash,
      authVersion: { increment: 1 },
    },
    select: { id: true, authVersion: true },
  });

  await tx.auditLog.create({
    data: {
      entityType: "User",
      entityId: params.userId,
      action: params.action,
      performedBy: params.performedBy,
      changes: JSON.stringify(params.changes ?? {}),
    },
  });

  return user;
}
