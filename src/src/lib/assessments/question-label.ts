/**
 * Shared question-label helpers (Spec 17 Wave E).
 *
 * Pure string utilities — no DB, no I/O. Safe to import from seed-content
 * tests and from renderers.
 */

/**
 * Remove a trailing "(with 1 decimal)" suffix from a question label.
 *
 * Background (#26 / R1-L2): the QSPv2 P1 overall-rating label was seeded as
 *   "How would you rate the past Quarter? (1-10) (with 1 decimal)"
 * but the scale is integer (step: 1) — the "(with 1 decimal)" hint is wrong.
 * The seed is fixed going forward, but template versions already pinned to
 * historical campaigns still carry the suffix. This strips it at render time
 * so legacy versions read correctly without a data migration.
 *
 * Case-insensitive and tolerant of surrounding whitespace. Returns the
 * trimmed label. Labels without the suffix pass through unchanged (still
 * trimmed of leading/trailing whitespace by the regex tail + the input).
 */
export function stripLegacyDecimalSuffix(label: string): string {
  return label.replace(/\s*\(with 1 decimal\)\s*$/i, "").trim();
}
