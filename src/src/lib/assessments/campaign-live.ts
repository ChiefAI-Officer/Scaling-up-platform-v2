/**
 * Assessment Wave D — SEC-M6: the single source of truth for "a campaign is
 * LIVE (not soft-deleted)".
 *
 * `AssessmentCampaign.deletedAt` (added by the Wave-D migration) is a
 * soft-delete tombstone. A deleted campaign must be INVISIBLE on every
 * user-facing read path. Rather than sprinkle `deletedAt: null` filters at
 * each call site (easy to forget → SEC bug), surfaces route through:
 *
 *   - `liveCampaignWhere(extra?)` — a reusable Prisma `where` fragment that
 *     always pins `deletedAt: null` and merges any extra constraints. The
 *     live guard wins even if a caller accidentally passes `deletedAt` in
 *     `extra`.
 *   - `loadLiveCampaign(delegate, id, opts?)` — id-load helper returning
 *     `null` for a soft-deleted row. `opts.includeDeleted` is the explicit
 *     admin-recovery escape hatch for any future recovery UI; it omits the
 *     `deletedAt` filter entirely.
 *
 * The CORE access predicate `canManageCampaign` (access-control.ts) loads
 * LIVE campaigns by default via this helper, so soft-delete enforcement is
 * safe-by-default for every route that gates on it.
 */

import type { Prisma } from "@prisma/client";

// ────────────────────────────────────────────────────────────────────────
// liveCampaignWhere — reusable Prisma where-fragment
// ────────────────────────────────────────────────────────────────────────

/**
 * Returns `{ deletedAt: null, ...extra }`. The `deletedAt: null` guard is
 * applied LAST so a caller's `extra` can never widen the filter to include
 * soft-deleted rows.
 */
export function liveCampaignWhere(
  extra?: Prisma.AssessmentCampaignWhereInput,
): Prisma.AssessmentCampaignWhereInput {
  return { ...(extra ?? {}), deletedAt: null };
}

// ────────────────────────────────────────────────────────────────────────
// loadLiveCampaign — id-load that hides soft-deleted rows by default
// ────────────────────────────────────────────────────────────────────────

/**
 * Narrow delegate shape — accepts the real `prisma.assessmentCampaign`
 * delegate AND a transaction-client delegate. Generic so callers keep the
 * row shape implied by their own `args.select`/`include`.
 */
export interface LiveCampaignDelegate {
  findFirst: (args: {
    where: { id: string; deletedAt?: Date | null };
    select?: Record<string, unknown>;
    include?: Record<string, unknown>;
  }) => Promise<unknown>;
}

export interface LoadLiveCampaignOptions {
  /**
   * Explicit admin-recovery escape hatch. When true, the `deletedAt` filter
   * is omitted so a soft-deleted campaign CAN be loaded (for a future admin
   * recovery / undelete path). Default false — soft-deleted rows are hidden.
   */
  includeDeleted?: boolean;
  /** Optional Prisma `select` passed through to findFirst. */
  select?: Record<string, unknown>;
  /** Optional Prisma `include` passed through to findFirst. */
  include?: Record<string, unknown>;
}

/**
 * Loads a campaign by id, returning `null` for a soft-deleted row unless
 * `includeDeleted` is set. Uses `findFirst` (not `findUnique`) because
 * `deletedAt` is not a unique field and so cannot appear in a `findUnique`
 * where.
 */
export async function loadLiveCampaign<T = unknown>(
  delegate: LiveCampaignDelegate,
  id: string,
  opts: LoadLiveCampaignOptions = {},
): Promise<T | null> {
  const where: { id: string; deletedAt?: Date | null } = opts.includeDeleted
    ? { id }
    : { id, deletedAt: null };

  const args: {
    where: { id: string; deletedAt?: Date | null };
    select?: Record<string, unknown>;
    include?: Record<string, unknown>;
  } = { where };
  if (opts.select) args.select = opts.select;
  if (opts.include) args.include = opts.include;

  const row = await delegate.findFirst(args);
  return (row ?? null) as T | null;
}
