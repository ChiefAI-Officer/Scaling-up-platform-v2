import type { StableRejectedTokenIdentity } from "./stable-invitation-tokens";

export const STABLE_INVITATION_REJECTION_REPAIR_ENTITY_TYPE =
  "AssessmentInvitationToken" as const;
export const STABLE_INVITATION_REJECTION_REPAIR_PENDING_ACTION =
  "STABLE_INVITATION_REJECTION_REPAIR_PENDING" as const;
export const STABLE_INVITATION_REJECTION_REPAIR_RESOLVED_ACTION =
  "STABLE_INVITATION_REJECTION_REPAIR_RESOLVED" as const;
export const STABLE_INVITATION_REJECTION_REPAIR_TERMINAL_ACTION =
  "STABLE_INVITATION_REJECTION_REPAIR_TERMINAL" as const;
export const STABLE_INVITATION_REJECTION_REPAIR_FAILED_ATTEMPT_ACTION =
  "STABLE_INVITATION_REJECTION_REPAIR_FAILED_ATTEMPT" as const;
export const STABLE_INVITATION_REJECTION_REPAIR_BATCH_LIMIT = 50;

type RepairAuditAction =
  | typeof STABLE_INVITATION_REJECTION_REPAIR_PENDING_ACTION
  | typeof STABLE_INVITATION_REJECTION_REPAIR_RESOLVED_ACTION
  | typeof STABLE_INVITATION_REJECTION_REPAIR_TERMINAL_ACTION
  | typeof STABLE_INVITATION_REJECTION_REPAIR_FAILED_ATTEMPT_ACTION;

interface AuditCreate {
  id?: string;
  entityType: typeof STABLE_INVITATION_REJECTION_REPAIR_ENTITY_TYPE;
  entityId: string;
  action: RepairAuditAction;
  performedBy: string;
  changes: string;
}

interface AuditRow {
  id: string;
  entityId: string;
  changes: string;
  timestamp: Date;
}

export interface StableInvitationRejectionOutboxDb {
  $transaction<T>(
    callback: (tx: StableInvitationRejectionOutboxDb) => Promise<T>,
  ): Promise<T>;
  auditLog: {
    create(args: {
      data: Omit<AuditCreate, "id">;
    }): Promise<unknown>;
    upsert(args: {
      where: { id: string };
      create: AuditCreate;
      update: Partial<Pick<AuditCreate, "performedBy">>;
    }): Promise<unknown>;
    updateMany(args: {
      where: {
        id?: string;
        entityType?: typeof STABLE_INVITATION_REJECTION_REPAIR_ENTITY_TYPE;
        entityId?: string;
        action?: RepairAuditAction;
      };
      data: {
        action?: RepairAuditAction;
        changes?: string;
      };
    }): Promise<{ count: number }>;
    count(args: {
      where: {
        entityType: typeof STABLE_INVITATION_REJECTION_REPAIR_ENTITY_TYPE;
        entityId: string;
        action: typeof STABLE_INVITATION_REJECTION_REPAIR_FAILED_ATTEMPT_ACTION;
      };
    }): Promise<number>;
    findUnique(args: {
      where: { id: string };
      select: { id: true };
    }): Promise<{ id: string } | null>;
    findMany(args: {
      where: {
        entityType: typeof STABLE_INVITATION_REJECTION_REPAIR_ENTITY_TYPE;
        action: typeof STABLE_INVITATION_REJECTION_REPAIR_PENDING_ACTION;
      };
      orderBy: [{ timestamp: "asc" }, { id: "asc" }];
      take: number;
      select: {
        id: true;
        entityId: true;
        changes: true;
        timestamp: true;
      };
    }): Promise<AuditRow[]>;
  };
}

export interface StableInvitationRejectionRepairPendingInput
  extends StableRejectedTokenIdentity {
  performedBy: string;
}

function resolvedAuditId(tokenId: string): string {
  return `j65_rejection_repair_resolved:${tokenId}`;
}

function targetDeletedAuditId(tokenId: string): string {
  return `j65_rejection_repair_terminal:${tokenId}`;
}

function malformedAuditId(rowId: string): string {
  return `j65_rejection_repair_terminal:${rowId}`;
}

function retryPendingAuditId(tokenId: string, attemptCount: number): string {
  return `j65_rejection_repair_pending:${tokenId}:${attemptCount}`;
}

function metadata(invitationId: string): string {
  return JSON.stringify({ invitationId });
}

function terminalMetadata(
  reason: "MALFORMED_METADATA",
): string;
function terminalMetadata(
  reason: "TARGET_DELETED",
  invitationId: string,
): string;
function terminalMetadata(
  reason: "MALFORMED_METADATA" | "TARGET_DELETED",
  invitationId?: string,
): string {
  return invitationId === undefined
    ? JSON.stringify({ reason })
    : JSON.stringify({ invitationId, reason });
}

function failedAttemptMetadata(
  invitationId: string,
  attemptCount: number,
): string {
  return JSON.stringify({
    invitationId,
    attemptCount,
    reason: "TRANSIENT_REPAIR_FAILURE",
  });
}

export async function persistStableInvitationRejectionRepairPending(
  db: StableInvitationRejectionOutboxDb,
  input: StableInvitationRejectionRepairPendingInput,
): Promise<void> {
  await db.auditLog.create({
    data: {
      entityType: STABLE_INVITATION_REJECTION_REPAIR_ENTITY_TYPE,
      entityId: input.tokenId,
      action: STABLE_INVITATION_REJECTION_REPAIR_PENDING_ACTION,
      performedBy: input.performedBy,
      changes: metadata(input.invitationId),
    },
  });
}

export async function isStableInvitationRejectionRepairResolved(
  db: StableInvitationRejectionOutboxDb,
  input: StableRejectedTokenIdentity,
): Promise<boolean> {
  const resolved = await db.auditLog.findUnique({
    where: { id: resolvedAuditId(input.tokenId) },
    select: { id: true },
  });
  return resolved !== null;
}

export async function markStableInvitationRejectionRepairResolved(
  db: StableInvitationRejectionOutboxDb,
  input: StableInvitationRejectionRepairPendingInput,
): Promise<void> {
  await db.$transaction(async (tx) => {
    await tx.auditLog.upsert({
      where: { id: resolvedAuditId(input.tokenId) },
      create: {
        id: resolvedAuditId(input.tokenId),
        entityType: STABLE_INVITATION_REJECTION_REPAIR_ENTITY_TYPE,
        entityId: input.tokenId,
        action: STABLE_INVITATION_REJECTION_REPAIR_RESOLVED_ACTION,
        performedBy: input.performedBy,
        changes: metadata(input.invitationId),
      },
      update: { performedBy: input.performedBy },
    });
    await tx.auditLog.updateMany({
      where: {
        entityType: STABLE_INVITATION_REJECTION_REPAIR_ENTITY_TYPE,
        entityId: input.tokenId,
        action: STABLE_INVITATION_REJECTION_REPAIR_PENDING_ACTION,
      },
      data: {
        action: STABLE_INVITATION_REJECTION_REPAIR_RESOLVED_ACTION,
      },
    });
  });
}

export async function markStableInvitationRejectionRepairTargetDeleted(
  db: StableInvitationRejectionOutboxDb,
  input: StableInvitationRejectionRepairPendingInput,
): Promise<void> {
  await db.$transaction(async (tx) => {
    await tx.auditLog.upsert({
      where: { id: targetDeletedAuditId(input.tokenId) },
      create: {
        id: targetDeletedAuditId(input.tokenId),
        entityType: STABLE_INVITATION_REJECTION_REPAIR_ENTITY_TYPE,
        entityId: input.tokenId,
        action: STABLE_INVITATION_REJECTION_REPAIR_TERMINAL_ACTION,
        performedBy: input.performedBy,
        changes: terminalMetadata("TARGET_DELETED", input.invitationId),
      },
      update: { performedBy: input.performedBy },
    });
    await tx.auditLog.updateMany({
      where: {
        entityType: STABLE_INVITATION_REJECTION_REPAIR_ENTITY_TYPE,
        entityId: input.tokenId,
        action: STABLE_INVITATION_REJECTION_REPAIR_PENDING_ACTION,
      },
      data: {
        action: STABLE_INVITATION_REJECTION_REPAIR_TERMINAL_ACTION,
      },
    });
  });
}

async function deadLetterMalformedPendingIntent(
  db: StableInvitationRejectionOutboxDb,
  row: AuditRow,
): Promise<void> {
  await db.$transaction(async (tx) => {
    await tx.auditLog.upsert({
      where: { id: malformedAuditId(row.id) },
      create: {
        id: malformedAuditId(row.id),
        entityType: STABLE_INVITATION_REJECTION_REPAIR_ENTITY_TYPE,
        entityId: row.entityId,
        action: STABLE_INVITATION_REJECTION_REPAIR_TERMINAL_ACTION,
        performedBy: "system:stable-invitation-repair-cron",
        changes: terminalMetadata("MALFORMED_METADATA"),
      },
      update: { performedBy: "system:stable-invitation-repair-cron" },
    });
    await tx.auditLog.updateMany({
      where: {
        id: row.id,
        action: STABLE_INVITATION_REJECTION_REPAIR_PENDING_ACTION,
      },
      data: {
        action: STABLE_INVITATION_REJECTION_REPAIR_TERMINAL_ACTION,
      },
    });
  });
}

function parsePendingIntent(row: AuditRow): StableRejectedTokenIdentity | null {
  try {
    const parsed = JSON.parse(row.changes) as unknown;
    if (
      !parsed ||
      typeof parsed !== "object" ||
      Array.isArray(parsed) ||
      Object.keys(parsed).length !== 1 ||
      !("invitationId" in parsed) ||
      typeof parsed.invitationId !== "string" ||
      parsed.invitationId.length === 0 ||
      row.entityId.length === 0
    ) {
      return null;
    }
    return {
      invitationId: parsed.invitationId,
      tokenId: row.entityId,
    };
  } catch {
    return null;
  }
}

function boundedLimit(limit: number): number {
  return Math.max(
    1,
    Math.min(limit, STABLE_INVITATION_REJECTION_REPAIR_BATCH_LIMIT),
  );
}

async function listPendingRows(
  db: StableInvitationRejectionOutboxDb,
  limit: number,
): Promise<AuditRow[]> {
  return db.auditLog.findMany({
    where: {
      entityType: STABLE_INVITATION_REJECTION_REPAIR_ENTITY_TYPE,
      action: STABLE_INVITATION_REJECTION_REPAIR_PENDING_ACTION,
    },
    orderBy: [{ timestamp: "asc" }, { id: "asc" }],
    take: boundedLimit(limit),
    select: {
      id: true,
      entityId: true,
      changes: true,
      timestamp: true,
    },
  });
}

export async function listPendingStableInvitationRejectionRepairs(
  db: StableInvitationRejectionOutboxDb,
  limit = STABLE_INVITATION_REJECTION_REPAIR_BATCH_LIMIT,
): Promise<StableRejectedTokenIdentity[]> {
  const rows = await listPendingRows(db, limit);
  return rows
    .map(parsePendingIntent)
    .filter((intent): intent is StableRejectedTokenIdentity => intent !== null);
}

export interface StableInvitationRejectionRepairDeps {
  db: StableInvitationRejectionOutboxDb;
  targetExists(input: StableRejectedTokenIdentity): Promise<boolean>;
  quarantine(input: StableRejectedTokenIdentity): Promise<void>;
  reconcile(input: StableRejectedTokenIdentity): Promise<void>;
}

export interface StableInvitationRejectionRepairTargetDb {
  assessmentInvitationToken: {
    findUnique(args: {
      where: { id: string };
      select: { invitationId: true };
    }): Promise<{ invitationId: string } | null>;
  };
}

export async function stableInvitationRejectionRepairTargetExists(
  db: StableInvitationRejectionRepairTargetDb,
  input: StableRejectedTokenIdentity,
): Promise<boolean> {
  const token = await db.assessmentInvitationToken.findUnique({
    where: { id: input.tokenId },
    select: { invitationId: true },
  });
  return token?.invitationId === input.invitationId;
}

async function rotateTransientFailure(
  db: StableInvitationRejectionOutboxDb,
  row: AuditRow,
  intent: StableRejectedTokenIdentity,
): Promise<void> {
  await db.$transaction(async (tx) => {
    const resolved = await tx.auditLog.findUnique({
      where: { id: resolvedAuditId(intent.tokenId) },
      select: { id: true },
    });
    if (resolved) {
      await tx.auditLog.updateMany({
        where: {
          id: row.id,
          action: STABLE_INVITATION_REJECTION_REPAIR_PENDING_ACTION,
        },
        data: {
          action: STABLE_INVITATION_REJECTION_REPAIR_RESOLVED_ACTION,
        },
      });
      return;
    }

    const terminal = await tx.auditLog.findUnique({
      where: { id: targetDeletedAuditId(intent.tokenId) },
      select: { id: true },
    });
    if (terminal) {
      await tx.auditLog.updateMany({
        where: {
          id: row.id,
          action: STABLE_INVITATION_REJECTION_REPAIR_PENDING_ACTION,
        },
        data: {
          action: STABLE_INVITATION_REJECTION_REPAIR_TERMINAL_ACTION,
        },
      });
      return;
    }

    const claimed = await tx.auditLog.updateMany({
      where: {
        id: row.id,
        entityType: STABLE_INVITATION_REJECTION_REPAIR_ENTITY_TYPE,
        entityId: intent.tokenId,
        action: STABLE_INVITATION_REJECTION_REPAIR_PENDING_ACTION,
      },
      data: {
        action: STABLE_INVITATION_REJECTION_REPAIR_FAILED_ATTEMPT_ACTION,
      },
    });
    if (claimed.count === 0) {
      return;
    }

    const attemptCount = await tx.auditLog.count({
      where: {
        entityType: STABLE_INVITATION_REJECTION_REPAIR_ENTITY_TYPE,
        entityId: intent.tokenId,
        action: STABLE_INVITATION_REJECTION_REPAIR_FAILED_ATTEMPT_ACTION,
      },
    });
    await tx.auditLog.updateMany({
      where: {
        id: row.id,
        action: STABLE_INVITATION_REJECTION_REPAIR_FAILED_ATTEMPT_ACTION,
      },
      data: {
        changes: failedAttemptMetadata(intent.invitationId, attemptCount),
      },
    });
    await tx.auditLog.upsert({
      where: {
        id: retryPendingAuditId(intent.tokenId, attemptCount),
      },
      create: {
        id: retryPendingAuditId(intent.tokenId, attemptCount),
        entityType: STABLE_INVITATION_REJECTION_REPAIR_ENTITY_TYPE,
        entityId: intent.tokenId,
        action: STABLE_INVITATION_REJECTION_REPAIR_PENDING_ACTION,
        performedBy: "system:stable-invitation-repair-cron",
        changes: metadata(intent.invitationId),
      },
      update: { performedBy: "system:stable-invitation-repair-cron" },
    });
  });
}

export async function drainStableInvitationRejectionRepairOutbox(
  deps: StableInvitationRejectionRepairDeps,
  options: { limit?: number } = {},
): Promise<{
  selected: number;
  resolved: number;
  skipped: number;
  failed: number;
}> {
  const rows = await listPendingRows(
    deps.db,
    options.limit ?? STABLE_INVITATION_REJECTION_REPAIR_BATCH_LIMIT,
  );
  let resolved = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of rows) {
    const intent = parsePendingIntent(row);
    if (!intent) {
      await deadLetterMalformedPendingIntent(deps.db, row);
      skipped += 1;
      continue;
    }

    try {
      if (await isStableInvitationRejectionRepairResolved(deps.db, intent)) {
        await markStableInvitationRejectionRepairResolved(deps.db, {
          ...intent,
          performedBy: "system:stable-invitation-repair-cron",
        });
        skipped += 1;
        continue;
      }
      if (!(await deps.targetExists(intent))) {
        await markStableInvitationRejectionRepairTargetDeleted(deps.db, {
          ...intent,
          performedBy: "system:stable-invitation-repair-cron",
        });
        resolved += 1;
        continue;
      }
      await deps.quarantine(intent);
      await deps.reconcile(intent);
      await markStableInvitationRejectionRepairResolved(deps.db, {
        ...intent,
        performedBy: "system:stable-invitation-repair-cron",
      });
      resolved += 1;
    } catch {
      if (await isStableInvitationRejectionRepairResolved(deps.db, intent)) {
        await markStableInvitationRejectionRepairResolved(deps.db, {
          ...intent,
          performedBy: "system:stable-invitation-repair-cron",
        });
        skipped += 1;
        continue;
      }
      try {
        if (!(await deps.targetExists(intent))) {
          await markStableInvitationRejectionRepairTargetDeleted(deps.db, {
            ...intent,
            performedBy: "system:stable-invitation-repair-cron",
          });
          resolved += 1;
          continue;
        }
      } catch {
        // An unavailable existence check is itself transient; rotate below.
      }
      await rotateTransientFailure(deps.db, row, intent);
      failed += 1;
    }
  }

  return { selected: rows.length, resolved, skipped, failed };
}
