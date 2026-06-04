/**
 * backfill-solo-landing-customhtml-runner.ts
 *
 * DB-touching orchestration for the Solo Landing customHtml backfill, written
 * with DEPENDENCY INJECTION so it is unit-testable with a mocked Prisma client
 * and mocked interpolation/sanitize functions. The CLI wrapper
 * (scripts/backfill-solo-landing-customhtml.ts) wires the real Prisma client +
 * real lib functions into these runners.
 *
 * Every function here is pure-of-globals: all I/O (DB, fs) is passed in.
 */

import {
  needsRefresh,
  planRow,
  toBackupEntry,
  sha256,
  type RowPlan,
  type BackupFile,
  type BackupEntry,
} from "@/lib/scripts/backfill-solo-landing-customhtml-core";

// ─── Injected dependency contracts (minimal Prisma surface) ──────────────────

export interface PageTemplateRow {
  id: string;
  categoryId: string | null;
  customHtml: string | null;
}

export interface LandingPageRow {
  id: string;
  workshopId: string;
  customHtml: string | null;
  updatedAt: Date;
  categoryId: string | null;
}

export interface DbClient {
  pageTemplate: {
    findMany(args: unknown): Promise<PageTemplateRow[]>;
  };
  landingPage: {
    findMany(args: unknown): Promise<LandingPageRow[]>;
    findUnique(args: unknown): Promise<{ slug?: string; customHtml?: string | null } | null>;
    updateMany(args: {
      where: { id: string; updatedAt: Date };
      data: { customHtml: string };
    }): Promise<{ count: number }>;
    update(args: { where: { id: string }; data: { customHtml: string } }): Promise<unknown>;
  };
}

export interface SanitizeOutcome {
  sanitized: string;
  strippedTags: string[];
  strippedAttrs: string[];
}

/**
 * Re-interpolate one template's customHtml for one workshop. Injected so tests
 * can stub it without loading buildWorkshopVariables/interpolate/sanitize.
 * Returns null when the workshop has no variables (not found).
 */
export type Reinterpolate = (
  workshopId: string,
  templateCustomHtml: string,
) => Promise<SanitizeOutcome | null>;

// ─── buildPlans ──────────────────────────────────────────────────────────────

export async function buildPlans(db: DbClient, reinterpolate: Reinterpolate): Promise<RowPlan[]> {
  const activeSolo = await db.pageTemplate.findMany({
    where: { templateType: "SOLO_LANDING", isActive: true },
    select: { id: true, categoryId: true, customHtml: true },
  });
  const allSolo = activeSolo.length
    ? activeSolo
    : await db.pageTemplate.findMany({
        where: { templateType: "SOLO_LANDING" },
        select: { id: true, categoryId: true, customHtml: true },
      });

  const globalTpl = allSolo.find((t) => t.categoryId === null) ?? allSolo[0];
  if (!globalTpl || !globalTpl.customHtml || globalTpl.customHtml.trim().length === 0) {
    throw new Error(
      "No SOLO_LANDING PageTemplate with a non-empty customHtml found. Cannot re-interpolate.",
    );
  }
  const byCategory = new Map<string, PageTemplateRow>();
  for (const t of allSolo) if (t.categoryId) byCategory.set(t.categoryId, t);

  const pages = await db.landingPage.findMany({
    where: { template: "SOLO_LANDING" },
    select: { id: true, workshopId: true, customHtml: true, updatedAt: true, categoryId: true },
    orderBy: { createdAt: "asc" },
  });

  const plans: RowPlan[] = [];
  for (const page of pages) {
    if (!needsRefresh(page.customHtml)) continue;
    const tpl = (page.categoryId && byCategory.get(page.categoryId)) || globalTpl;
    const tplHtml =
      tpl.customHtml && tpl.customHtml.trim().length > 0 ? tpl.customHtml : globalTpl.customHtml!;
    const result = await reinterpolate(page.workshopId, tplHtml);
    if (!result) continue;
    plans.push(
      planRow({
        landingPageId: page.id,
        workshopId: page.workshopId,
        oldCustomHtml: page.customHtml ?? "",
        newCustomHtml: result.sanitized,
        oldUpdatedAt: page.updatedAt,
        strippedTags: result.strippedTags,
        strippedAttrs: result.strippedAttrs,
      }),
    );
  }
  return plans;
}

// ─── applyPlans ──────────────────────────────────────────────────────────────

export interface ApplyResult {
  updated: number;
  skipped: number;
  blocked: number;
  backupFile?: string;
}

export interface ApplyDeps {
  /** Persist the backup; returns the file path written. */
  writeBackup: (plans: RowPlan[]) => Promise<string>;
}

/**
 * Apply the changing plans. Backs up FIRST, then CAS-writes each row.
 * Blocks entirely (no writes) if any changing row had sanitizer strips.
 */
export async function applyPlans(
  db: DbClient,
  plans: RowPlan[],
  deps: ApplyDeps,
): Promise<ApplyResult> {
  const changes = plans.filter((p) => !p.isNoOp);
  if (changes.length === 0) return { updated: 0, skipped: 0, blocked: 0 };

  const stripped = changes.filter((p) => p.sanitizerStripped);
  if (stripped.length > 0) {
    return { updated: 0, skipped: 0, blocked: stripped.length };
  }

  const backupFile = await deps.writeBackup(changes);

  let updated = 0;
  let skipped = 0;
  for (const p of changes) {
    const res = await db.landingPage.updateMany({
      where: { id: p.landingPageId, updatedAt: p.oldUpdatedAt },
      data: { customHtml: p.newCustomHtml },
    });
    if (res.count === 0) {
      skipped++;
      continue;
    }
    updated++;
  }
  return { updated, skipped, blocked: 0, backupFile };
}

// ─── restoreFromBackup ───────────────────────────────────────────────────────

export interface RestoreResult {
  restored: number;
  skipped: number;
}

/**
 * Restore old values from a parsed backup. CAS-guarded: only restores a row
 * whose CURRENT value still hashes to the newSha we wrote (i.e. nobody edited
 * it after our apply). Rows that vanished or were re-edited are skipped.
 */
export async function restoreFromBackup(db: DbClient, backup: BackupFile): Promise<RestoreResult> {
  if (backup.kind !== "solo-landing-customhtml-backfill" || !Array.isArray(backup.entries)) {
    throw new Error("Not a recognised backfill backup.");
  }
  let restored = 0;
  let skipped = 0;
  for (const entry of backup.entries as BackupEntry[]) {
    const current = await db.landingPage.findUnique({
      where: { id: entry.landingPageId },
      select: { customHtml: true },
    });
    if (!current) {
      skipped++;
      continue;
    }
    const currentSha = sha256(current.customHtml ?? "");
    if (entry.newSha && currentSha !== entry.newSha) {
      skipped++;
      continue;
    }
    await db.landingPage.update({
      where: { id: entry.landingPageId },
      data: { customHtml: entry.oldCustomHtml },
    });
    restored++;
  }
  return { restored, skipped };
}

export { toBackupEntry };
