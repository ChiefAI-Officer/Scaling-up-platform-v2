/**
 * Assessment v7.6 — Pre-save guard for AccessGroup family mutations.
 *
 * Spec ref: docs/specs/v7.6/02-service-layer-rules.md →
 *   "evaluateAccessChange — transactional commit (Round 1 H-2 + Round 2 H-2
 *    + Round 2 M-4 + Round 3 H-4)" and "Lifecycle mutations covered by
 *    the same guard (Round 2 H-3)".
 *
 * Caller contract:
 *   - Caller opens an outer Prisma `$transaction` at SERIALIZABLE
 *     isolation level (or relies on Postgres default + advisory locks).
 *   - Caller passes the `tx` client to this function BEFORE issuing the
 *     real mutation. The guard acquires advisory locks, snapshots state,
 *     simulates the proposed change in memory, decides whether to block,
 *     and (on the commit path) writes the AuditLog row.
 *   - On `blocked=true` the caller must NOT issue the mutation.
 *   - The mutation itself is NOT performed here — the caller writes the
 *     accessGroupCoach/accessGroupTemplate row (or soft-deletes the
 *     group) AFTER this returns with `blocked=false`. The atomic semantic
 *     comes from the outer `$transaction`.
 *
 * Lock convention: alphabetical sorted order on the lock key (deadlock-
 * free per the multi-actor lock guide). Coach keys: hashtext('access-
 * change:' || coachId). Group keys: hashtext('access-group:' || groupId).
 *
 * Audit: written via `tx.auditLog.create` direct (NOT the swallowing
 * `logAudit()` helper — Round 2 M-4).
 */

import { AccessChangeError } from "./errors";
import { getAccessPolicyVersion } from "@/lib/auth/access-policy-version";

// ────────────────────────────────────────────────────────────────────────
// Public types
// ────────────────────────────────────────────────────────────────────────

export type AccessChangeKind =
  | "ADD_COACH_TO_GROUP"
  | "REMOVE_COACH_FROM_GROUP"
  | "ADD_TEMPLATE_TO_GROUP"
  | "REMOVE_TEMPLATE_FROM_GROUP"
  | "ARCHIVE_GROUP"
  | "UNDELETE_GROUP"
  | "HARD_DELETE_GROUP";

interface BaseChange {
  performedByUserId: string;
  force?: boolean;
  forceReason?: string;
}

export type AccessChangeRequest =
  | (BaseChange & {
      kind: "ADD_COACH_TO_GROUP" | "REMOVE_COACH_FROM_GROUP";
      accessGroupId: string;
      coachId: string;
    })
  | (BaseChange & {
      kind: "ADD_TEMPLATE_TO_GROUP" | "REMOVE_TEMPLATE_FROM_GROUP";
      accessGroupId: string;
      templateId: string;
    })
  | (BaseChange & {
      kind: "ARCHIVE_GROUP" | "UNDELETE_GROUP" | "HARD_DELETE_GROUP";
      accessGroupId: string;
    });

export interface AccessChangeResult {
  /** true if the guard would prevent the caller from proceeding (only
   * possible when `force` is unset and at least one affected coach drops
   * to zero access while holding active/draft campaigns). */
  blocked: boolean;
  /** Coaches whose effective template set changes as a result. */
  affectedCoachIds: string[];
  /** Coaches who land at ZERO effective templates after the change AND
   * who own at least one ACTIVE/DRAFT campaign (the dangerous cohort). */
  forcedZeroCoachIds: string[];
  /** id of the AuditLog row written on the commit path. */
  auditLogId: string | null;
}

// ────────────────────────────────────────────────────────────────────────
// Minimal Prisma-shape tx interface
// ────────────────────────────────────────────────────────────────────────

export interface AccessChangeTx {
  $executeRaw: (
    template: TemplateStringsArray | string,
    ...values: unknown[]
  ) => Promise<number>;
  accessGroup: {
    findMany: (args: {
      where?: { id?: { in?: string[] } };
    }) => Promise<Array<{ id: string; name: string; deletedAt: Date | null }>>;
  };
  accessGroupCoach: {
    findMany: (args: {
      where?: {
        coachId?: string | { in?: string[] };
        accessGroupId?: string | { in?: string[] };
      };
      include?: {
        accessGroup?:
          | boolean
          | { select?: { id?: boolean; deletedAt?: boolean } };
      };
    }) => Promise<
      Array<{
        id: string;
        accessGroupId: string;
        coachId: string;
        accessGroup: { id: string; deletedAt: Date | null };
      }>
    >;
  };
  accessGroupTemplate: {
    findMany: (args: {
      where?: {
        accessGroupId?: { in?: string[] };
        templateId?: string;
      };
    }) => Promise<Array<{ id: string; accessGroupId: string; templateId: string }>>;
  };
  assessmentCampaign: {
    findMany: (args: {
      where?: {
        createdByCoachId?: string;
        status?: { in?: string[] };
      };
    }) => Promise<
      Array<{
        id: string;
        templateId: string;
        createdByCoachId: string | null;
        status: "DRAFT" | "ACTIVE" | "CLOSED";
      }>
    >;
  };
  auditLog: {
    create: (args: {
      data: Record<string, unknown>;
    }) => Promise<{ id: string } & Record<string, unknown>>;
  };
}

// ────────────────────────────────────────────────────────────────────────
// Internals — compute INTERSECTION over a snapshot
// ────────────────────────────────────────────────────────────────────────

interface Snapshot {
  /** per-coach: set of active (non-archived) accessGroupIds */
  coachGroups: Map<string, Set<string>>;
  /** per-group: set of templateIds the group grants */
  groupTemplates: Map<string, Set<string>>;
}

function effectiveTemplatesForCoach(
  snap: Snapshot,
  coachId: string,
): Set<string> {
  const groups = snap.coachGroups.get(coachId);
  if (!groups || groups.size === 0) return new Set();
  // INTERSECTION across all groups: a template T must be in EVERY group.
  const groupTemplateSets: Array<Set<string>> = [];
  for (const g of groups) {
    groupTemplateSets.push(snap.groupTemplates.get(g) ?? new Set<string>());
  }
  if (groupTemplateSets.length === 0) return new Set();
  const [first, ...rest] = groupTemplateSets;
  const result = new Set<string>();
  for (const t of first) {
    if (rest.every((s) => s.has(t))) result.add(t);
  }
  return result;
}

function cloneSnapshot(snap: Snapshot): Snapshot {
  return {
    coachGroups: new Map(
      Array.from(snap.coachGroups.entries()).map(([k, v]) => [
        k,
        new Set(v),
      ]),
    ),
    groupTemplates: new Map(
      Array.from(snap.groupTemplates.entries()).map(([k, v]) => [
        k,
        new Set(v),
      ]),
    ),
  };
}

function applyChange(snap: Snapshot, change: AccessChangeRequest): void {
  switch (change.kind) {
    case "ADD_COACH_TO_GROUP": {
      const set = snap.coachGroups.get(change.coachId) ?? new Set<string>();
      set.add(change.accessGroupId);
      snap.coachGroups.set(change.coachId, set);
      return;
    }
    case "REMOVE_COACH_FROM_GROUP": {
      const set = snap.coachGroups.get(change.coachId);
      if (set) set.delete(change.accessGroupId);
      return;
    }
    case "ADD_TEMPLATE_TO_GROUP": {
      const set = snap.groupTemplates.get(change.accessGroupId) ?? new Set();
      set.add(change.templateId);
      snap.groupTemplates.set(change.accessGroupId, set);
      return;
    }
    case "REMOVE_TEMPLATE_FROM_GROUP": {
      const set = snap.groupTemplates.get(change.accessGroupId);
      if (set) set.delete(change.templateId);
      return;
    }
    case "ARCHIVE_GROUP":
    case "HARD_DELETE_GROUP": {
      // Both remove the group from active intersection: drop it from
      // every coach's group set AND drop its template set.
      for (const set of snap.coachGroups.values()) {
        set.delete(change.accessGroupId);
      }
      snap.groupTemplates.delete(change.accessGroupId);
      return;
    }
    case "UNDELETE_GROUP": {
      // Caller is responsible for re-attaching the group's coach
      // memberships and template grants — those rows are preserved on
      // archive. We rely on the snapshot already containing them; nothing
      // to do here. (If your DB row reads excluded archived groups, you
      // need a separate pre-step before calling this guard.)
      return;
    }
  }
}

// ────────────────────────────────────────────────────────────────────────
// Public function
// ────────────────────────────────────────────────────────────────────────

export async function evaluateAccessChange(
  tx: AccessChangeTx,
  change: AccessChangeRequest,
): Promise<AccessChangeResult> {
  // ── Step 0: validate force pre-conditions ──
  if (change.force) {
    if (
      typeof change.forceReason !== "string" ||
      change.forceReason.trim().length === 0
    ) {
      throw new AccessChangeError(
        "INVALID_FORCE_REASON",
        { kind: change.kind },
        "force=true requires a non-empty forceReason",
      );
    }
  }

  // ── Step 1: determine the initial affected-coach set ──
  let initialAffectedCoaches: string[] = [];
  switch (change.kind) {
    case "ADD_COACH_TO_GROUP":
    case "REMOVE_COACH_FROM_GROUP":
      initialAffectedCoaches = [change.coachId];
      break;
    case "ADD_TEMPLATE_TO_GROUP":
    case "REMOVE_TEMPLATE_FROM_GROUP":
    case "ARCHIVE_GROUP":
    case "UNDELETE_GROUP":
    case "HARD_DELETE_GROUP": {
      const rows = await tx.accessGroupCoach.findMany({
        where: { accessGroupId: change.accessGroupId },
      });
      initialAffectedCoaches = Array.from(
        new Set(rows.map((r) => r.coachId)),
      );
      break;
    }
  }

  // ── Step 2: acquire advisory locks in sorted-alphabetical order ──
  // Coach locks first, then the group lock. Each lock key includes its
  // namespace prefix so coach IDs and group IDs cannot collide in the
  // 64-bit lock space.
  const coachLockKeys = [...initialAffectedCoaches].sort();
  for (const cid of coachLockKeys) {
    const key = `access-change:${cid}`;
    // Tagged template so Prisma binds the param safely. The hashtext()
    // call lives in SQL — we cannot precompute it client-side.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
  }
  {
    const groupKey = `access-group:${change.accessGroupId}`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${groupKey}))`;
  }

  // ── Step 3: snapshot current state (post-lock) ──
  // Re-read affected coaches inside the locked tx (Round 3 H-4).
  let affectedCoachIds: string[];
  if (
    change.kind === "ADD_COACH_TO_GROUP" ||
    change.kind === "REMOVE_COACH_FROM_GROUP"
  ) {
    affectedCoachIds = [change.coachId];
  } else {
    const rows = await tx.accessGroupCoach.findMany({
      where: { accessGroupId: change.accessGroupId },
    });
    affectedCoachIds = Array.from(new Set(rows.map((r) => r.coachId)));
  }

  // Build snapshot covering all groups any affected coach belongs to.
  // MUST include accessGroup — the loops below read r.accessGroup.deletedAt to
  // skip archived groups; without the include it is undefined and throws.
  const coachGroupRows = await tx.accessGroupCoach.findMany({
    where: { coachId: { in: affectedCoachIds } },
    include: { accessGroup: { select: { id: true, deletedAt: true } } },
  });
  const allGroupIds = new Set<string>([change.accessGroupId]);
  for (const r of coachGroupRows) {
    if (r.accessGroup.deletedAt === null) {
      allGroupIds.add(r.accessGroupId);
    }
  }
  const groupTemplateRows = await tx.accessGroupTemplate.findMany({
    where: { accessGroupId: { in: Array.from(allGroupIds) } },
  });

  const snapBefore: Snapshot = {
    coachGroups: new Map(),
    groupTemplates: new Map(),
  };
  for (const r of coachGroupRows) {
    if (r.accessGroup.deletedAt !== null) continue;
    const set = snapBefore.coachGroups.get(r.coachId) ?? new Set<string>();
    set.add(r.accessGroupId);
    snapBefore.coachGroups.set(r.coachId, set);
  }
  for (const r of groupTemplateRows) {
    const set = snapBefore.groupTemplates.get(r.accessGroupId) ?? new Set();
    set.add(r.templateId);
    snapBefore.groupTemplates.set(r.accessGroupId, set);
  }

  // ── Step 4: simulate the proposed change ──
  const snapAfter = cloneSnapshot(snapBefore);
  applyChange(snapAfter, change);

  // ── Step 5: identify coaches whose effective access dropped to zero ──
  const forcedZeroCoachIds: string[] = [];
  for (const cid of affectedCoachIds) {
    const after = effectiveTemplatesForCoach(snapAfter, cid);
    if (after.size === 0) {
      // Coach lands at zero — block only if they hold active workload.
      const campaigns = await tx.assessmentCampaign.findMany({
        where: {
          createdByCoachId: cid,
          status: { in: ["DRAFT", "ACTIVE"] },
        },
      });
      if (campaigns.length > 0) {
        forcedZeroCoachIds.push(cid);
      }
    }
  }

  // ── Step 6: block decision ──
  if (forcedZeroCoachIds.length > 0 && !change.force) {
    throw new AccessChangeError(
      "BLOCKED_ZERO_ACCESS",
      {
        affectedCoachIds: forcedZeroCoachIds,
        kind: change.kind,
        accessGroupId: change.accessGroupId,
      },
      "Mutation would drop one or more coaches to zero template access while they own active campaigns",
    );
  }

  // ── Step 7: write audit row (transactional — no swallowing wrapper) ──
  const entityType =
    change.kind === "ADD_COACH_TO_GROUP" ||
    change.kind === "REMOVE_COACH_FROM_GROUP"
      ? "AccessGroupCoach"
      : change.kind === "ADD_TEMPLATE_TO_GROUP" ||
          change.kind === "REMOVE_TEMPLATE_FROM_GROUP"
        ? "AccessGroupTemplate"
        : "AccessGroup";

  const action: string = (() => {
    switch (change.kind) {
      case "ADD_COACH_TO_GROUP":
      case "ADD_TEMPLATE_TO_GROUP":
        return "ADDED";
      case "REMOVE_COACH_FROM_GROUP":
      case "REMOVE_TEMPLATE_FROM_GROUP":
        return "REMOVED";
      case "ARCHIVE_GROUP":
        return "ARCHIVED";
      case "UNDELETE_GROUP":
        return "UNDELETED";
      case "HARD_DELETE_GROUP":
        return "HARD_DELETED";
    }
  })();

  const changesPayload: Record<string, unknown> = {
    kind: change.kind,
    accessGroupId: change.accessGroupId,
    policyVersion: getAccessPolicyVersion(),
    affectedCoachIds,
    forcedZeroCoachIds,
  };
  if ("coachId" in change) changesPayload.coachId = change.coachId;
  if ("templateId" in change) changesPayload.templateId = change.templateId;
  if (change.force) {
    changesPayload.force = true;
    changesPayload.reason = change.forceReason;
  }

  const auditRow = await tx.auditLog.create({
    data: {
      entityType,
      entityId: change.accessGroupId,
      action: change.force && forcedZeroCoachIds.length > 0 ? "FORCE_ZERO" : action,
      performedBy: change.performedByUserId,
      changes: JSON.stringify(changesPayload),
    },
  });

  return {
    blocked: false,
    affectedCoachIds,
    forcedZeroCoachIds,
    auditLogId: auditRow.id,
  };
}
