/**
 * snapshot-prod-helpers.mjs
 *
 * Pure helpers for snapshot-prod-tables.ts. Kept side-effect-free (no Prisma
 * import, no env loading) so they are unit-testable without a database.
 */

/**
 * True when an error message indicates a transient connectivity failure
 * (e.g. a Neon pooler cold-start drop) — worth retrying — rather than a
 * deterministic data/schema error.
 */
export function isConnectionError(message) {
  return /can't reach database server|P1001|P1002|ECONNREFUSED|ETIMEDOUT|connection terminated|server has closed the connection|connection closed/i.test(
    message ?? "",
  );
}

/**
 * Classify a snapshot run from the list of tables that failed to export.
 *
 * - Any failure → `partial: true` and a `.PARTIAL` filename suffix, so a
 *   partial snapshot can NEVER be mistaken for a complete one.
 * - A failed CORE table (the ones whose loss caused the production wipes:
 *   User/Coach/Survey/...) → `severe: true` and exit code 1.
 * - A failed non-core table → exit code 2 (warn, but less severe).
 * - No failures → exit code 0, no suffix.
 */
export function classifySnapshot(errorTables, coreTables) {
  const failed = errorTables ?? [];
  const core = coreTables ?? [];
  const coreFailed = failed.filter((t) => core.includes(t));
  const partial = failed.length > 0;
  const severe = coreFailed.length > 0;
  return {
    partial,
    severe,
    coreFailed,
    exitCode: severe ? 1 : partial ? 2 : 0,
    filenameSuffix: partial ? ".PARTIAL" : "",
  };
}
