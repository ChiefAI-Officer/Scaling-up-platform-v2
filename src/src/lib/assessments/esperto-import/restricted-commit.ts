/**
 * Esperto historical import — Wave O RESTRICTED (SU-Full) commit (THE writer).
 *
 * Spec ref: docs/specs/v7.6/12-esperto-historical-import.md §4 (restricted
 * shape), §7 (crosswalk lock gate); Wave O — per-round SU-Full historical
 * import; ADR-0016/0017 (recompute-not-store, coach-operated).
 *
 * `commitRestrictedImport(db, plan, ctx, actor)` takes the PURE
 * `RestrictedImportPlan` produced by `buildRestrictedImportPlan` (restricted-
 * plan.ts) and performs the actual Prisma writes: create-or-reuse the single
 * round campaign, upsert invitation (born SUBMITTED) + create submission per
 * resolved respondent, pin the org's `espertoSuFullCid` provenance, and write
 * an audit row — ALL inside one `db.$transaction`. This mirrors the QSP-path
 * commit layer (results-commit.ts) in spirit (transaction shape, invitation/
 * submission chain, scoring call, in-tx audit) but adds the restricted-import-
 * specific safety gates the plan alone cannot enforce:
 *
 *   - entitlement re-check INSIDE the tx (R2-M1) — closest to the write.
 *   - org cid provenance pin + mismatch refusal (R2-M3) — a batch whose cid
 *     doesn't match the org's previously-pinned cid is a wrong-org signal.
 *   - low-resolution-batch refusal (R2-M3) — most of the batch unresolved
 *     against the target roster is ALSO a wrong-org signal; requires an
 *     explicit coach ack to proceed.
 *   - version-changed-since-preview refusal — the published version must not
 *     have changed between preview and commit.
 *   - exact / superset / divergent reuse classification on re-import (R2-M2)
 *     — a re-run of the SAME round either no-ops (identical), appends
 *     (strictly new respondents only), or refuses (any existing respondent's
 *     answers changed or disappeared — never silently overwritten).
 *   - P2002 race fallback (R2-M2) — a concurrent commit on the same
 *     externalId becomes a reuse, not a 500.
 *
 * SAFETY INVARIANTS (mirrors results-commit.ts's S1):
 *   - Insert / create-only upsert / update-only (no delete/deleteMany/
 *     updateMany) on any row.
 *   - Imported invitations are born `status:"SUBMITTED"`; no email-send path.
 *   - `scoreSubmission` is called with `{allowMissingRequired:true}`.
 *   - Audit `changes` JSON carries NO raw mid/reportid/email — counts/ids/
 *     hashes only.
 */

import type {
  RestrictedImportPlan,
  RestrictedRow,
} from "./restricted-plan";
import {
  importInvitationTokenHash,
  slugifyForAlias,
} from "./results-commit";
import { canCreateCampaign, asAccessDb } from "../access-control";
import { scoreSubmission } from "../scoring";
import type { TemplateVersionForScoring, Answer } from "../scoring";
import type { ApiActor } from "@/lib/auth/access-control";

// ────────────────────────────────────────────────────────────────────────
// Public types
// ────────────────────────────────────────────────────────────────────────

/** Narrow campaign row shape returned by `assessmentCampaign.findUnique`. */
export interface RestrictedExistingCampaignRow {
  id: string;
  organizationId: string;
  templateId: string;
  versionId: string;
  importManifest: unknown;
}

export interface RestrictedCommitDb {
  organization: {
    findUnique(args: {
      where: { id: string };
      select?: object;
    }): Promise<{ id: string; espertoSuFullCid: string | null } | null>;
    update(args: {
      where: { id: string };
      data: { espertoSuFullCid: string };
    }): Promise<unknown>;
  };
  assessmentCampaign: {
    findUnique(args: {
      where: { externalId: string };
      select?: object;
    }): Promise<RestrictedExistingCampaignRow | null>;
    create(args: { data: object }): Promise<{ id: string }>;
    update(args: { where: { id: string }; data: object }): Promise<unknown>;
  };
  assessmentTemplateVersion: {
    findUnique(args: {
      where: { id: string };
      select?: object;
    }): Promise<{
      id: string;
      questions: unknown;
      sections: unknown;
      scoringConfig: unknown;
    } | null>;
  };
  assessmentInvitation: {
    upsert(args: {
      where: object;
      create: object;
      update: object;
      select?: object;
    }): Promise<{ id: string }>;
  };
  assessmentSubmission: {
    create(args: { data: object }): Promise<unknown>;
    aggregate(args: {
      where: object;
      _min: object;
      _max: object;
    }): Promise<{ _min: { submittedAt: Date | null }; _max: { submittedAt: Date | null } }>;
  };
  auditLog: {
    create(args: { data: object }): Promise<unknown>;
  };
  /**
   * Acquires a Postgres transaction-scoped advisory lock keyed by an arbitrary
   * string (the caller hashes/passes it through as-is; the real implementation
   * hashes it into the lock's numeric key), held for the remainder of THIS
   * transaction and released automatically at commit/rollback. Serializes
   * concurrent commits for the SAME round (R3-M1) — closes the R2-M2 race
   * where two simultaneous commits for the same campaign externalId could
   * otherwise both read a stale `existing` snapshot before either writes.
   * Two DIFFERENT round keys never contend. The real Prisma-backed
   * implementation runs `SELECT pg_advisory_xact_lock(hashtext($1))`; a fake
   * test DB may no-op since Jest already runs each test synchronously.
   */
  acquireRoundLock(key: string): Promise<void>;
  $transaction<T>(fn: (tx: RestrictedCommitDb) => Promise<T>): Promise<T>;
}

export interface RestrictedCommitCtx {
  templateId: string;
  organizationId: string;
  ownerCoachId: string | null;
  language: string;
  /** The acting admin/coach's User id → campaign.createdBy (new-campaign path only). */
  createdByUserId: string;
  /** Resolved by the ROUTE at PREVIEW time — the latest-published version id, used ONLY when creating a brand-new campaign. */
  previewResolvedVersionId: string;
  /** Re-resolved by the ROUTE at COMMIT time (fresh lookup). Must equal previewResolvedVersionId or commit rejects. */
  commitResolvedVersionId: string;
  /** Scoring shape for previewResolvedVersionId — used ONLY when creating a new campaign. */
  versionForScoringForNewCampaign: TemplateVersionForScoring;
  /** Coach has explicitly acknowledged a low-resolution batch shown at preview. Default false. */
  ackLowResolution?: boolean;
  /** Fraction of unresolved files above which the batch is "low resolution" and blocked absent ack. Default 0.5. */
  lowResolutionThreshold?: number;
}

export type RestrictedCommitOutcome =
  | { kind: "created"; campaignId: string; submissionsCreated: number }
  | { kind: "reused-noop"; campaignId: string }
  | { kind: "reused-appended"; campaignId: string; submissionsCreated: number };

export class RestrictedCommitError extends Error {
  constructor(
    public readonly code:
      | "plan-blocked"
      | "entitlement-denied"
      | "org-not-found"
      | "cid-mismatch"
      | "low-resolution-batch"
      | "version-changed-since-preview"
      | "divergent-reimport"
      | "externalId-conflict",
    message?: string,
    public readonly details: Record<string, unknown> = {},
  ) {
    super(message ?? code);
    this.name = "RestrictedCommitError";
    Object.setPrototypeOf(this, RestrictedCommitError.prototype);
  }
}

// ────────────────────────────────────────────────────────────────────────
// Internal manifest shape helpers
// ────────────────────────────────────────────────────────────────────────

interface ManifestRespondent {
  saltedMidHash: string;
  saltedReportIdHash: string;
  answerHash: string;
}

interface PersistedManifest {
  cid?: string;
  roundLabel?: string;
  roundLabelSlug?: string;
  versionCrosswalkAlias?: string;
  batchFingerprint?: string;
  respondents: ManifestRespondent[];
  skippedCount?: number;
  versionId?: string;
  [key: string]: unknown;
}

/** Defensively parse a persisted `importManifest` JSON value into our shape. */
function parsePersistedManifest(raw: unknown): PersistedManifest {
  if (raw && typeof raw === "object" && Array.isArray((raw as { respondents?: unknown }).respondents)) {
    return raw as PersistedManifest;
  }
  return { respondents: [] };
}

/** Zip a `RestrictedImportPlan`'s campaign rows with their manifest entries by index (see restricted-plan.ts invariant). */
function zipRowsWithManifest(
  rows: RestrictedRow[],
  manifestRespondents: ManifestRespondent[],
): { row: RestrictedRow; saltedMidHash: string; answerHash: string }[] {
  return rows.map((row, i) => ({
    row,
    saltedMidHash: manifestRespondents[i]?.saltedMidHash ?? "",
    answerHash: manifestRespondents[i]?.answerHash ?? row.answerHash,
  }));
}

/** Build a `TemplateVersionForScoring` shape from a persisted AssessmentTemplateVersion row's JSON columns. */
function versionForScoringFromRow(row: {
  questions: unknown;
  sections: unknown;
  scoringConfig: unknown;
}): TemplateVersionForScoring {
  return {
    questions: row.questions,
    sections: row.sections,
    scoringConfig: row.scoringConfig,
  } as unknown as TemplateVersionForScoring;
}

/** Recompute openAt/closeAt for a campaign via a DB-level aggregate over ALL persisted submissions (R2-M2). */
async function recomputeOpenClose(
  tx: RestrictedCommitDb,
  campaignId: string,
): Promise<{ openAt: Date; closeAt: Date }> {
  const agg = await tx.assessmentSubmission.aggregate({
    where: { campaignId },
    _min: { submittedAt: true },
    _max: { submittedAt: true },
  });
  const openAt = agg._min.submittedAt ?? new Date();
  const closeAt = agg._max.submittedAt ?? openAt;
  await tx.assessmentCampaign.update({
    where: { id: campaignId },
    data: { openAt, closeAt },
  });
  return { openAt, closeAt };
}

/** Upsert one invitation (born SUBMITTED) + create its submission, scored against `versionForScoring`. */
async function writeInvitationAndSubmission(
  tx: RestrictedCommitDb,
  campaignId: string,
  externalId: string,
  row: RestrictedRow,
  versionForScoring: TemplateVersionForScoring,
): Promise<void> {
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
      tokenHash: importInvitationTokenHash(externalId, row.respondentId),
      status: "SUBMITTED",
      expiresAt: new Date(row.submittedAt),
      sentAt: new Date(row.submittedAt),
      submittedAt: new Date(row.submittedAt),
    },
    update: {},
    select: { id: true },
  });

  const answers: Answer[] = row.answers.map((a) => ({
    stableKey: a.stableKey,
    value: a.value,
  }));
  const scoreResult = scoreSubmission(versionForScoring, answers, {
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
}

/** Redacted audit `changes` payload — counts/ids/aliases/hashes only, NEVER raw mid/reportid/email. */
function auditChanges(input: {
  externalId: string;
  campaignAction: "create" | "append";
  cid: string;
  roundLabelSlug: string;
  versionId: string;
  crosswalkAlias: string;
  submissionsCreated: number;
  skippedCount: number;
}): string {
  return JSON.stringify({
    externalId: input.externalId,
    campaignAction: input.campaignAction,
    cid: input.cid,
    roundLabelSlug: input.roundLabelSlug,
    versionId: input.versionId,
    crosswalkAlias: input.crosswalkAlias,
    submissionsCreated: input.submissionsCreated,
    skippedCount: input.skippedCount,
    source: "esperto-restricted-sufull",
  });
}

// ────────────────────────────────────────────────────────────────────────
// commitRestrictedImport
// ────────────────────────────────────────────────────────────────────────

export async function commitRestrictedImport(
  db: RestrictedCommitDb,
  plan: RestrictedImportPlan,
  ctx: RestrictedCommitCtx,
  actor: ApiActor,
): Promise<RestrictedCommitOutcome> {
  // ── Pre-transaction checks (cheap, no writes) ───────────────────────────

  if (plan.blocks.length > 0 || plan.campaign === null || plan.manifest === null) {
    throw new RestrictedCommitError(
      "plan-blocked",
      `Plan has ${plan.blocks.length} blocking error(s) or a null campaign/manifest; refusing to commit.`,
    );
  }

  if (ctx.previewResolvedVersionId !== ctx.commitResolvedVersionId) {
    throw new RestrictedCommitError(
      "version-changed-since-preview",
      "The published SU-Full version changed between preview and commit; re-preview before committing.",
    );
  }

  const campaign = plan.campaign;
  const manifest = plan.manifest;

  const totalFiles = campaign.rows.length + plan.skips.length;
  const unresolvedCount = plan.skips.filter(
    (s) => s.reason === "unresolved-respondent",
  ).length;
  const lowResolutionThreshold = ctx.lowResolutionThreshold ?? 0.5;
  if (
    totalFiles > 0 &&
    unresolvedCount / totalFiles > lowResolutionThreshold &&
    !ctx.ackLowResolution
  ) {
    throw new RestrictedCommitError(
      "low-resolution-batch",
      "Most of this batch's respondents were not found in the target org's roster — this looks like a wrong-org import. Acknowledge to proceed anyway.",
      { unresolvedCount, totalFiles },
    );
  }

  // ── Everything else runs inside ONE transaction. ────────────────────────

  return db.$transaction(async (tx) => {
    // 0. Serialize concurrent commits for THIS round (R3-M1) — must be the
    //    very first statement, before any read, so a racing transaction
    //    blocks here rather than reading a stale `existing` snapshot.
    await tx.acquireRoundLock(campaign.externalId);

    // 1. Entitlement re-check — closest to the write, against tx (R2-M1).
    const entitled = await canCreateCampaign(
      asAccessDb(tx),
      actor,
      ctx.templateId,
    );
    if (!entitled) {
      throw new RestrictedCommitError(
        "entitlement-denied",
        "Actor is not entitled to create a campaign for this template.",
      );
    }

    // 2. Org lookup + cid provenance (R2-M3).
    const org = await tx.organization.findUnique({
      where: { id: ctx.organizationId },
      select: { id: true, espertoSuFullCid: true },
    });
    if (!org) {
      throw new RestrictedCommitError(
        "org-not-found",
        "Target organization does not exist.",
      );
    }
    if (
      org.espertoSuFullCid !== null &&
      org.espertoSuFullCid !== campaign.cid
    ) {
      throw new RestrictedCommitError(
        "cid-mismatch",
        "This batch's cid does not match the cid already pinned on the target organization.",
      );
    }
    const shouldPinCid = org.espertoSuFullCid === null;

    // 3. Reuse-or-create decision.
    const existing = await tx.assessmentCampaign.findUnique({
      where: { externalId: campaign.externalId },
      select: {
        id: true,
        organizationId: true,
        templateId: true,
        versionId: true,
        importManifest: true,
      },
    });

    if (existing) {
      if (
        existing.organizationId !== ctx.organizationId ||
        existing.templateId !== ctx.templateId
      ) {
        throw new RestrictedCommitError(
          "externalId-conflict",
          `Campaign ${campaign.externalId} exists but belongs to a different org/template.`,
        );
      }
      return commitReusePath(tx, existing, campaign, manifest, ctx, actor, shouldPinCid);
    }

    // CREATE PATH — but a concurrent commit racing on the same externalId
    // (P2002) falls through to the reuse path instead of throwing (R2-M2).
    try {
      return await commitCreatePath(tx, campaign, manifest, ctx, actor, shouldPinCid);
    } catch (err) {
      if (isP2002(err)) {
        const raced = await tx.assessmentCampaign.findUnique({
          where: { externalId: campaign.externalId },
          select: {
            id: true,
            organizationId: true,
            templateId: true,
            versionId: true,
            importManifest: true,
          },
        });
        if (
          raced &&
          raced.organizationId === ctx.organizationId &&
          raced.templateId === ctx.templateId
        ) {
          return commitReusePath(tx, raced, campaign, manifest, ctx, actor, shouldPinCid);
        }
        if (raced) {
          throw new RestrictedCommitError(
            "externalId-conflict",
            `Campaign ${campaign.externalId} exists but belongs to a different org/template.`,
          );
        }
      }
      throw err;
    }
  });
}

function isP2002(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { code?: string }).code === "P2002"
  );
}

// ────────────────────────────────────────────────────────────────────────
// CREATE PATH
// ────────────────────────────────────────────────────────────────────────

async function commitCreatePath(
  tx: RestrictedCommitDb,
  campaign: NonNullable<RestrictedImportPlan["campaign"]>,
  manifest: NonNullable<RestrictedImportPlan["manifest"]>,
  ctx: RestrictedCommitCtx,
  actor: ApiActor,
  shouldPinCid: boolean,
): Promise<RestrictedCommitOutcome> {
  const alias = `imported-sufull-${slugifyForAlias(campaign.cid)}-${campaign.roundLabelSlug}`;

  const created = await tx.assessmentCampaign.create({
    data: {
      templateId: ctx.templateId,
      versionId: ctx.previewResolvedVersionId,
      organizationId: ctx.organizationId,
      language: ctx.language,
      alias,
      externalId: campaign.externalId,
      name: campaign.name,
      status: "CLOSED",
      accessMode: "INVITED",
      endMode: "OPEN_END",
      openAt: new Date(campaign.openAt),
      closeAt: new Date(campaign.closeAt),
      createdBy: ctx.createdByUserId,
      createdByCoachId: ctx.ownerCoachId,
      importManifest: {
        ...manifest,
        versionId: ctx.previewResolvedVersionId,
      } as unknown as object,
    },
  });
  const campaignId = created.id;

  for (const row of campaign.rows) {
    await writeInvitationAndSubmission(
      tx,
      campaignId,
      campaign.externalId,
      row,
      ctx.versionForScoringForNewCampaign,
    );
  }

  await recomputeOpenClose(tx, campaignId);

  if (shouldPinCid) {
    await tx.organization.update({
      where: { id: ctx.organizationId },
      data: { espertoSuFullCid: campaign.cid },
    });
  }

  await tx.auditLog.create({
    data: {
      entityType: "AssessmentCampaign",
      entityId: campaignId,
      action: "IMPORT_CREATE",
      performedBy: actor.email,
      changes: auditChanges({
        externalId: campaign.externalId,
        campaignAction: "create",
        cid: campaign.cid,
        roundLabelSlug: campaign.roundLabelSlug,
        versionId: ctx.previewResolvedVersionId,
        crosswalkAlias: manifest.versionCrosswalkAlias,
        submissionsCreated: campaign.rows.length,
        skippedCount: manifest.skippedCount,
      }),
    },
  });

  return {
    kind: "created",
    campaignId,
    submissionsCreated: campaign.rows.length,
  };
}

// ────────────────────────────────────────────────────────────────────────
// REUSE PATH (exact no-op / superset append / divergent refusal)
// ────────────────────────────────────────────────────────────────────────

async function commitReusePath(
  tx: RestrictedCommitDb,
  existing: RestrictedExistingCampaignRow,
  campaign: NonNullable<RestrictedImportPlan["campaign"]>,
  manifest: NonNullable<RestrictedImportPlan["manifest"]>,
  ctx: RestrictedCommitCtx,
  actor: ApiActor,
  shouldPinCid: boolean,
): Promise<RestrictedCommitOutcome> {
  const persisted = parsePersistedManifest(existing.importManifest);
  const oldByMidHash = new Map<string, string>();
  for (const r of persisted.respondents) {
    oldByMidHash.set(r.saltedMidHash, r.answerHash);
  }

  const newEntries = zipRowsWithManifest(campaign.rows, manifest.respondents);

  const changedMids = newEntries.filter(
    (e) =>
      oldByMidHash.has(e.saltedMidHash) &&
      oldByMidHash.get(e.saltedMidHash) !== e.answerHash,
  );
  const newSaltedMidHashes = new Set(newEntries.map((e) => e.saltedMidHash));
  const missingFromNew = persisted.respondents.filter(
    (r) => !newSaltedMidHashes.has(r.saltedMidHash),
  );
  const newOnly = newEntries.filter((e) => !oldByMidHash.has(e.saltedMidHash));

  if (changedMids.length > 0 || missingFromNew.length > 0) {
    throw new RestrictedCommitError(
      "divergent-reimport",
      "This round was previously imported and the new batch diverges (changed or missing respondents) — refusing to silently overwrite history.",
      { changedCount: changedMids.length, missingCount: missingFromNew.length },
    );
  }

  if (newOnly.length === 0) {
    // Exact reuse — a TRUE no-op. No writes at all.
    return { kind: "reused-noop", campaignId: existing.id };
  }

  // SUPERSET APPEND — score new respondents against the EXISTING campaign's
  // OWN pinned version (R3-H2), never ctx.versionForScoringForNewCampaign.
  const versionRow = await tx.assessmentTemplateVersion.findUnique({
    where: { id: existing.versionId },
    select: { id: true, questions: true, sections: true, scoringConfig: true },
  });
  if (!versionRow) {
    throw new RestrictedCommitError(
      "version-changed-since-preview",
      "The existing campaign's pinned version could not be resolved.",
    );
  }
  const versionForScoring = versionForScoringFromRow(versionRow);

  for (const entry of newOnly) {
    await writeInvitationAndSubmission(
      tx,
      existing.id,
      campaign.externalId,
      entry.row,
      versionForScoring,
    );
  }

  await recomputeOpenClose(tx, existing.id);

  const mergedByHash = new Map<string, ManifestRespondent>();
  for (const r of persisted.respondents) mergedByHash.set(r.saltedMidHash, r);
  for (const r of manifest.respondents) mergedByHash.set(r.saltedMidHash, r);
  const mergedRespondents = Array.from(mergedByHash.values());

  await tx.assessmentCampaign.update({
    where: { id: existing.id },
    data: {
      importManifest: {
        ...manifest,
        respondents: mergedRespondents,
        skippedCount: manifest.skippedCount,
        versionId: existing.versionId,
      } as unknown as object,
    },
  });

  if (shouldPinCid) {
    await tx.organization.update({
      where: { id: ctx.organizationId },
      data: { espertoSuFullCid: campaign.cid },
    });
  }

  await tx.auditLog.create({
    data: {
      entityType: "AssessmentCampaign",
      entityId: existing.id,
      action: "IMPORT_APPEND",
      performedBy: actor.email,
      changes: auditChanges({
        externalId: campaign.externalId,
        campaignAction: "append",
        cid: campaign.cid,
        roundLabelSlug: campaign.roundLabelSlug,
        versionId: existing.versionId,
        crosswalkAlias: manifest.versionCrosswalkAlias,
        submissionsCreated: newOnly.length,
        skippedCount: manifest.skippedCount,
      }),
    },
  });

  return {
    kind: "reused-appended",
    campaignId: existing.id,
    submissionsCreated: newOnly.length,
  };
}
