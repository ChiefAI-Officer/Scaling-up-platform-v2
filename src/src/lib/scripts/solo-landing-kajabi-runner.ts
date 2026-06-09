/**
 * solo-landing-kajabi-runner.ts
 *
 * DB-touching orchestration for the GLOBAL SOLO_LANDING Kajabi rollout, written
 * with DEPENDENCY INJECTION so it is unit-testable with a mocked Prisma client
 * and mocked interpolation/sanitize functions. The CLI wrappers
 * (scripts/update-solo-landing-template.ts, scripts/backfill-solo-landing-kajabi.ts)
 * wire the real Prisma client + the real lib pipeline into these runners.
 *
 * Every function here is pure-of-globals: all I/O (DB, fs, audit) is passed in.
 */

import {
  sha256,
  decideRow,
  validateNewValue,
  checkCtaPreflight,
  checkPricePreflight,
  hasCoachPhoto,
  toKajabiBackupEntry,
  checkTemplateCas,
  type KajabiRowPlan,
  type KajabiBackupFile,
  type KajabiBackupEntry,
  type TemplateUpdatePlan,
  type TemplateBackupFile,
  type SkipReason,
} from "@/lib/scripts/solo-landing-kajabi-core";

// ─── Injected dependency contracts (minimal Prisma surface) ──────────────────

export interface PageTemplateRow {
  id: string;
  categoryId: string | null;
  isActive: boolean;
  customHtml: string | null;
  updatedAt: Date;
}

export interface LandingPageRow {
  id: string;
  workshopId: string;
  slug: string;
  customHtml: string | null;
  updatedAt: Date;
  categoryId: string | null;
  sourceTemplateId: string | null;
}

/** Per-workshop facts the preflights need (resolved by the runner). */
export interface WorkshopFacts {
  /** coach.profileImage (for the coach-photo preflight). */
  coachProfileImage: string | null;
  /** Resolved registration URL embedded for this workshop. */
  registrationUrl: string;
  /** The REGISTRATION LandingPage slug (if one exists, regardless of status). */
  registrationSlug: string | null;
  /** Whether that REGISTRATION LandingPage is PUBLISHED. */
  registrationPublished: boolean;
  /** Rendered {{price}} for this workshop. */
  renderedPrice: string;
}

export interface DbClient {
  pageTemplate: {
    findMany(args: unknown): Promise<PageTemplateRow[]>;
    findUnique(args: unknown): Promise<PageTemplateRow | null>;
    updateMany(args: {
      where: { id: string; updatedAt: Date };
      data: { customHtml: string };
    }): Promise<{ count: number }>;
  };
  landingPage: {
    findMany(args: unknown): Promise<LandingPageRow[]>;
    findUnique(args: unknown): Promise<{ customHtml?: string | null; updatedAt?: Date } | null>;
    updateMany(args: {
      where: { id: string; updatedAt: Date };
      data: { customHtml: string };
    }): Promise<{ count: number }>;
    update(args: { where: { id: string }; data: { customHtml: string } }): Promise<unknown>;
  };
  auditLog: {
    create(args: { data: AuditCreateData }): Promise<unknown>;
  };
}

export interface AuditCreateData {
  entityType: string;
  entityId: string;
  action: string;
  performedBy: string;
  changes: string; // JSON
}

export interface SanitizeOutcome {
  sanitized: string;
  strippedTags: string[];
  strippedAttrs: string[];
}

/**
 * Re-interpolate ONE template's customHtml for ONE workshop via the exact
 * two-pass auto-build pipeline. Injected so tests can stub it without loading
 * buildWorkshopVariables / interpolate / sanitize. Returns null when the
 * workshop has no variables (not found).
 *
 * Fix 3 (P2): `registrationUrl` is now passed in by the runner so the
 * implementation can skip its own REGISTRATION lookup — avoids a duplicate
 * db.landingPage.findUnique per workshop (resolveFacts already fetched it).
 */
export type Reinterpolate = (
  workshopId: string,
  templateCustomHtml: string,
  registrationUrl: string,
) => Promise<SanitizeOutcome | null>;

/** Resolve the per-workshop preflight facts (DB-backed). Injected for tests. */
export type ResolveWorkshopFacts = (workshopId: string) => Promise<WorkshopFacts | null>;

// ════════════════════════════════════════════════════════════════════════════
//  Script 1 — guarded TEMPLATE update
// ════════════════════════════════════════════════════════════════════════════

export interface ResolveGlobalTemplateResult {
  template: PageTemplateRow;
}

/**
 * Locate the single global SOLO_LANDING PageTemplate: templateType=SOLO_LANDING,
 * categoryId null, isActive true. >1 match FAILS loudly (we never guess which
 * global template to overwrite). 0 active matches also fails.
 */
export async function resolveGlobalSoloTemplate(db: DbClient): Promise<PageTemplateRow> {
  const rows = await db.pageTemplate.findMany({
    where: { templateType: "SOLO_LANDING", categoryId: null, isActive: true },
    select: { id: true, categoryId: true, isActive: true, customHtml: true, updatedAt: true },
  });
  if (rows.length === 0) {
    throw new Error(
      "No active global SOLO_LANDING PageTemplate (templateType=SOLO_LANDING, categoryId=null, isActive=true) found.",
    );
  }
  if (rows.length > 1) {
    throw new Error(
      `Expected exactly ONE active global SOLO_LANDING PageTemplate, found ${rows.length}: ` +
        `${rows.map((r) => r.id).join(", ")}. Refusing to guess which to overwrite.`,
    );
  }
  return rows[0];
}

export interface BuildTemplatePlanInput {
  /** The sanitized NEW artifact (already run through sanitizeCustomHtml save-time). */
  newSanitized: string;
}

/** Build the template-update plan (pure-ish: only the global-template lookup is DB). */
export async function buildTemplateUpdatePlan(
  db: DbClient,
  input: BuildTemplatePlanInput,
): Promise<TemplateUpdatePlan> {
  const tpl = await resolveGlobalSoloTemplate(db);
  const oldCustomHtml = tpl.customHtml ?? "";
  const oldSha = sha256(oldCustomHtml);
  const newSha = sha256(input.newSanitized);
  return {
    templateId: tpl.id,
    oldSha,
    newSha,
    oldUpdatedAt: tpl.updatedAt,
    oldCustomHtml,
    newCustomHtml: input.newSanitized,
    isNoOp: oldSha === newSha,
  };
}

export interface ApplyTemplateDeps {
  /** Write the template backup; returns the file path. */
  writeBackup: (plan: TemplateUpdatePlan) => Promise<string>;
  operator: string;
  runId: string;
  /** Operator-supplied expected old SHA (optional — read-then-CAS if absent). */
  expectedOldSha?: string;
  /** Operator-supplied expected updatedAt (optional). */
  expectedUpdatedAt?: Date;
}

export interface ApplyTemplateResult {
  status: "applied" | "no-op" | "cas-abort";
  backupFile?: string;
  reason?: string;
}

/**
 * Apply the template update under CAS. Order: verify CAS against the captured
 * plan + any operator-supplied expectations → back up → conditional updateMany
 * (where id + updatedAt) → audit. A concurrent edit (count 0) is a clean abort
 * (no clobber, no partial state).
 */
export async function applyTemplateUpdate(
  db: DbClient,
  plan: TemplateUpdatePlan,
  deps: ApplyTemplateDeps,
): Promise<ApplyTemplateResult> {
  if (plan.isNoOp) {
    return { status: "no-op", reason: "template already on the new artifact (SHA match)" };
  }

  const cas = checkTemplateCas({
    liveUpdatedAt: plan.oldUpdatedAt,
    liveSha: plan.oldSha,
    expectedUpdatedAt: deps.expectedUpdatedAt,
    expectedOldSha: deps.expectedOldSha,
  });
  if (!cas.ok) {
    return { status: "cas-abort", reason: cas.reason };
  }

  const backupFile = await deps.writeBackup(plan);

  const res = await db.pageTemplate.updateMany({
    where: { id: plan.templateId, updatedAt: plan.oldUpdatedAt },
    data: { customHtml: plan.newCustomHtml },
  });
  if (res.count === 0) {
    return {
      status: "cas-abort",
      backupFile,
      reason: "CAS updateMany matched 0 rows — concurrent edit since plan was built.",
    };
  }

  await db.auditLog.create({
    data: {
      entityType: "PageTemplate",
      entityId: plan.templateId,
      action: "SOLO_LANDING_TEMPLATE_UPDATE",
      performedBy: deps.operator,
      changes: JSON.stringify({
        runId: deps.runId,
        oldSha: plan.oldSha,
        newSha: plan.newSha,
        backupFile,
      }),
    },
  });

  return { status: "applied", backupFile };
}

export interface RestoreTemplateResult {
  status: "restored" | "cas-abort" | "no-op";
  reason?: string;
}

/**
 * Restore the template from a template backup, CAS-guarded on the NEW sha we
 * wrote (so we never clobber a later legitimate edit). Audited.
 */
export async function restoreTemplateFromBackup(
  db: DbClient,
  backup: TemplateBackupFile,
  deps: { operator: string; runId: string },
): Promise<RestoreTemplateResult> {
  if (backup.kind !== "solo-landing-template-update") {
    throw new Error("Not a recognised template-update backup.");
  }
  const live = await db.pageTemplate.findUnique({
    where: { id: backup.templateId },
    select: { id: true, categoryId: true, isActive: true, customHtml: true, updatedAt: true },
  });
  if (!live) {
    return { status: "cas-abort", reason: "template row no longer exists." };
  }
  const liveSha = sha256(live.customHtml ?? "");
  if (liveSha === backup.oldSha) {
    return { status: "no-op", reason: "template already on the pre-update value." };
  }
  if (liveSha !== backup.newSha) {
    return {
      status: "cas-abort",
      reason:
        `live template SHA ${liveSha.slice(0, 12)}… is neither the value we wrote ` +
        `nor the pre-update value — refusing to clobber a later edit.`,
    };
  }

  const res = await db.pageTemplate.updateMany({
    where: { id: backup.templateId, updatedAt: live.updatedAt },
    data: { customHtml: backup.oldCustomHtml },
  });
  if (res.count === 0) {
    return { status: "cas-abort", reason: "CAS updateMany matched 0 rows during restore." };
  }

  await db.auditLog.create({
    data: {
      entityType: "PageTemplate",
      entityId: backup.templateId,
      action: "SOLO_LANDING_TEMPLATE_RESTORE",
      performedBy: deps.operator,
      changes: JSON.stringify({
        runId: deps.runId,
        restoredToSha: backup.oldSha,
        fromSha: backup.newSha,
      }),
    },
  });
  return { status: "restored" };
}

// ════════════════════════════════════════════════════════════════════════════
//  Script 2 — guarded BACKFILL of existing pages
// ════════════════════════════════════════════════════════════════════════════

export interface BuildBackfillInput {
  /** OLD global SOLO_LANDING template id (from Script 1's backup). */
  oldGlobalTemplateId: string;
  /** The BACKED-UP old global template customHtml (Script 1 backup). */
  oldTemplateCustomHtml: string;
  /** The NEW artifact HTML (explicit — NOT read from the current active template). */
  newTemplateCustomHtml: string;
  /** Expected production host for the CTA preflight. */
  expectedHost: string;
  /** Per-workshop price exceptions (workshop ids). */
  allowPriceWorkshopIds: string[];
  /** Canary: only this slug. */
  slug?: string;
  /** Batch cap on the number of CANDIDATE rows scanned. */
  limit?: number;
}

export interface BuildBackfillResult {
  plans: KajabiRowPlan[];
  /** Convenience counts for the report. */
  counts: {
    candidates: number;
    targets: number;
    noops: number;
    skips: number;
  };
}

/**
 * Build the per-row backfill plan. For each candidate SOLO_LANDING LandingPage:
 *   1. resolve per-workshop facts + the two renders (old + new) via injected fns;
 *   2. decideRow (sourceTemplateId + content match) → target / no-op / skip;
 *   3. for TARGETs, run the coach-photo / CTA / price / new-value preflights;
 *      any failing preflight downgrades the target to a skip with its reason.
 */
export async function buildBackfillPlans(
  db: DbClient,
  reinterpolate: Reinterpolate,
  resolveFacts: ResolveWorkshopFacts,
  input: BuildBackfillInput,
): Promise<BuildBackfillResult> {
  const where: Record<string, unknown> = { template: "SOLO_LANDING" };
  if (input.slug) where.slug = input.slug;

  const pages: LandingPageRow[] = await db.landingPage.findMany({
    where,
    select: {
      id: true,
      workshopId: true,
      slug: true,
      customHtml: true,
      updatedAt: true,
      categoryId: true,
      sourceTemplateId: true,
    },
    orderBy: { createdAt: "asc" },
    ...(input.limit !== undefined ? { take: input.limit } : {}),
  });

  const allowPrice = new Set(input.allowPriceWorkshopIds);
  const plans: KajabiRowPlan[] = [];

  for (const page of pages) {
    const facts = await resolveFacts(page.workshopId);
    // Fix 3 (P2): pass the pre-resolved registrationUrl so reinterpolate can skip its own lookup.
    const regUrl = facts?.registrationUrl ?? "";
    const oldOutcome = await reinterpolate(page.workshopId, input.oldTemplateCustomHtml, regUrl);
    const newOutcome = await reinterpolate(page.workshopId, input.newTemplateCustomHtml, regUrl);

    // Workshop variables missing (workshop not found) → skip.
    if (!facts || !oldOutcome || !newOutcome) {
      plans.push(
        makeSkipPlan(page, "no-workshop-variables", "buildWorkshopVariables returned null"),
      );
      continue;
    }

    const decision = decideRow({
      currentCustomHtml: page.customHtml,
      expectedOldRender: oldOutcome.sanitized,
      newRender: newOutcome.sanitized,
      sourceTemplateId: page.sourceTemplateId,
      oldGlobalTemplateId: input.oldGlobalTemplateId,
    });

    if (decision.kind === "no-op") {
      plans.push(makeDecisionPlan(page, newOutcome, "no-op"));
      continue;
    }
    if (decision.kind === "skip") {
      plans.push(makeSkipPlan(page, decision.reason, decision.detail));
      continue;
    }

    // decision.kind === "target" — run the preflights against the NEW render.
    const validation = validateNewValue(newOutcome.sanitized);
    const sanitizerStripped =
      newOutcome.strippedTags.length > 0 || newOutcome.strippedAttrs.length > 0;

    if (!hasCoachPhoto(facts.coachProfileImage)) {
      plans.push(makeSkipPlan(page, "missing-coach-photo", "coach.profileImage is empty"));
      continue;
    }
    const cta = checkCtaPreflight({
      registrationUrl: facts.registrationUrl,
      expectedHost: input.expectedHost,
      hasPublishedRegistration: facts.registrationPublished,
      expectedRegistrationSlug: facts.registrationSlug ?? undefined,
    });
    if (!cta.ok) {
      plans.push(makeSkipPlan(page, "cta-preflight-failed", cta.reason));
      continue;
    }
    const price = checkPricePreflight({
      renderedPrice: facts.renderedPrice,
      hasExplicitException: allowPrice.has(page.workshopId),
    });
    if (!price.ok) {
      plans.push(makeSkipPlan(page, "price-preflight-failed", price.reason));
      continue;
    }
    if (!validation.ok) {
      plans.push(
        makeSkipPlan(
          page,
          "new-value-invalid",
          `marker=${validation.hasDesignMarker} noUnresolved=${validation.noUnresolvedTokens}` +
            ` cta=${validation.hasCtaHref} firstToken=${validation.firstUnresolvedToken ?? "—"}`,
        ),
      );
      continue;
    }

    plans.push({
      landingPageId: page.id,
      workshopId: page.workshopId,
      slug: page.slug,
      oldSha: sha256(page.customHtml ?? ""),
      newSha: sha256(newOutcome.sanitized),
      oldUpdatedAt: page.updatedAt,
      oldCustomHtml: page.customHtml ?? "",
      newCustomHtml: newOutcome.sanitized,
      decision: "target",
      strippedTags: newOutcome.strippedTags,
      strippedAttrs: newOutcome.strippedAttrs,
      sanitizerStripped,
      validation,
    });
  }

  const targets = plans.filter((p) => p.decision === "target").length;
  const noops = plans.filter((p) => p.decision === "no-op").length;
  const skips = plans.filter((p) => p.decision === "skip").length;

  return {
    plans,
    counts: { candidates: pages.length, targets, noops, skips },
  };
}

function makeSkipPlan(page: LandingPageRow, reason: SkipReason, detail?: string): KajabiRowPlan {
  return {
    landingPageId: page.id,
    workshopId: page.workshopId,
    slug: page.slug,
    oldSha: sha256(page.customHtml ?? ""),
    newSha: "",
    oldUpdatedAt: page.updatedAt,
    oldCustomHtml: page.customHtml ?? "",
    newCustomHtml: "",
    decision: "skip",
    skipReason: reason,
    skipDetail: detail,
    strippedTags: [],
    strippedAttrs: [],
    sanitizerStripped: false,
    validation: validateNewValue(""),
  };
}

function makeDecisionPlan(
  page: LandingPageRow,
  newOutcome: SanitizeOutcome,
  decision: "no-op",
): KajabiRowPlan {
  return {
    landingPageId: page.id,
    workshopId: page.workshopId,
    slug: page.slug,
    oldSha: sha256(page.customHtml ?? ""),
    newSha: sha256(newOutcome.sanitized),
    oldUpdatedAt: page.updatedAt,
    oldCustomHtml: page.customHtml ?? "",
    newCustomHtml: newOutcome.sanitized,
    decision,
    strippedTags: newOutcome.strippedTags,
    strippedAttrs: newOutcome.strippedAttrs,
    sanitizerStripped:
      newOutcome.strippedTags.length > 0 || newOutcome.strippedAttrs.length > 0,
    validation: validateNewValue(newOutcome.sanitized),
  };
}

// ─── applyBackfill ─────────────────────────────────────────────────────────────

export interface ApplyBackfillResult {
  updated: number;
  skipped: number; // CAS aborts during apply
  blocked: number; // sanitizer strips → whole apply blocked
  backupFile?: string;
}

export interface ApplyBackfillDeps {
  /** Persist the backup of the TARGET plans; returns the path. */
  writeBackup: (targets: KajabiRowPlan[]) => Promise<string>;
  operator: string;
  runId: string;
  newGlobalSha: string;
}

/**
 * Apply only the TARGET plans. Blocks the whole apply (no writes) if any target
 * had sanitizer strips. Backs up FIRST, then CAS-writes each row (where id +
 * updatedAt), then writes a single AuditLog summarising the run.
 */
export async function applyBackfillPlans(
  db: DbClient,
  plans: KajabiRowPlan[],
  deps: ApplyBackfillDeps,
): Promise<ApplyBackfillResult> {
  const targets = plans.filter((p) => p.decision === "target");
  if (targets.length === 0) return { updated: 0, skipped: 0, blocked: 0 };

  const stripped = targets.filter((p) => p.sanitizerStripped);
  if (stripped.length > 0) {
    return { updated: 0, skipped: 0, blocked: stripped.length };
  }

  const backupFile = await deps.writeBackup(targets);

  let updated = 0;
  let skipped = 0;
  const updatedIds: string[] = [];
  const skippedIds: string[] = [];
  for (const p of targets) {
    const res = await db.landingPage.updateMany({
      where: { id: p.landingPageId, updatedAt: p.oldUpdatedAt },
      data: { customHtml: p.newCustomHtml },
    });
    if (res.count === 0) {
      skipped++;
      skippedIds.push(p.landingPageId);
      continue;
    }
    updated++;
    updatedIds.push(p.landingPageId);
  }

  await db.auditLog.create({
    data: {
      entityType: "LandingPage",
      entityId: `solo-landing-kajabi-backfill:${deps.runId}`,
      action: "SOLO_LANDING_BACKFILL_APPLY",
      performedBy: deps.operator,
      changes: JSON.stringify({
        runId: deps.runId,
        newGlobalSha: deps.newGlobalSha,
        backupFile,
        updated,
        casSkipped: skipped,
        updatedIds,
        skippedIds,
        // skipped-during-targeting (non-target) IDs + reasons for the trail.
        targetingSkips: plans
          .filter((p) => p.decision === "skip")
          .map((p) => ({ id: p.landingPageId, slug: p.slug, reason: p.skipReason })),
      }),
    },
  });

  return { updated, skipped, blocked: 0, backupFile };
}

// ─── restoreBackfill ────────────────────────────────────────────────────────────

export interface RestoreBackfillResult {
  restored: number;
  skipped: number;
}

/**
 * Restore old per-row values from a backfill backup. CAS-guarded: only restores
 * a row whose CURRENT value still hashes to the newSha we wrote (nobody edited
 * it after our apply). Audited.
 */
export async function restoreBackfill(
  db: DbClient,
  backup: KajabiBackupFile,
  deps: { operator: string; runId: string },
): Promise<RestoreBackfillResult> {
  if (backup.kind !== "solo-landing-kajabi-backfill" || !Array.isArray(backup.entries)) {
    throw new Error("Not a recognised solo-landing-kajabi backfill backup.");
  }
  let restored = 0;
  let skipped = 0;
  const restoredIds: string[] = [];
  for (const entry of backup.entries as KajabiBackupEntry[]) {
    const current = await db.landingPage.findUnique({
      where: { id: entry.landingPageId },
      select: { customHtml: true, updatedAt: true },
    });
    if (!current) {
      skipped++;
      continue;
    }
    const currentSha = sha256(current.customHtml ?? "");
    // Fix 1 (P1): fail-safe — skip unless newSha is present AND the live SHA matches it.
    // Previously: `if (entry.newSha && currentSha !== entry.newSha) skip` which
    // fell through to an unconditional write when newSha was falsy (corrupt backup).
    if (!entry.newSha || currentSha !== entry.newSha) {
      skipped++;
      continue;
    }
    // Fix 2 (P1): CAS on updatedAt (mirrors applyBackfillPlans) to prevent TOCTOU.
    const res = await db.landingPage.updateMany({
      where: { id: entry.landingPageId, updatedAt: current.updatedAt as Date },
      data: { customHtml: entry.oldCustomHtml },
    });
    if (res.count === 0) {
      // Concurrent edit between findUnique and updateMany — skip, do not clobber.
      skipped++;
      continue;
    }
    restored++;
    restoredIds.push(entry.landingPageId);
  }

  await db.auditLog.create({
    data: {
      entityType: "LandingPage",
      entityId: `solo-landing-kajabi-restore:${deps.runId}`,
      action: "SOLO_LANDING_BACKFILL_RESTORE",
      performedBy: deps.operator,
      changes: JSON.stringify({
        runId: deps.runId,
        fromBackupRunId: backup.runId,
        restored,
        skipped,
        restoredIds,
      }),
    },
  });

  return { restored, skipped };
}

// ─── Rollback-window inventory (Task 10) ───────────────────────────────────────

export interface InventoryResult {
  /** Pages currently carrying the new global SHA (post-patch window-aware). */
  onNewGlobalSha: string[];
}

/**
 * Find SOLO_LANDING pages whose CURRENT customHtml hashes to the supplied
 * per-workshop new render. Because the new render is per-workshop, the caller
 * supplies a predicate that, for each page, knows the expected new SHA. Here we
 * provide the cheap variant: list all SOLO_LANDING slugs + current SHAs so the
 * operator (or the rollback path) can identify pages created AFTER the template
 * patch that already carry a new-design render (they won't be in any backfill
 * backup). Documented in the runbook.
 */
export async function inventorySoloPages(
  db: DbClient,
): Promise<Array<{ id: string; slug: string; sha: string; sourceTemplateId: string | null }>> {
  const pages: LandingPageRow[] = await db.landingPage.findMany({
    where: { template: "SOLO_LANDING" },
    select: {
      id: true,
      workshopId: true,
      slug: true,
      customHtml: true,
      updatedAt: true,
      categoryId: true,
      sourceTemplateId: true,
    },
    orderBy: { createdAt: "asc" },
  });
  return pages.map((p) => ({
    id: p.id,
    slug: p.slug,
    sha: sha256(p.customHtml ?? ""),
    sourceTemplateId: p.sourceTemplateId,
  }));
}

export { toKajabiBackupEntry };
