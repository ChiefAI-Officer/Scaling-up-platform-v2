/**
 * backfill-solo-landing-customhtml-core.ts
 *
 * Pure, side-effect-free helpers for the one-off Solo Landing customHtml
 * backfill (scripts/backfill-solo-landing-customhtml.ts).
 *
 * WHY this exists separately from the CLI script:
 *   - Jest's moduleNameMapper resolves `@/` → <rootDir>/src, but the CLI
 *     wrapper in scripts/ runs under `tsx` and is excluded from the TS build.
 *     Factoring the decision logic + SHA + signature detection into this
 *     module (under src/lib/) makes it unit-testable WITHOUT a DB, without
 *     loading the .mjs/tsx entrypoint, and keeps the CLI wrapper thin.
 *
 * No imports of `@/lib/db` or anything with side effects — everything here is
 * pure and deterministic.
 */

import { createHash } from "node:crypto";

// ─── Detection signatures ────────────────────────────────────────────────
//
// A SOLO_LANDING snapshot needs a refresh if it carries EITHER:
//   (a) the OLD CSS-quadrant brandbar markup (the `.su-mark-q` block that the
//       data-URI <img> logo replaced in commit c87fb4a), OR
//   (b) a literal, unresolved `{{event_time}}` token (it was never an emitted
//       variable before buildWorkshopVariables started returning a zoned
//       `event_time`, so old snapshots froze the literal token text).
//
// Matching `su-mark-q` is unambiguous: it is the class on the four coloured
// quadrant <span>s of the old logo and appears nowhere in the new starter.
// We also accept the broader `su-wordmark` / `su-tag` text-logo classes as a
// secondary signal — same era, same block.

/** The new starter logo signature — an inline data-URI <img>. */
export const NEW_LOGO_SIGNATURE = "data:image/svg+xml;base64,";

/** A literal, unresolved interpolation token for the workshop time. */
export const LITERAL_EVENT_TIME_TOKEN = "{{event_time}}";

/** Old CSS-quadrant brandbar class signatures (any one of these → needs refresh). */
export const OLD_LOGO_SIGNATURES = [
  "su-mark-q", // the four coloured quadrant spans — most specific
  "su-wordmark", // text wordmark span
] as const;

/**
 * Does this stored customHtml carry the OLD CSS-quadrant logo markup?
 */
export function hasOldLogoMarkup(customHtml: string): boolean {
  return OLD_LOGO_SIGNATURES.some((sig) => customHtml.includes(sig));
}

/**
 * Does this stored customHtml still contain a literal `{{event_time}}` token?
 * (Whitespace-tolerant: also matches `{{ event_time }}`.)
 */
export function hasLiteralEventTimeToken(customHtml: string): boolean {
  return /\{\{\s*event_time\s*\}\}/.test(customHtml);
}

/**
 * A row is a backfill TARGET when it has a non-empty customHtml AND it carries
 * either the old logo markup or a literal event_time token.
 */
export function needsRefresh(customHtml: string | null | undefined): boolean {
  if (!customHtml || customHtml.trim().length === 0) return false;
  return hasOldLogoMarkup(customHtml) || hasLiteralEventTimeToken(customHtml);
}

// ─── Hashing ───────────────────────────────────────────────────────────────

/** SHA-256 hex digest of a string (used for old→new diff reporting + backups). */
export function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

// ─── Post-interpolation validation ──────────────────────────────────────────

export interface NewValueChecks {
  /** New value contains the inline data-URI <img> logo. */
  hasNewLogo: boolean;
  /** New value no longer contains a literal {{event_time}} token. */
  eventTimeResolved: boolean;
  /** New value still carries old CSS-quadrant markup (should be false). */
  stillHasOldLogo: boolean;
}

/**
 * Inspect a freshly-interpolated value for the two things the backfill is
 * meant to fix: the logo swap and the resolved (non-literal) time.
 */
export function inspectNewValue(newCustomHtml: string): NewValueChecks {
  return {
    hasNewLogo: newCustomHtml.includes(NEW_LOGO_SIGNATURE),
    eventTimeResolved: !hasLiteralEventTimeToken(newCustomHtml),
    stillHasOldLogo: hasOldLogoMarkup(newCustomHtml),
  };
}

// ─── Per-row plan ────────────────────────────────────────────────────────────

export interface RowSource {
  landingPageId: string;
  workshopId: string;
  oldCustomHtml: string;
  /** Result of re-interpolating the CURRENT PageTemplate.customHtml for this row. */
  newCustomHtml: string;
  oldUpdatedAt: Date;
  /** Sanitizer audit — these MUST be empty for an apply to be safe. */
  strippedTags: string[];
  strippedAttrs: string[];
}

export interface RowPlan {
  landingPageId: string;
  workshopId: string;
  oldSha: string;
  newSha: string;
  oldUpdatedAt: Date;
  newCustomHtml: string;
  oldCustomHtml: string;
  /** True when newSha === oldSha — nothing to do (idempotent no-op). */
  isNoOp: boolean;
  /** Sanitizer dropped something — surfaces in the report; blocks a clean apply. */
  sanitizerStripped: boolean;
  strippedTags: string[];
  strippedAttrs: string[];
  checks: NewValueChecks;
}

/**
 * Build the per-row plan from a row's source + its re-interpolated new value.
 * Pure — the caller supplies oldCustomHtml + the already-computed newCustomHtml
 * (the actual interpolate+sanitize happens in the CLI wrapper, which needs the
 * DB-backed buildWorkshopVariables).
 */
export function planRow(src: RowSource): RowPlan {
  const oldSha = sha256(src.oldCustomHtml);
  const newSha = sha256(src.newCustomHtml);
  return {
    landingPageId: src.landingPageId,
    workshopId: src.workshopId,
    oldSha,
    newSha,
    oldUpdatedAt: src.oldUpdatedAt,
    newCustomHtml: src.newCustomHtml,
    oldCustomHtml: src.oldCustomHtml,
    isNoOp: oldSha === newSha,
    sanitizerStripped:
      src.strippedTags.length > 0 || src.strippedAttrs.length > 0,
    strippedTags: src.strippedTags,
    strippedAttrs: src.strippedAttrs,
    checks: inspectNewValue(src.newCustomHtml),
  };
}

// ─── Backup file shape ───────────────────────────────────────────────────────

export interface BackupEntry {
  landingPageId: string;
  workshopId: string;
  oldCustomHtml: string;
  oldUpdatedAt: string; // ISO
  oldSha: string;
  newSha: string;
}

export interface BackupFile {
  kind: "solo-landing-customhtml-backfill";
  createdAt: string; // ISO
  databaseHost: string;
  entries: BackupEntry[];
}

/** Construct one backup entry for a row about to be written. */
export function toBackupEntry(plan: RowPlan): BackupEntry {
  return {
    landingPageId: plan.landingPageId,
    workshopId: plan.workshopId,
    oldCustomHtml: plan.oldCustomHtml,
    oldUpdatedAt: plan.oldUpdatedAt.toISOString(),
    oldSha: plan.oldSha,
    newSha: plan.newSha,
  };
}

// ─── CLI flag parsing ────────────────────────────────────────────────────────

export const OVERRIDE_FLAG = "--i-know-this-is-prod";

export type Mode = "dry-run" | "apply" | "restore";

export interface ParsedArgs {
  mode: Mode;
  hasOverride: boolean;
  restoreFile?: string;
}

/**
 * Parse the CLI argv (already sliced to remove node + script path).
 * Default mode is dry-run when neither --apply nor --restore is present.
 * --restore takes the next argument as the backup file path.
 */
export function parseArgs(argv: string[]): ParsedArgs {
  const hasOverride = argv.includes(OVERRIDE_FLAG);
  const restoreIdx = argv.indexOf("--restore");
  if (restoreIdx >= 0) {
    return {
      mode: "restore",
      hasOverride,
      restoreFile: argv[restoreIdx + 1],
    };
  }
  if (argv.includes("--apply")) {
    return { mode: "apply", hasOverride };
  }
  // --dry-run is the default and may be passed explicitly.
  return { mode: "dry-run", hasOverride };
}
