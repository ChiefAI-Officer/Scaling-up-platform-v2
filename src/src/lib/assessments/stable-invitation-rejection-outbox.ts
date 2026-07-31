import type { StableRejectedTokenIdentity } from "./stable-invitation-tokens";

export const STABLE_INVITATION_REJECTION_REPAIR_ENTITY_TYPE =
  "AssessmentInvitationToken" as const;
export const STABLE_INVITATION_REJECTION_REPAIR_PENDING_ACTION =
  "STABLE_INVITATION_REJECTION_REPAIR_PENDING" as const;
export const STABLE_INVITATION_REJECTION_REPAIR_RESOLVED_ACTION =
  "STABLE_INVITATION_REJECTION_REPAIR_RESOLVED" as const;
export const STABLE_INVITATION_REJECTION_REPAIR_BATCH_LIMIT = 50;

interface AuditCreate {
  id?: string;
  entityType: typeof STABLE_INVITATION_REJECTION_REPAIR_ENTITY_TYPE;
  entityId: string;
  action:
    | typeof STABLE_INVITATION_REJECTION_REPAIR_PENDING_ACTION
    | typeof STABLE_INVITATION_REJECTION_REPAIR_RESOLVED_ACTION;
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
        entityType: typeof STABLE_INVITATION_REJECTION_REPAIR_ENTITY_TYPE;
        entityId: string;
        action: typeof STABLE_INVITATION_REJECTION_REPAIR_PENDING_ACTION;
      };
      data: {
        action: typeof STABLE_INVITATION_REJECTION_REPAIR_RESOLVED_ACTION;
      };
    }): Promise<{ count: number }>;
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

function metadata(invitationId: string): string {
  return JSON.stringify({ invitationId });
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

export async function listPendingStableInvitationRejectionRepairs(
  db: StableInvitationRejectionOutboxDb,
  limit = STABLE_INVITATION_REJECTION_REPAIR_BATCH_LIMIT,
): Promise<StableRejectedTokenIdentity[]> {
  const boundedLimit = Math.max(
    1,
    Math.min(limit, STABLE_INVITATION_REJECTION_REPAIR_BATCH_LIMIT),
  );
  const rows = await db.auditLog.findMany({
    where: {
      entityType: STABLE_INVITATION_REJECTION_REPAIR_ENTITY_TYPE,
      action: STABLE_INVITATION_REJECTION_REPAIR_PENDING_ACTION,
    },
    orderBy: [{ timestamp: "asc" }, { id: "asc" }],
    take: boundedLimit,
    select: {
      id: true,
      entityId: true,
      changes: true,
      timestamp: true,
    },
  });
  return rows
    .map(parsePendingIntent)
    .filter((intent): intent is StableRejectedTokenIdentity => intent !== null);
}

export interface StableInvitationRejectionRepairDeps {
  db: StableInvitationRejectionOutboxDb;
  quarantine(input: StableRejectedTokenIdentity): Promise<void>;
  reconcile(input: StableRejectedTokenIdentity): Promise<void>;
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
  const intents = await listPendingStableInvitationRejectionRepairs(
    deps.db,
    options.limit,
  );
  let resolved = 0;
  let skipped = 0;
  let failed = 0;

  for (const intent of intents) {
    try {
      if (await isStableInvitationRejectionRepairResolved(deps.db, intent)) {
        skipped += 1;
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
      failed += 1;
    }
  }

  return { selected: intents.length, resolved, skipped, failed };
}
