/**
 * Wave ED8 — version-lifecycle feature flag (default-OFF runtime gate).
 *
 * Gates the version-lifecycle WRITE endpoints + new editor UI only (spec
 * 19ak): rollback-to-version, archive/unarchive (`archivedAt`-only updates
 * to published rows), and draft-delete. Per the Wave-Q doctrine, flags gate
 * CAPABILITY, never persisted data correctness: archived-exclusion in read
 * paths is persisted admin intent (`archivedAt` on the row) and is NEVER
 * flag-gated — killing the flag stops further lifecycle operations, it does
 * not un-retire an already-archived version.
 *
 * Two levers only (no canary — versions are template-level platform config,
 * not per-org content):
 * - `WAVE_ED8_VERSION_LIFECYCLE_KILL` hard-overrides everything.
 * - `WAVE_ED8_VERSION_LIFECYCLE_ENABLED` enables globally.
 *
 * Truthiness matches the Wave-M/N/O/S convention:
 *   - false when unset / "" / "0" / "false"
 *   - true only for "1" / "true" / "TRUE" / "yes"
 *
 * Env vars are read at call time (never cached) so tests can set process.env.
 */

function isOn(v: string | undefined): boolean {
  return v === "1" || v === "true" || v === "TRUE" || v === "yes";
}

/**
 * Whether the version-lifecycle capability (write endpoints + UI) is enabled.
 * Pure + never-throwing. Default-OFF when all unset.
 */
export function isVersionLifecycleEnabled(): boolean {
  if (isOn(process.env.WAVE_ED8_VERSION_LIFECYCLE_KILL)) return false;
  return isOn(process.env.WAVE_ED8_VERSION_LIFECYCLE_ENABLED);
}
