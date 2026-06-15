/**
 * Assessment v7.6 — Service-layer access-control predicates.
 *
 * Spec ref: docs/specs/v7.6/02-service-layer-rules.md.
 *
 * All predicates take a Prisma client (or a `tx` transaction client) plus
 * the actor + target IDs and return a Promise<boolean>. They DO NOT throw
 * on the access-deny path — the API route layer is responsible for
 * translating a `false` into the appropriate HTTP status. Predicates may
 * throw `AccessControlError` on UNEXPECTED states (e.g. a campaign whose
 * organizationId points at a non-existent org), but the standard "no
 * access" path returns `false`.
 *
 * Admin / staff actors bypass at the top of every predicate (decision 1).
 *
 * INTERSECTION semantics (`canAccessTemplate`) are evaluated against the
 * runtime feature flag `ACCESS_POLICY_VERSION`. The default and v1
 * production value is `"intersection"`. `"shadow-union"` runs both and
 * emits a divergence log via `console.info` — INTERSECTION still wins.
 * `"union"` is the emergency-revert path.
 */

import type { ApiActor } from "@/lib/auth/access-control";
import { isPrivilegedRole } from "@/lib/auth/access-control";
import { CERTIFIED_STATUS, DEACTIVATED_STATUS } from "@/lib/auth/coach-status";
import {
  getAccessPolicyVersion,
  type AccessPolicyVersion,
} from "@/lib/auth/access-policy-version";

// ────────────────────────────────────────────────────────────────────────
// Minimal Prisma-shape client interface — accepts the full Prisma client
// AND a transaction client. We intentionally narrow to the delegates we
// actually use so tests can stub these in isolation.
// ────────────────────────────────────────────────────────────────────────

export interface AccessControlDb {
  accessGroupCoach: {
    findMany: (args: {
      where?: { coachId?: string };
      select?: Record<string, unknown>;
      include?: Record<string, unknown>;
    }) => Promise<
      Array<{
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
    }) => Promise<Array<{ accessGroupId: string; templateId: string }>>;
  };
  organization: {
    findUnique: (args: {
      where: { id: string };
    }) => Promise<{
      id: string;
      ownerCoachId: string;
      deletedAt: Date | null;
    } | null>;
  };
  coach: {
    findUnique: (args: {
      where: { id: string };
    }) => Promise<{ id: string; certificationStatus: string } | null>;
  };
  assessmentCampaign: {
    // SEC-M6: load LIVE campaigns via findFirst so the deletedAt soft-delete
    // tombstone can be pinned in the where (deletedAt is not a unique field,
    // so findUnique cannot filter on it).
    findFirst: (args: {
      where: { id: string; deletedAt?: Date | null };
    }) => Promise<{
      id: string;
      organizationId: string;
      templateId: string;
      createdByCoachId: string | null;
      status: "DRAFT" | "ACTIVE" | "CLOSED";
      deletedAt: Date | null;
    } | null>;
  };
}

// ────────────────────────────────────────────────────────────────────────
// canAccessTemplate — INTERSECTION semantics gated by ACCESS_POLICY_VERSION
// ────────────────────────────────────────────────────────────────────────

interface GroupRow {
  accessGroupId: string;
  accessGroup: { id: string; deletedAt: Date | null };
}

async function getActiveGroupIdsForCoach(
  db: AccessControlDb,
  coachId: string,
): Promise<string[]> {
  const rows = (await db.accessGroupCoach.findMany({
    where: { coachId },
    include: { accessGroup: true },
  })) as GroupRow[];
  // Defensive: in case a caller passes a stub that doesn't filter, drop
  // soft-deleted groups here too. The DB should also filter.
  return rows
    .filter((r) => r.accessGroup && r.accessGroup.deletedAt === null)
    .map((r) => r.accessGroupId);
}

async function intersectionGrantsTemplate(
  db: AccessControlDb,
  coachGroupIds: string[],
  templateId: string,
): Promise<boolean> {
  if (coachGroupIds.length === 0) return false;

  const templateRows = await db.accessGroupTemplate.findMany({
    where: {
      accessGroupId: { in: coachGroupIds },
      templateId,
    },
  });
  // INTERSECTION: EVERY group the coach belongs to must grant the template.
  const grantingGroupIds = new Set(templateRows.map((r) => r.accessGroupId));
  return coachGroupIds.every((id) => grantingGroupIds.has(id));
}

async function unionGrantsTemplate(
  db: AccessControlDb,
  coachGroupIds: string[],
  templateId: string,
): Promise<boolean> {
  if (coachGroupIds.length === 0) return false;
  const templateRows = await db.accessGroupTemplate.findMany({
    where: {
      accessGroupId: { in: coachGroupIds },
      templateId,
    },
  });
  return templateRows.length > 0;
}

export async function canAccessTemplate(
  db: AccessControlDb,
  actor: ApiActor,
  templateId: string,
): Promise<boolean> {
  if (isPrivilegedRole(actor.role)) return true;
  if (!actor.coachId) return false;

  const policy: AccessPolicyVersion = getAccessPolicyVersion();
  const coachGroupIds = await getActiveGroupIdsForCoach(db, actor.coachId);

  if (policy === "union") {
    return unionGrantsTemplate(db, coachGroupIds, templateId);
  }

  const intersection = await intersectionGrantsTemplate(
    db,
    coachGroupIds,
    templateId,
  );

  if (policy === "shadow-union") {
    const union = await unionGrantsTemplate(db, coachGroupIds, templateId);
    if (intersection !== union) {
      // Low-cardinality structured log; sampled per spec. We always log
      // on divergence in shadow mode — sampling is the operator's call
      // via a downstream log filter, NOT a per-call decision here.
      // eslint-disable-next-line no-console
      console.info(
        JSON.stringify({
          level: "info",
          event: "access.shadow-divergence",
          coachId: actor.coachId,
          templateId,
          intersection,
          union,
          groupIds: coachGroupIds,
          policyVersion: policy,
        }),
      );
    }
  }

  return intersection;
}

// ────────────────────────────────────────────────────────────────────────
// canAccessOrganization
// ────────────────────────────────────────────────────────────────────────

export async function canAccessOrganization(
  db: AccessControlDb,
  actor: ApiActor,
  organizationId: string,
): Promise<boolean> {
  const org = await db.organization.findUnique({ where: { id: organizationId } });
  if (!org) return false;
  // Soft-deleted orgs are inaccessible to everyone — admin included.
  if (org.deletedAt !== null) return false;
  if (isPrivilegedRole(actor.role)) return true;
  return Boolean(actor.coachId) && org.ownerCoachId === actor.coachId;
}

// ────────────────────────────────────────────────────────────────────────
// canCreateCampaign
// ────────────────────────────────────────────────────────────────────────

export async function canCreateCampaign(
  db: AccessControlDb,
  actor: ApiActor,
  templateId: string,
): Promise<boolean> {
  if (isPrivilegedRole(actor.role)) return true;
  if (!actor.coachId) return false;

  const coach = await db.coach.findUnique({ where: { id: actor.coachId } });
  if (!coach) return false;
  if (coach.certificationStatus === DEACTIVATED_STATUS) return false;
  if (coach.certificationStatus !== CERTIFIED_STATUS) return false;

  // Template access (INTERSECTION-driven) is the final gate.
  return canAccessTemplate(db, actor, templateId);
}

// ────────────────────────────────────────────────────────────────────────
// canManageCampaign — read vs write distinction (Round 2 M-3, Round 1 H-8)
// ────────────────────────────────────────────────────────────────────────

export type CampaignAccessMode = "read" | "write";

export async function canManageCampaign(
  db: AccessControlDb,
  actor: ApiActor,
  campaignId: string,
  mode: CampaignAccessMode,
  options: { includeDeleted?: boolean } = {},
): Promise<boolean> {
  // SEC-M6: LIVE-only by default — a soft-deleted campaign is treated as
  // not-found / no access for everyone (admin included). `includeDeleted`
  // is the explicit opt-in for a future admin-recovery code path ONLY.
  const campaign = await db.assessmentCampaign.findFirst({
    where: options.includeDeleted
      ? { id: campaignId }
      : { id: campaignId, deletedAt: null },
  });
  if (!campaign) return false;

  if (isPrivilegedRole(actor.role)) return true;
  if (!actor.coachId) return false;

  // Coach must be the campaign creator; admin-created PUBLIC campaigns
  // (createdByCoachId=null) are admin-only — coaches cannot read or write.
  if (campaign.createdByCoachId === null) return false;
  if (campaign.createdByCoachId !== actor.coachId) return false;

  // READ is always permitted for the creator coach, even after losing
  // template access (banner explains the revoked state on the detail page).
  if (mode === "read") return true;

  // WRITE requires the coach to STILL own the org AND STILL have template
  // access. This is the H-8 revocation path: losing template access keeps
  // the campaign visible but drops write permissions.
  const org = await db.organization.findUnique({
    where: { id: campaign.organizationId },
  });
  if (!org || org.deletedAt !== null) return false;
  if (org.ownerCoachId !== actor.coachId) return false;

  return canAccessTemplate(db, actor, campaign.templateId);
}

// ────────────────────────────────────────────────────────────────────────
// canAccessAggregateReport — admin/staff-only gate for the aggregate
// dashboard surface (sidebar entry + route + CSV exports). Coaches get a
// per-org / per-campaign view; the cross-org aggregate is restricted to
// privileged roles. Spec: docs/specs/v7.6/02-service-layer-rules.md.
// ────────────────────────────────────────────────────────────────────────

export function canAccessAggregateReport(actor: {
  role: ApiActor["role"];
}): boolean {
  return isPrivilegedRole(actor.role);
}

// ────────────────────────────────────────────────────────────────────────
// asAccessDb — production helper to bridge the real Prisma client
// into the narrow AccessControlDb interface. The narrow interface is for
// test stubbing; in app code, the actual Prisma client is a superset.
// ────────────────────────────────────────────────────────────────────────

export function asAccessDb(prisma: unknown): AccessControlDb {
  return prisma as AccessControlDb;
}
