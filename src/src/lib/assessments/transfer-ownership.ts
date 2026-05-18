/**
 * Assessment v7.6 — Organization ownership-transfer service.
 *
 * Spec ref: docs/specs/v7.6/02-service-layer-rules.md →
 *   "Ownership transfer flow (Round 1 H-5 + Round 2 M-2 + Round 3 H-5 +
 *    Round 3 M-7)" and the audit-trail rule.
 *
 * Caller contract:
 *   - Caller opens an outer Prisma `$transaction` (recommended SERIALIZABLE
 *     isolation; failures with `40001` retry up to 3 times with backoff).
 *   - Caller passes the `tx` client BEFORE issuing the actual update. This
 *     function acquires advisory locks, runs the pre-flight checks against
 *     the locked snapshot, issues the mutations, writes the
 *     OrganizationOwnershipEvent and AuditLog rows, and returns the
 *     summary. All mutations live in the SAME transaction; failure rolls
 *     back the entire transfer.
 *
 * Lock convention: keys are namespaced and sorted alphabetically before
 * acquisition — `org-transfer:<orgId>` and `access-change:<newOwnerId>`.
 * Same lock keyspace as `evaluateAccessChange`, so a concurrent
 * group-membership mutation against the new owner serializes against an
 * in-flight transfer (Round 3 H-5).
 *
 * Audit: written via `tx.auditLog.create` direct (NOT the swallowing
 * `logAudit()` helper). Audit failure aborts the entire transfer.
 *
 * Public-facing failure modes (matching the spec's HTTP 409 list):
 *   - NEW_OWNER_NOT_CERTIFIED        — coach missing / DEACTIVATED / not ACTIVE
 *   - NEW_OWNER_NO_TEMPLATE_ACCESS   — new owner can't access one or more
 *                                      campaign templates
 *   - RETAINED_CLOSED_NOT_ACKNOWLEDGED — admin opted out of CLOSED transfer
 *                                        but did not flip the ack flag.
 *
 * Plus a non-coded Error for "Organization not found" (matching how the
 * existing service layer handles unrecoverable lookup failures — there is
 * no OwnershipTransferCode for this case per the spec's 404 branch).
 */

import { Prisma } from "@prisma/client";
import { OwnershipTransferError } from "./errors";
import { canAccessTemplate, type AccessControlDb } from "./access-control";
import {
  CERTIFIED_STATUS,
  DEACTIVATED_STATUS,
} from "@/lib/auth/coach-status";
import { getAccessPolicyVersion } from "@/lib/auth/access-policy-version";

// ────────────────────────────────────────────────────────────────────────
// Public types
// ────────────────────────────────────────────────────────────────────────

export interface TransferOwnershipRequest {
  /** Organization whose owner is being transferred. */
  organizationId: string;
  /** Coach receiving ownership. Must be ACTIVE (not PENDING/DEACTIVATED). */
  newOwnerCoachId: string;
  /** Admin user performing the transfer (audit trail). */
  performedByUserId: string;
  /**
   * Defaults to true. When true, ALL campaigns (ACTIVE/DRAFT/CLOSED)
   * transfer to the new owner. When false, only ACTIVE/DRAFT cascade;
   * CLOSED retain `createdByCoachId = oldOwnerCoachId` and require
   * `retainedClosedCampaignsAcknowledged=true`.
   */
  includeClosedCampaigns?: boolean;
  /**
   * Required to be `true` if `includeClosedCampaigns=false` AND the org has
   * any CLOSED campaigns. Acknowledges the retained-read exception per
   * Round 3 M-7.
   */
  retainedClosedCampaignsAcknowledged?: boolean;
  /** Optional admin-supplied notes. Stored in the OrganizationOwnershipEvent.notes column. */
  notes?: string;
}

export interface TransferOwnershipResult {
  organizationId: string;
  oldOwnerCoachId: string;
  newOwnerCoachId: string;
  /** Campaign IDs whose createdByCoachId was updated to the new owner. */
  campaignsCascaded: string[];
  /** Campaign IDs whose createdByCoachId remained with the old owner. */
  closedCampaignsRetained: string[];
  /** OrganizationOwnershipEvent.id values written by this call. */
  eventIds: string[];
}

// ────────────────────────────────────────────────────────────────────────
// Minimal tx interface — narrow to the delegates this function touches.
// Re-uses `AccessControlDb` for the canAccessTemplate dependency.
// ────────────────────────────────────────────────────────────────────────

export interface TransferOwnershipTx extends AccessControlDb {
  $executeRaw: (
    template: TemplateStringsArray | string,
    ...values: unknown[]
  ) => Promise<number>;
  organization: AccessControlDb["organization"] & {
    update: (args: {
      where: { id: string };
      data: { ownerCoachId: string };
    }) => Promise<{ id: string; ownerCoachId: string }>;
  };
  assessmentCampaign: AccessControlDb["assessmentCampaign"] & {
    findMany: (args: {
      where?: {
        organizationId?: string;
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
    update: (args: {
      where: { id: string };
      data: { createdByCoachId: string };
    }) => Promise<{ id: string; createdByCoachId: string | null }>;
  };
  organizationOwnershipEvent: {
    create: (args: {
      data: {
        organizationId: string;
        kind: string;
        oldOwnerCoachId: string | null;
        newOwnerCoachId: string | null;
        campaignId: string | null;
        performedBy: string;
        notes: string | null;
      };
    }) => Promise<{ id: string }>;
  };
  auditLog: {
    create: (args: {
      data: Record<string, unknown>;
    }) => Promise<{ id: string } & Record<string, unknown>>;
  };
}

// ────────────────────────────────────────────────────────────────────────
// Admin-actor used internally when re-checking template access on the new
// owner. canAccessTemplate's coach branch needs a COACH actor — we
// construct one bound to the new owner's coachId. We never call this with
// an admin actor (which would short-circuit to true and bypass the gate).
// ────────────────────────────────────────────────────────────────────────

function coachActor(coachId: string) {
  return {
    userId: `coach-actor:${coachId}`,
    email: `coach-actor:${coachId}`,
    role: "COACH" as const,
    coachId,
  };
}

// ────────────────────────────────────────────────────────────────────────
// Public function
// ────────────────────────────────────────────────────────────────────────

export async function transferOrganizationOwnership(
  tx: TransferOwnershipTx,
  request: TransferOwnershipRequest,
): Promise<TransferOwnershipResult> {
  const includeClosed = request.includeClosedCampaigns ?? true;

  // ── Step 1: acquire advisory locks in sorted-alphabetical key order ──
  // Keys: `access-change:<newOwner>` and `org-transfer:<org>`. We sort the
  // full strings (including namespace prefix) so concurrent operations
  // touching the same keys converge on the same acquisition order and
  // can never deadlock.
  const lockKeys = [
    `access-change:${request.newOwnerCoachId}`,
    `org-transfer:${request.organizationId}`,
  ].sort();
  for (const key of lockKeys) {
    await tx.$executeRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${key}))`,
    );
  }

  // ── Step 2: SELECT FOR UPDATE on the Organization row ──
  // Lock the row before reading any mutable state so concurrent writers
  // serialize. We then re-read via the typed delegate for the columns.
  await tx.$executeRaw(
    Prisma.sql`SELECT id FROM organizations WHERE id = ${request.organizationId} FOR UPDATE`,
  );

  const org = await tx.organization.findUnique({
    where: { id: request.organizationId },
  });
  if (!org) {
    throw new Error(
      `Organization not found: ${request.organizationId}`,
    );
  }
  const oldOwnerCoachId = org.ownerCoachId;

  // ── Step 3: verify new owner exists, is certified, not deactivated ──
  const newOwner = await tx.coach.findUnique({
    where: { id: request.newOwnerCoachId },
  });
  if (!newOwner) {
    throw new OwnershipTransferError(
      "NEW_OWNER_NOT_CERTIFIED",
      { newOwnerCoachId: request.newOwnerCoachId, reason: "NOT_FOUND" },
      "New owner coach not found",
    );
  }
  if (newOwner.certificationStatus === DEACTIVATED_STATUS) {
    throw new OwnershipTransferError(
      "NEW_OWNER_NOT_CERTIFIED",
      {
        newOwnerCoachId: request.newOwnerCoachId,
        certificationStatus: newOwner.certificationStatus,
        reason: "DEACTIVATED",
      },
      "New owner coach is deactivated",
    );
  }
  if (newOwner.certificationStatus !== CERTIFIED_STATUS) {
    throw new OwnershipTransferError(
      "NEW_OWNER_NOT_CERTIFIED",
      {
        newOwnerCoachId: request.newOwnerCoachId,
        certificationStatus: newOwner.certificationStatus,
      },
      "New owner coach is not certified (certificationStatus must be ACTIVE)",
    );
  }

  // ── Step 4: lock + read the org's campaigns ──
  await tx.$executeRaw(
    Prisma.sql`SELECT id FROM assessment_campaigns WHERE "organizationId" = ${request.organizationId} FOR UPDATE`,
  );

  const allCampaigns = await tx.assessmentCampaign.findMany({
    where: { organizationId: request.organizationId },
  });

  const activeOrDraftCampaigns = allCampaigns.filter(
    (c) => c.status === "ACTIVE" || c.status === "DRAFT",
  );
  const closedCampaigns = allCampaigns.filter((c) => c.status === "CLOSED");

  // ── Step 5: retained-closed acknowledgment gate ──
  if (
    !includeClosed &&
    closedCampaigns.length > 0 &&
    request.retainedClosedCampaignsAcknowledged !== true
  ) {
    throw new OwnershipTransferError(
      "RETAINED_CLOSED_NOT_ACKNOWLEDGED",
      {
        organizationId: request.organizationId,
        count: closedCampaigns.length,
        campaignIds: closedCampaigns.map((c) => c.id),
      },
      "includeClosedCampaigns=false requires retainedClosedCampaignsAcknowledged=true when CLOSED campaigns exist",
    );
  }

  // ── Step 6: verify new owner has template access for each campaign
  //         in the transfer set. Per spec: ACTIVE/DRAFT always; CLOSED
  //         only when includeClosedCampaigns=true. ──
  const campaignsToTransfer = includeClosed
    ? allCampaigns
    : activeOrDraftCampaigns;

  const templateIds = Array.from(
    new Set(campaignsToTransfer.map((c) => c.templateId)),
  );

  const newOwnerActor = coachActor(request.newOwnerCoachId);
  const failedTemplateIds: string[] = [];
  for (const templateId of templateIds) {
    const ok = await canAccessTemplate(tx, newOwnerActor, templateId);
    if (!ok) failedTemplateIds.push(templateId);
  }
  if (failedTemplateIds.length > 0) {
    throw new OwnershipTransferError(
      "NEW_OWNER_NO_TEMPLATE_ACCESS",
      {
        newOwnerCoachId: request.newOwnerCoachId,
        templateIds: failedTemplateIds,
      },
      "New owner lacks template access for one or more campaigns",
    );
  }

  // ── Step 7: mutations — update Organization.ownerCoachId, then
  //         cascade campaign ownership per the transfer set. ──
  await tx.organization.update({
    where: { id: request.organizationId },
    data: { ownerCoachId: request.newOwnerCoachId },
  });

  const campaignsCascaded: string[] = [];
  for (const c of campaignsToTransfer) {
    await tx.assessmentCampaign.update({
      where: { id: c.id },
      data: { createdByCoachId: request.newOwnerCoachId },
    });
    campaignsCascaded.push(c.id);
  }

  const closedCampaignsRetained: string[] = includeClosed
    ? []
    : closedCampaigns.map((c) => c.id);

  // ── Step 8: write OrganizationOwnershipEvent row(s) ──
  const eventIds: string[] = [];
  const transferEvent = await tx.organizationOwnershipEvent.create({
    data: {
      organizationId: request.organizationId,
      kind: "TRANSFERRED",
      oldOwnerCoachId,
      newOwnerCoachId: request.newOwnerCoachId,
      campaignId: null,
      performedBy: request.performedByUserId,
      notes: request.notes ?? null,
    },
  });
  eventIds.push(transferEvent.id);

  if (!includeClosed) {
    for (const c of closedCampaigns) {
      const retainEvent = await tx.organizationOwnershipEvent.create({
        data: {
          organizationId: request.organizationId,
          kind: "RETAINED_CLOSED_CAMPAIGN",
          oldOwnerCoachId: c.createdByCoachId,
          newOwnerCoachId: null,
          campaignId: c.id,
          performedBy: request.performedByUserId,
          notes:
            "Closed campaign retained with prior owner per admin acknowledgment",
        },
      });
      eventIds.push(retainEvent.id);
    }
  }

  // ── Step 9: audit log rows (transactional — no swallowing wrapper) ──
  const policyVersion = getAccessPolicyVersion();

  await tx.auditLog.create({
    data: {
      entityType: "Organization",
      entityId: request.organizationId,
      action: "TRANSFERRED",
      performedBy: request.performedByUserId,
      changes: JSON.stringify({
        oldOwnerCoachId,
        newOwnerCoachId: request.newOwnerCoachId,
        includeClosedCampaigns: includeClosed,
        campaignsCascaded,
        closedCampaignsRetained,
        notes: request.notes ?? null,
        policyVersion,
      }),
    },
  });

  for (const campaignId of campaignsCascaded) {
    await tx.auditLog.create({
      data: {
        entityType: "AssessmentCampaign",
        entityId: campaignId,
        action: "TRANSFERRED",
        performedBy: request.performedByUserId,
        changes: JSON.stringify({
          organizationId: request.organizationId,
          oldOwnerCoachId,
          newOwnerCoachId: request.newOwnerCoachId,
          policyVersion,
        }),
      },
    });
  }

  return {
    organizationId: request.organizationId,
    oldOwnerCoachId,
    newOwnerCoachId: request.newOwnerCoachId,
    campaignsCascaded,
    closedCampaignsRetained,
    eventIds,
  };
}
