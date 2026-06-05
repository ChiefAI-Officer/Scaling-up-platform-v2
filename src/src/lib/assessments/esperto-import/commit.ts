/**
 * Esperto historical import — Phase 1 ROSTER commit (THE only DB writer).
 *
 * Spec ref: docs/specs/v7.6/12-esperto-historical-import.md §5; plan 12a step 7,
 * S1 (additive + non-overwriting), §17 (advisory lock), §19 (one all-or-nothing
 * tx), §23 (audit inside the tx).
 *
 * `commitRosterImport(db, plan, actor)` applies a RosterImportPlan in ONE
 * `db.$transaction`. Everything else in this module is pure plan-building;
 * THIS is the single place that writes. The whole import is atomic — any failure
 * (including the audit insert) rolls the entire thing back.
 *
 * SAFETY INVARIANTS (S1 — non-negotiable):
 *   - Insert / null→value backfill ONLY. NEVER delete/deleteMany/updateMany.
 *   - NEVER overwrite an existing non-null respondent field — backfill sets only
 *     `externalId` and only when it is currently null in-tx.
 *   - The ONLY raw SQL is the `pg_advisory_xact_lock` statement that serializes
 *     org create against concurrent imports (no DB unique covers org identity).
 *   - Audit is written via `tx.auditLog.create` INSIDE the tx (not the swallowing
 *     `logAudit` helper) so a failed audit rolls back the whole import.
 *
 * Preview→commit staleness (Codex R2 A/B/C): the plan was computed against the
 * org + respondents resolved at PREVIEW time. Commit treats the in-tx state as
 * authoritative — it re-queries the org under the advisory lock and re-resolves
 * each respondent identity against freshly-fetched rows. A stale plan (org moved
 * / vanished / raced into existence, or a respondent's identity changed) throws,
 * rolling back rather than guessing.
 */

import type { RosterImportPlan } from "./roster-plan";
import { normalizeEmail } from "./roster-plan";

// ────────────────────────────────────────────────────────────────────────
// Public types
// ────────────────────────────────────────────────────────────────────────

export interface RosterCommitActor {
  userId: string;
  email: string;
}

export interface RosterCommitResult {
  orgId: string;
  orgAction: "create" | "match";
  created: number;
  backfilled: number;
  skipped: number;
  blocked: number;
}

/**
 * Thrown when the in-tx state diverges from the plan, or when the plan carries
 * blocks. Carries a machine-readable `code` so the route can map it to a status.
 */
export class RosterCommitError extends Error {
  constructor(
    public readonly code:
      | "plan-blocked"
      | "stale-plan-org-missing"
      | "stale-plan-org-mismatch"
      | "stale-plan-org-created"
      | "duplicate-org-identity"
      | "resolver-split",
    message?: string,
  ) {
    super(message ?? code);
    this.name = "RosterCommitError";
    Object.setPrototypeOf(this, RosterCommitError.prototype);
  }
}

// ────────────────────────────────────────────────────────────────────────
// Minimal tx interface — narrow to the delegates this writer touches.
// (No delete/deleteMany/updateMany delegate is declared — they cannot be
//  called because they are not on the type; the tests assert it at runtime.)
// ────────────────────────────────────────────────────────────────────────

interface ExistingRow {
  id: string;
  externalId: string | null;
  normalizedEmail: string | null;
}

export interface RosterCommitTx {
  $executeRaw: (
    template: TemplateStringsArray | string,
    ...values: unknown[]
  ) => Promise<number>;
  organization: {
    findFirst: (args: {
      where: { ownerCoachId: string; name: string; deletedAt: null };
    }) => Promise<{ id: string } | null>;
    create: (args: {
      data: { name: string; ownerCoachId: string };
    }) => Promise<{ id: string }>;
  };
  orgRespondent: {
    findMany: (args: {
      where: { organizationId: string; deletedAt: null };
      select: { id: true; externalId: true; normalizedEmail: true };
    }) => Promise<ExistingRow[]>;
    create: (args: { data: Record<string, unknown> }) => Promise<{ id: string }>;
    update: (args: {
      where: { id: string };
      data: { externalId: string };
    }) => Promise<{ id: string }>;
  };
  auditLog: {
    create: (args: { data: Record<string, unknown> }) => Promise<{ id: string }>;
  };
}

export interface RosterCommitDb {
  $transaction: <T>(fn: (tx: RosterCommitTx) => Promise<T>) => Promise<T>;
}

// ────────────────────────────────────────────────────────────────────────
// commitRosterImport
// ────────────────────────────────────────────────────────────────────────

export async function commitRosterImport(
  db: RosterCommitDb,
  plan: RosterImportPlan,
  actor: RosterCommitActor,
): Promise<RosterCommitResult> {
  // Fail BEFORE opening the tx if the plan is structurally invalid.
  if (plan.blocks.length > 0) {
    throw new RosterCommitError(
      "plan-blocked",
      `Plan has ${plan.blocks.length} blocking error(s); refusing to commit.`,
    );
  }

  const normalizedCompanyName = plan.companyName.trim();

  return db.$transaction(async (tx) => {
    // ── 1. Serialize org create against concurrent imports (no DB unique). ─
    //    The ONLY raw SQL allowed (S1). hashtext is the pinned string→int4
    //    conversion (greptile P1). pg_advisory_xact_lock auto-releases at the
    //    end of the transaction.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${plan.ownerCoachId}), hashtext(${normalizedCompanyName}))`;

    // ── 2. Resolve the org authoritatively in-tx. ─────────────────────────
    const found = await tx.organization.findFirst({
      where: {
        ownerCoachId: plan.ownerCoachId,
        name: normalizedCompanyName,
        deletedAt: null,
      },
    });

    let orgId: string;
    if (plan.orgAction === "match") {
      if (!found) {
        throw new RosterCommitError("stale-plan-org-missing");
      }
      if (found.id !== plan.orgId) {
        throw new RosterCommitError("stale-plan-org-mismatch");
      }
      orgId = found.id;
    } else {
      // orgAction === "create"
      if (found) {
        // A concurrent import created the org since preview — refuse rather
        // than silently retarget (respondent dedupe was computed for a new,
        // empty org). The operator re-previews against the now-existing org.
        throw new RosterCommitError("stale-plan-org-created");
      }
      const created = await tx.organization.create({
        data: { name: normalizedCompanyName, ownerCoachId: plan.ownerCoachId },
      });
      orgId = created.id;
    }

    // ── 3. Re-resolve respondent identities against fresh in-tx rows. ──────
    //    Preview-time creates/backfills may be stale; the in-tx rows are
    //    authoritative. This keeps every write additive + non-overwriting.
    const existing = await tx.orgRespondent.findMany({
      where: { organizationId: orgId, deletedAt: null },
      select: { id: true, externalId: true, normalizedEmail: true },
    });
    const byExternalId = new Map<string, ExistingRow>();
    const byEmail = new Map<string, ExistingRow>();
    for (const r of existing) {
      if (r.externalId) byExternalId.set(r.externalId, r);
      if (r.normalizedEmail) byEmail.set(r.normalizedEmail, r);
    }

    let created = 0;
    let backfilled = 0;

    // 3a. Creates — re-resolve; only insert truly-new identities.
    for (const c of plan.creates) {
      const ne = c.normalizedEmail;
      const extMatch = byExternalId.get(c.externalId) ?? null;
      const emailMatch = byEmail.get(ne) ?? null;

      // Resolver split appeared in-tx → block (rolls back).
      if (extMatch && emailMatch && extMatch.id !== emailMatch.id) {
        throw new RosterCommitError("resolver-split");
      }
      if (
        emailMatch &&
        emailMatch.externalId !== null &&
        emailMatch.externalId !== c.externalId
      ) {
        throw new RosterCommitError("resolver-split");
      }

      if (extMatch) {
        // Already imported in-tx → no-op (never overwrite).
        continue;
      }
      if (emailMatch) {
        // Email row appeared in-tx → backfill externalId only (if still null).
        if (emailMatch.externalId === null) {
          await tx.orgRespondent.update({
            where: { id: emailMatch.id },
            data: { externalId: c.externalId },
          });
          backfilled++;
        }
        continue;
      }

      await tx.orgRespondent.create({
        data: {
          organizationId: orgId,
          teamId: null,
          email: c.email,
          normalizedEmail: c.normalizedEmail,
          firstName: c.firstName,
          lastName: c.lastName,
          jobTitle: c.jobTitle,
          roleType: c.roleType,
          externalId: c.externalId,
          dedupeSource: c.dedupeSource,
          dedupeValue: c.dedupeValue,
        },
      });
      created++;

      // Reflect the just-created row so a later duplicate in the same plan
      // re-resolves to it rather than inserting twice.
      byExternalId.set(c.externalId, {
        id: "pending",
        externalId: c.externalId,
        normalizedEmail: ne,
      });
      byEmail.set(ne, { id: "pending", externalId: c.externalId, normalizedEmail: ne });
    }

    // 3b. Backfills — set externalId ONLY where currently null in-tx.
    for (const b of plan.backfills) {
      const row = existing.find((r) => r.id === b.id);
      if (!row) {
        // Row vanished since preview → skip (additive: nothing to backfill).
        continue;
      }
      if (row.externalId === null) {
        await tx.orgRespondent.update({
          where: { id: b.id },
          data: { externalId: b.externalId },
        });
        backfilled++;
      } else if (row.externalId !== b.externalId) {
        // Gained a CONFLICTING externalId since preview → block (rolls back).
        throw new RosterCommitError("resolver-split");
      }
      // row.externalId === b.externalId → already done, no-op.
    }

    // ── 4. Audit (inside the tx — rolls back with a failed import). ────────
    const result: RosterCommitResult = {
      orgId,
      orgAction: plan.orgAction,
      created,
      backfilled,
      skipped: plan.skips.length,
      blocked: plan.blocks.length,
    };

    await tx.auditLog.create({
      data: {
        entityType: "EspertoRosterImport",
        entityId: orgId,
        action: "IMPORT",
        performedBy: actor.email,
        changes: JSON.stringify({
          companyName: plan.companyName,
          ownerCoachId: plan.ownerCoachId,
          orgAction: plan.orgAction,
          created,
          backfilled,
          skipped: plan.skips.length,
          blocked: plan.blocks.length,
          source: "esperto-members",
        }),
      },
    });

    return result;
  });
}
