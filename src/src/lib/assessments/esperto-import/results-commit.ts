/**
 * Esperto historical import — Phase 2 RESULTS commit (THE only DB writer).
 *
 * Spec ref: docs/specs/v7.6/12-esperto-historical-import.md §6.2–6.4; plan 12a
 * step 8, S1–S4, §19 (one all-or-nothing tx), §23 (audit inside the tx);
 * ADR-0006 (namespaced `esperto:<campaignid>` externalId is the upsert selector).
 *
 * `commitResultsImport(db, plan, ctx, actor)` applies a `ResultsImportPlan` —
 * one reconstructed CLOSED/INVITED campaign per distinct Esperto campaignid,
 * each with its participant → invitation (born SUBMITTED) → submission chain.
 * The PURE plan layer (results-plan.ts) already decided every row, skip, and
 * block; THIS is the single place that writes.
 *
 * Each campaign commits in ONE `db.$transaction` keyed by the campaign's unique
 * `externalId` — so no advisory lock is needed (unlike the roster commit, whose
 * org identity has no DB unique). The audit row is written via `tx.auditLog.create`
 * INSIDE the tx so a failed audit rolls the whole campaign back.
 *
 * SAFETY INVARIANTS (S1 — non-negotiable):
 *   - Insert / create-only upsert ONLY. NEVER delete / deleteMany / updateMany.
 *   - NO raw SQL (the campaign is keyed by its unique externalId).
 *   - Imported invitations are born `status:"SUBMITTED"` and the importer NEVER
 *     calls any email-send function — there is no send path in this module.
 *   - `scoreSubmission` is called with `{ allowMissingRequired: true }` so a real
 *     historical row missing a now-required answer imports partially rather than
 *     being discarded (§6.3) — we NEVER fabricate an answer.
 *   - Idempotent: re-running create-only upserts (participant + invitation by
 *     `@@unique([campaignId, respondentId])`, submission by `invitationId @unique`)
 *     never overwrites and never duplicates.
 *
 * externalId-conflict guard (greptile/R1 M5): if a campaign with the plan's
 * `externalId` already exists, it is reused ONLY when its `(organizationId,
 * templateId)` match the ctx — otherwise the importer refuses rather than write
 * a submission chain into an unrelated campaign that happens to share the marker.
 */

import { createHash } from "crypto";

import type { ResultsImportPlan } from "./results-plan";
import { isCEOFamily } from "../respondent-levels";
import { scoreSubmission } from "../scoring";
import type { TemplateVersionForScoring, Answer } from "../scoring";

// ────────────────────────────────────────────────────────────────────────
// Public types
// ────────────────────────────────────────────────────────────────────────

export interface ResultsCommitActor {
  userId: string;
  email: string;
}

/** Everything the commit needs that the plan does not carry. */
export interface ResultsCommitCtx {
  templateId: string;
  versionId: string;
  /** The pinned PUBLISHED version's scoring shape (passed to scoreSubmission). */
  versionForScoring: TemplateVersionForScoring;
  organizationId: string;
  /** Owner coach of the target org → campaign.createdByCoachId. */
  ownerCoachId: string | null;
  /** The pinned version's language (Esperto's enUS is ignored — §6.2). */
  language: string;
  /** The acting admin's User id → campaign.createdBy. */
  createdByUserId: string;
}

/** Per-campaign commit outcome. */
export interface ResultsCommitCampaignResult {
  externalId: string;
  campaignId: string;
  campaignAction: "create" | "reuse";
  participantsCreated: number;
  invitationsCreated: number;
  submissionsCreated: number;
  submissionsSkipped: number;
}

export interface ResultsCommitResult {
  campaigns: ResultsCommitCampaignResult[];
  /** Plan-level skips carried through for the operator summary. */
  skipped: number;
}

/**
 * Thrown when the plan carries blocks or the in-tx state diverges. Carries a
 * machine-readable `code` so the route can map it to a status.
 */
export class ResultsCommitError extends Error {
  constructor(
    public readonly code: "plan-blocked" | "externalId-conflict",
    message?: string,
  ) {
    super(message ?? code);
    this.name = "ResultsCommitError";
    Object.setPrototypeOf(this, ResultsCommitError.prototype);
  }
}

// ────────────────────────────────────────────────────────────────────────
// Minimal tx interface — narrow to the delegates this writer touches.
// (No delete/deleteMany/updateMany delegate is declared — they cannot be
//  called because they are not on the type; the tests assert it at runtime.)
// ────────────────────────────────────────────────────────────────────────

interface ExistingCampaignRow {
  id: string;
  organizationId: string;
  templateId: string;
}

interface ExistingRespondentRow {
  id: string;
  roleType: string | null;
}

interface IdRow {
  id: string;
}

export interface ResultsCommitTx {
  assessmentCampaign: {
    findUnique: (args: {
      where: { externalId: string };
      select: { id: true; organizationId: true; templateId: true };
    }) => Promise<ExistingCampaignRow | null>;
    findFirst: (args: {
      where: { alias: string };
      select: { id: true };
    }) => Promise<IdRow | null>;
    create: (args: { data: Record<string, unknown> }) => Promise<IdRow>;
  };
  orgRespondent: {
    findMany: (args: {
      where: { id: { in: string[] } };
      select: { id: true; roleType: true };
    }) => Promise<ExistingRespondentRow[]>;
  };
  assessmentCampaignParticipant: {
    upsert: (args: {
      where: { campaignId_respondentId: { campaignId: string; respondentId: string } };
      create: Record<string, unknown>;
      update: Record<string, unknown>;
    }) => Promise<IdRow>;
  };
  assessmentInvitation: {
    upsert: (args: {
      where: { campaignId_respondentId: { campaignId: string; respondentId: string } };
      create: Record<string, unknown>;
      update: Record<string, unknown>;
      select: { id: true };
    }) => Promise<IdRow>;
  };
  assessmentSubmission: {
    findUnique: (args: {
      where: { invitationId: string };
      select: { id: true };
    }) => Promise<IdRow | null>;
    create: (args: { data: Record<string, unknown> }) => Promise<IdRow>;
  };
  auditLog: {
    create: (args: { data: Record<string, unknown> }) => Promise<IdRow>;
  };
}

export interface ResultsCommitDb {
  $transaction: <T>(fn: (tx: ResultsCommitTx) => Promise<T>) => Promise<T>;
}

// ────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────

/**
 * Deterministic 64-char hex tokenHash for an imported invitation. Derived from
 * (campaignId, respondentId) so a re-run produces the SAME hash — but since the
 * invitation is upserted by `@@unique([campaignId, respondentId])` create-only,
 * the hash is only ever inserted once. Imported invitations are inert (status
 * SUBMITTED, no email), so this token is never used to authenticate anyone.
 */
export function importInvitationTokenHash(externalId: string, respondentId: string): string {
  return createHash("sha256")
    .update(`esperto-import\u0000${externalId}\u0000${respondentId}`)
    .digest("hex");
}

/** Slugify a string for use in a deterministic campaign alias. */
export function slugifyForAlias(s: string): string {
  return (
    s
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "x"
  );
}

// ────────────────────────────────────────────────────────────────────────
// commitResultsImport
// ────────────────────────────────────────────────────────────────────────

export async function commitResultsImport(
  db: ResultsCommitDb,
  plan: ResultsImportPlan,
  ctx: ResultsCommitCtx,
  actor: ResultsCommitActor,
): Promise<ResultsCommitResult> {
  // Fail BEFORE opening any tx if the plan is structurally invalid.
  if (plan.blocks.length > 0) {
    throw new ResultsCommitError(
      "plan-blocked",
      `Plan has ${plan.blocks.length} blocking error(s); refusing to commit.`,
    );
  }

  const campaignResults: ResultsCommitCampaignResult[] = [];

  for (const campaign of plan.campaigns) {
    // Each campaign is its own all-or-nothing transaction — keyed by the unique
    // externalId, so a re-run is idempotent and an unrelated campaign sharing
    // the marker is refused (no advisory lock needed).
    const result = await db.$transaction(async (tx) => {
      // ── 1. Upsert the campaign by externalId (manual, since the @unique on
      //    AssessmentCampaign.externalId is a partial index Prisma's `upsert`
      //    cannot target). Reuse only on (organizationId, templateId) match. ──
      const existing = await tx.assessmentCampaign.findUnique({
        where: { externalId: campaign.externalId },
        select: { id: true, organizationId: true, templateId: true },
      });

      let campaignId: string;
      let campaignAction: "create" | "reuse";
      if (existing) {
        if (
          existing.organizationId !== ctx.organizationId ||
          existing.templateId !== ctx.templateId
        ) {
          throw new ResultsCommitError(
            "externalId-conflict",
            `Campaign ${campaign.externalId} exists but belongs to a different org/template.`,
          );
        }
        campaignId = existing.id;
        campaignAction = "reuse";
      } else {
        // Deterministic alias; ensure uniqueness with a short hashed suffix on
        // collision (the alias column is @unique).
        const aliasBase = `imported-${slugifyForAlias(ctx.templateId)}-${slugifyForAlias(
          campaign.espertoCampaignId,
        )}`;
        let alias = aliasBase;
        const aliasClash = await tx.assessmentCampaign.findFirst({
          where: { alias },
          select: { id: true },
        });
        if (aliasClash) {
          const suffix = createHash("sha256")
            .update(campaign.externalId)
            .digest("hex")
            .slice(0, 6);
          alias = `${aliasBase}-${suffix}`;
        }

        const created = await tx.assessmentCampaign.create({
          data: {
            templateId: ctx.templateId,
            versionId: ctx.versionId,
            organizationId: ctx.organizationId,
            language: ctx.language,
            alias,
            externalId: campaign.externalId,
            name: campaign.name,
            status: "CLOSED",
            accessMode: "INVITED",
            endMode: "OPEN_END",
            openAt: new Date(campaign.openAt),
            closeAt: campaign.closeAt ? new Date(campaign.closeAt) : null,
            createdBy: ctx.createdByUserId,
            createdByCoachId: ctx.ownerCoachId,
          },
        });
        campaignId = created.id;
        campaignAction = "create";
      }

      // ── 2. Single-CEO guard: resolve roleType for the campaign's respondent
      //    ids; if EXACTLY ONE is CEO-family, that respondent is the CEO. 0 or
      //    >1 → no CEO (never silently first-wins under ambiguity). ──────────
      const respondentIds = campaign.rows.map((r) => r.respondentId);
      const roleRows =
        respondentIds.length > 0
          ? await tx.orgRespondent.findMany({
              where: { id: { in: respondentIds } },
              select: { id: true, roleType: true },
            })
          : [];
      const ceoFamilyIds = roleRows
        .filter((r) => isCEOFamily(r.roleType))
        .map((r) => r.id);
      const ceoRespondentId = ceoFamilyIds.length === 1 ? ceoFamilyIds[0] : null;

      let participantsCreated = 0;
      let invitationsCreated = 0;
      let submissionsCreated = 0;
      let submissionsSkipped = 0;

      // ── 3. Per-row chain: participant → invitation (SUBMITTED) → submission. ─
      const expiresAt = new Date(campaign.closeAt ?? campaign.openAt);
      const sentAt = new Date(campaign.openAt);

      for (const row of campaign.rows) {
        const isCEO = row.respondentId === ceoRespondentId;

        // 3a. Participant — create-only upsert (never overwrite an existing).
        await tx.assessmentCampaignParticipant.upsert({
          where: {
            campaignId_respondentId: {
              campaignId,
              respondentId: row.respondentId,
            },
          },
          create: {
            campaignId,
            respondentId: row.respondentId,
            isCEO,
            teamPathAtAdd: [],
            teamLabelsAtAdd: [],
          },
          update: {},
        });
        participantsCreated++;

        // 3b. Invitation — born SUBMITTED; create-only upsert. NO email send.
        const invitation = await tx.assessmentInvitation.upsert({
          where: {
            campaignId_respondentId: {
              campaignId,
              respondentId: row.respondentId,
            },
          },
          create: {
            campaignId,
            respondentId: row.respondentId,
            tokenHash: importInvitationTokenHash(
              campaign.externalId,
              row.respondentId,
            ),
            status: "SUBMITTED",
            expiresAt,
            sentAt,
            submittedAt: new Date(row.submittedAt),
          },
          update: {},
          select: { id: true },
        });
        invitationsCreated++;

        // 3c. Submission — create-only (idempotent by invitationId @unique).
        const existingSubmission = await tx.assessmentSubmission.findUnique({
          where: { invitationId: invitation.id },
          select: { id: true },
        });
        if (existingSubmission) {
          submissionsSkipped++;
          continue;
        }

        const answers: Answer[] = row.answers.map((a) => ({
          stableKey: a.stableKey,
          value: a.value,
        }));
        const scoreResult = scoreSubmission(ctx.versionForScoring, answers, {
          allowMissingRequired: true,
        });

        await tx.assessmentSubmission.create({
          data: {
            campaignId,
            respondentId: row.respondentId,
            invitationId: invitation.id,
            answers: answers as unknown as object,
            result: scoreResult as unknown as object,
            submittedAt: new Date(row.submittedAt),
          },
        });
        submissionsCreated++;
      }

      // ── 4. Audit (inside the tx — rolls back with a failed import). ────────
      await tx.auditLog.create({
        data: {
          entityType: "EspertoResultsImport",
          entityId: campaignId,
          action: "IMPORT",
          performedBy: actor.email,
          changes: JSON.stringify({
            externalId: campaign.externalId,
            campaignAction,
            participantsCreated,
            invitationsCreated,
            submissionsCreated,
            submissionsSkipped,
            source: "esperto-report",
          }),
        },
      });

      return {
        externalId: campaign.externalId,
        campaignId,
        campaignAction,
        participantsCreated,
        invitationsCreated,
        submissionsCreated,
        submissionsSkipped,
      } satisfies ResultsCommitCampaignResult;
    });

    campaignResults.push(result);
  }

  return {
    campaigns: campaignResults,
    skipped: plan.skips.length,
  };
}
