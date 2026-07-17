/**
 * Wave ED8 (spec 19ak §2) — pure client-side version-status derivation.
 *
 * The CLIENT twin of `src/lib/assessments/active-version.ts` (the server's
 * one-place Active definition): given the editor's `allVersions` rows, derive
 * each row's lifecycle status. Active is DERIVED, never stored:
 *
 *   Active     — the highest `versionNumber` with `publishedAt != null` AND
 *                `archivedAt == null`, PER (language).
 *   Superseded — published, non-archived, not the highest.
 *   Draft      — `publishedAt == null` (archivedAt is ignored on drafts —
 *                the server never archives drafts; 409 NOT_PUBLISHED).
 *   Archived   — published + `archivedAt != null`.
 *
 * Pure + never-throwing — no React, no fetch; unit-tested in
 * `__tests__/components/admin/template-editor/version-lifecycle.test.ts`.
 * If the server definition ever moves, move this with it.
 */

export type VersionLifecycleStatus =
  | "active"
  | "superseded"
  | "draft"
  | "archived";

/** The minimal row shape the derivation needs (ISO strings, as serialized). */
export interface LifecycleVersionRow {
  id: string;
  versionNumber: number;
  language: string;
  publishedAt: string | null;
  archivedAt: string | null;
}

/** A row counts toward the Active pick iff published AND non-archived. */
function isActiveCandidate(row: LifecycleVersionRow): boolean {
  return row.publishedAt !== null && row.archivedAt === null;
}

/** Highest-versionNumber published non-archived row for `language`, if any. */
function activeRowForLanguage(
  rows: LifecycleVersionRow[],
  language: string,
): LifecycleVersionRow | null {
  let best: LifecycleVersionRow | null = null;
  for (const row of rows) {
    if (row.language !== language) continue;
    if (!isActiveCandidate(row)) continue;
    if (best === null || row.versionNumber > best.versionNumber) {
      best = row;
    }
  }
  return best;
}

/**
 * Derive every row's lifecycle status. Returns a Map keyed by row id so
 * callers can look up per-row status in O(1) while rendering.
 */
export function deriveVersionStatuses(
  rows: LifecycleVersionRow[],
): Map<string, VersionLifecycleStatus> {
  // Active pick per language (highest published non-archived versionNumber).
  const activeByLanguage = new Map<string, LifecycleVersionRow>();
  for (const row of rows) {
    if (!isActiveCandidate(row)) continue;
    const best = activeByLanguage.get(row.language);
    if (!best || row.versionNumber > best.versionNumber) {
      activeByLanguage.set(row.language, row);
    }
  }

  const statuses = new Map<string, VersionLifecycleStatus>();
  for (const row of rows) {
    if (row.publishedAt === null) {
      statuses.set(row.id, "draft");
    } else if (row.archivedAt !== null) {
      statuses.set(row.id, "archived");
    } else if (activeByLanguage.get(row.language)?.id === row.id) {
      statuses.set(row.id, "active");
    } else {
      statuses.set(row.id, "superseded");
    }
  }
  return statuses;
}

/**
 * Single-row convenience (the TabbedShell pill's lookup). Returns null when
 * `versionId` isn't in `rows`.
 */
export function deriveVersionStatus(
  rows: LifecycleVersionRow[],
  versionId: string,
): VersionLifecycleStatus | null {
  return deriveVersionStatuses(rows).get(versionId) ?? null;
}

/**
 * The versionNumber that becomes Active if `versionId` is archived (the
 * "Roll back…" confirm's "v{N} becomes Active"): the highest published
 * non-archived row in the SAME language EXCLUDING this row, or null when
 * none exists (the server's LAST_PUBLISHED_VERSION guard case).
 */
export function nextActiveVersionNumber(
  rows: LifecycleVersionRow[],
  versionId: string,
): number | null {
  const target = rows.find((r) => r.id === versionId);
  if (!target) return null;
  const best = activeRowForLanguage(
    rows.filter((r) => r.id !== versionId),
    target.language,
  );
  return best ? best.versionNumber : null;
}

/**
 * Whether unarchiving `versionId` makes it the Active version again (the
 * unarchive confirm's spec-§5 consequence line): true when its versionNumber
 * exceeds the current Active's for its language, or when the language has no
 * current Active at all. False for an unknown id.
 */
export function willBecomeActiveOnUnarchive(
  rows: LifecycleVersionRow[],
  versionId: string,
): boolean {
  const target = rows.find((r) => r.id === versionId);
  if (!target) return false;
  const active = activeRowForLanguage(rows, target.language);
  if (!active) return true;
  return target.versionNumber > active.versionNumber;
}
