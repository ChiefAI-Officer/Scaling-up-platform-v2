/**
 * solo-landing-kajabi-core.ts
 *
 * Pure, side-effect-free helpers for the GLOBAL SOLO_LANDING Kajabi rollout:
 *   - Script 1 (scripts/update-solo-landing-template.ts) — CAS-guarded update of
 *     the single global SOLO_LANDING PageTemplate.customHtml to the new artifact.
 *   - Script 2 (scripts/backfill-solo-landing-kajabi.ts) — guarded, canary-first,
 *     audited backfill of the existing per-workshop SOLO_LANDING LandingPage
 *     snapshots to the new design.
 *
 * WHY a separate module from the June-4 backfill core:
 *   The June-4 backfill targeted by *migration-specific signatures* (old
 *   `su-mark-q` logo markup OR a literal `{{event_time}}` token). That predicate
 *   is wrong for the Kajabi rollout — the old global design is itself a
 *   token-driven customHtml, so most rows DO have a resolved event_time and the
 *   NEW logo style, and the signature predicate would miss them (claudex R2-High1).
 *
 *   This rollout targets by the ONLY correct signal: re-render the BACKED-UP OLD
 *   global template with THIS workshop's variables (the exact two-pass auto-build
 *   pipeline), strict-sanitize, SHA, and compare to the row's CURRENT customHtml.
 *   A match ⇒ the row is still on the old global design ⇒ target. A mismatch ⇒
 *   bespoke / category-scoped / hand-edited ⇒ SKIP + log. We never gate on a
 *   shared raw-template hash (the snapshot is interpolated, so it NEVER equals
 *   the raw template hash — R2-High1/R3-High1).
 *
 * No imports of `@/lib/db` or anything with side effects — everything here is
 * pure and deterministic. The DB-touching orchestration lives in
 * solo-landing-kajabi-runner.ts; the actual interpolate/sanitize pipeline is
 * injected by the CLI wrapper.
 */

import { createHash } from "node:crypto";

// ─── Hashing ───────────────────────────────────────────────────────────────

/** SHA-256 hex digest of a string (template update CAS, per-row diff, backups). */
export function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

// ─── New-artifact design marker ──────────────────────────────────────────────

/**
 * The new Kajabi design is uniquely identifiable by the `data-su-mc` attribute
 * on its root <div>. We assert the artifact carries it, and validate every
 * rendered NEW value still carries it (a defense against an interpolation /
 * sanitize step accidentally dropping the wrapper).
 */
export const NEW_DESIGN_MARKER = "data-su-mc";

// ─── New-value validation (Task 7/10) ─────────────────────────────────────────

export interface NewValueValidation {
  ok: boolean;
  /** Contains the data-su-mc design marker. */
  hasDesignMarker: boolean;
  /** No unresolved `{{…}}` interpolation token remains. */
  noUnresolvedTokens: boolean;
  /** A non-empty CTA href resolved (the Register button points somewhere). */
  hasCtaHref: boolean;
  /** The first unresolved token found (for the report), if any. */
  firstUnresolvedToken?: string;
  /** The resolved CTA href that was extracted (for the report), if any. */
  resolvedCtaHref?: string;
}

/**
 * Match ANY `{{token}}` (whitespace-tolerant). Used to assert the rendered NEW
 * value has no leftover interpolation placeholders. NOTE: applied to the
 * interpolated+sanitized output, where the only legitimate `{{` would be a
 * genuinely-unresolved variable, so any hit is a defect.
 */
const ANY_TOKEN_RE = /\{\{\s*[a-zA-Z_][a-zA-Z0-9_.]*\s*\}\}/;

/**
 * Extract the FIRST CTA href from the rendered customHtml. The artifact's
 * register button is `<a class="btn" href="…">Register Here</a>`. We look for an
 * <a> whose class contains `btn` and read its href; fall back to the first
 * <a href> if no btn anchor is present (defensive — the artifact always has one).
 */
export function extractCtaHref(html: string): string | undefined {
  // Prefer an anchor whose class mentions "btn" (the register button).
  const btnMatch = html.match(
    /<a\b[^>]*\bclass\s*=\s*["'][^"']*\bbtn\b[^"']*["'][^>]*\bhref\s*=\s*["']([^"']*)["']/i,
  );
  if (btnMatch) return btnMatch[1];
  // class may come AFTER href on the same tag — try href-then-class order too.
  const btnMatch2 = html.match(
    /<a\b[^>]*\bhref\s*=\s*["']([^"']*)["'][^>]*\bclass\s*=\s*["'][^"']*\bbtn\b[^"']*["']/i,
  );
  if (btnMatch2) return btnMatch2[1];
  const anyAnchor = html.match(/<a\b[^>]*\bhref\s*=\s*["']([^"']*)["']/i);
  return anyAnchor ? anyAnchor[1] : undefined;
}

/**
 * Validate a freshly-rendered NEW value for the three invariants Task 7/10
 * require before we are willing to WRITE it to a public page:
 *   1. carries the new design marker (data-su-mc),
 *   2. has no unresolved {{…}} token,
 *   3. has a non-empty CTA href.
 */
export function validateNewValue(renderedHtml: string): NewValueValidation {
  const unresolved = renderedHtml.match(ANY_TOKEN_RE);
  const hasDesignMarker = renderedHtml.includes(NEW_DESIGN_MARKER);
  const noUnresolvedTokens = unresolved === null;
  const ctaHref = extractCtaHref(renderedHtml);
  const hasCtaHref = !!ctaHref && ctaHref.trim().length > 0;
  return {
    ok: hasDesignMarker && noUnresolvedTokens && hasCtaHref,
    hasDesignMarker,
    noUnresolvedTokens,
    hasCtaHref,
    firstUnresolvedToken: unresolved?.[0],
    resolvedCtaHref: ctaHref,
  };
}

// ─── CTA preflight (Task 8) ────────────────────────────────────────────────────

export interface CtaPreflightInput {
  /** The resolved registration URL embedded into this workshop's render. */
  registrationUrl: string;
  /** The expected production host (e.g. "scaling-up-platform-v2.vercel.app"). */
  expectedHost: string;
  /**
   * Whether this workshop has a PUBLISHED REGISTRATION LandingPage whose slug
   * matches the slug inside registrationUrl. The DB lookup is done by the
   * runner; the pure check verifies the URL shape + the matched flag.
   */
  hasPublishedRegistration: boolean;
  /** The REGISTRATION slug we expect to find inside registrationUrl (from DB). */
  expectedRegistrationSlug?: string;
}

export interface CtaPreflightResult {
  ok: boolean;
  reason?: string;
}

/**
 * Strengthened CTA preflight (claudex R2-Med1): the resolved registration URL
 * must be an ABSOLUTE https URL on the expected production host AND correspond
 * to a PUBLISHED REGISTRATION LandingPage for the same workshop. A relative,
 * http, staging-host, or unpublished-registration URL FAILS (skip + flag) —
 * we never globally ship a broken or wrong-host buy button.
 */
export function checkCtaPreflight(input: CtaPreflightInput): CtaPreflightResult {
  const { registrationUrl, expectedHost, hasPublishedRegistration, expectedRegistrationSlug } =
    input;

  if (!registrationUrl || registrationUrl.trim().length === 0) {
    return { ok: false, reason: "registration URL is empty" };
  }

  let parsed: URL;
  try {
    parsed = new URL(registrationUrl);
  } catch {
    return { ok: false, reason: `registration URL is not absolute/parseable: "${registrationUrl}"` };
  }

  if (parsed.protocol !== "https:") {
    return { ok: false, reason: `registration URL is not https (got "${parsed.protocol}")` };
  }

  if (!expectedHost || expectedHost.trim().length === 0) {
    return { ok: false, reason: "expected production host is not configured" };
  }

  if (parsed.host.toLowerCase() !== expectedHost.toLowerCase()) {
    return {
      ok: false,
      reason: `registration URL host "${parsed.host}" != expected prod host "${expectedHost}"`,
    };
  }

  if (!hasPublishedRegistration) {
    return {
      ok: false,
      reason: "no PUBLISHED REGISTRATION LandingPage found for this workshop's CTA slug",
    };
  }

  // If a slug was supplied, the URL path must actually end with it (guards
  // against a stale / mismatched slug sneaking through).
  if (expectedRegistrationSlug) {
    const path = parsed.pathname.replace(/\/+$/, "");
    if (!path.endsWith(`/${expectedRegistrationSlug}`)) {
      return {
        ok: false,
        reason:
          `registration URL path "${parsed.pathname}" does not end with the published ` +
          `REGISTRATION slug "/${expectedRegistrationSlug}"`,
      };
    }
  }

  return { ok: true };
}

// ─── Price preflight (Task 9) ──────────────────────────────────────────────────

export interface PricePreflightInput {
  /** The `{{price}}` value as rendered by buildWorkshopVariables (e.g. "$497"). */
  renderedPrice: string;
  /** Whether the operator passed `--allow-price <workshopId>` for this row. */
  hasExplicitException: boolean;
}

export interface PricePreflightResult {
  ok: boolean;
  reason?: string;
}

/**
 * Price preflight = FAIL, not flag (claudex R2-Low1). A rendered price of
 * `TBD` or `Free` (the two buildWorkshopVariables fallbacks that indicate we
 * could NOT confirm a real checkout amount) FAILS the row — unless the operator
 * has passed an explicit `--allow-price <workshopId>` exception (e.g. a workshop
 * that legitimately de-emphasizes price). A confirmed dollar amount passes.
 *
 * NOTE: buildWorkshopVariables derives `price` directly from the workshop's
 * pricingTier / priceCents / isFree, i.e. the SAME source the registration
 * checkout uses — so a non-TBD, non-Free dollar string IS the registration
 * amount. There is no separate checkout amount to diverge from. We therefore
 * only need to reject the two "unknown" sentinels.
 */
export function checkPricePreflight(input: PricePreflightInput): PricePreflightResult {
  const { renderedPrice, hasExplicitException } = input;
  if (hasExplicitException) return { ok: true };

  const trimmed = (renderedPrice ?? "").trim();
  if (trimmed === "" || trimmed.toUpperCase() === "TBD" || trimmed.toLowerCase() === "free") {
    return {
      ok: false,
      reason:
        `rendered price is "${trimmed || "(empty)"}" — cannot confirm a checkout amount. ` +
        `Pass --allow-price <workshopId> to ship this row with an explicit exception.`,
    };
  }
  return { ok: true };
}

// ─── Coach-photo preflight (Task 7) ────────────────────────────────────────────

/**
 * Coach-photo preflight: the artifact renders `<img src="{{coach_photo}}">`.
 * A workshop whose coach has an empty profileImage would ship an empty <img>
 * src. Require a non-empty coach.profileImage; rows without it are SKIPPED +
 * flagged (the runner reports them). Pure check on the resolved value.
 */
export function hasCoachPhoto(profileImage: string | null | undefined): boolean {
  return !!profileImage && profileImage.trim().length > 0;
}

// ─── Targeting decision (Task 7) ───────────────────────────────────────────────

export type SkipReason =
  | "bespoke-or-category-scoped" // current customHtml != expected old render
  | "source-template-mismatch" // sourceTemplateId != old global template id
  | "missing-coach-photo"
  | "cta-preflight-failed"
  | "price-preflight-failed"
  | "new-value-invalid" // rendered NEW value failed validateNewValue
  | "no-workshop-variables" // buildWorkshopVariables returned null
  | "empty-current-customhtml"; // row has no customHtml to compare/replace

export type RowDecision =
  | { kind: "target" }
  | { kind: "no-op" } // already on the new design (new render == current)
  | { kind: "skip"; reason: SkipReason; detail?: string };

export interface TargetingInput {
  /** The row's CURRENT stored customHtml (the interpolated per-workshop snapshot). */
  currentCustomHtml: string | null | undefined;
  /**
   * The per-workshop EXPECTED OLD render: the BACKED-UP old global template
   * re-interpolated with THIS workshop's vars + REGISTRATION slug, strict
   * sanitized. Provided by the runner via the injected reinterpolate fn.
   */
  expectedOldRender: string;
  /** The per-workshop NEW render (the new artifact interpolated for this workshop). */
  newRender: string;
  /** This LandingPage row's sourceTemplateId (may be null on legacy rows). */
  sourceTemplateId: string | null | undefined;
  /** The OLD global SOLO_LANDING PageTemplate id (from Script 1's backup). */
  oldGlobalTemplateId: string;
}

/**
 * Decide whether a single SOLO_LANDING LandingPage row is a backfill TARGET.
 *
 * Targeting precisely (claudex R2-High1, R3-High1):
 *   1. If the row has no current customHtml → SKIP (nothing to compare/replace).
 *   2. If sourceTemplateId is set AND != the old global template id → SKIP
 *      (this page was cloned from a DIFFERENT template — bespoke/category).
 *      A null sourceTemplateId is permitted (legacy rows) and falls through to
 *      the content check, which is the authoritative signal.
 *   3. Compute sha(currentCustomHtml). If it equals sha(newRender) → NO-OP
 *      (already on the new design — idempotent).
 *   4. If it equals sha(expectedOldRender) → TARGET (still on the old global
 *      design rendered for THIS workshop).
 *   5. Otherwise → SKIP "bespoke-or-category-scoped" (hand-edited / different
 *      design — we must NEVER clobber it).
 *
 * The preflights (coach photo / CTA / price / new-value validity) are applied by
 * the runner AFTER a row is decided a TARGET; they can downgrade a target to a
 * skip with their own reason.
 */
export function decideRow(input: TargetingInput): RowDecision {
  const current = input.currentCustomHtml;
  if (!current || current.trim().length === 0) {
    return { kind: "skip", reason: "empty-current-customhtml" };
  }

  if (
    input.sourceTemplateId &&
    input.sourceTemplateId.trim().length > 0 &&
    input.sourceTemplateId !== input.oldGlobalTemplateId
  ) {
    return {
      kind: "skip",
      reason: "source-template-mismatch",
      detail: `sourceTemplateId=${input.sourceTemplateId} != old global ${input.oldGlobalTemplateId}`,
    };
  }

  const currentSha = sha256(current);
  if (currentSha === sha256(input.newRender)) {
    return { kind: "no-op" };
  }
  if (currentSha === sha256(input.expectedOldRender)) {
    return { kind: "target" };
  }
  return {
    kind: "skip",
    reason: "bespoke-or-category-scoped",
    detail: `current SHA ${currentSha.slice(0, 12)}… matches neither the per-workshop old nor new render`,
  };
}

// ─── Per-row plan ──────────────────────────────────────────────────────────────

export interface KajabiRowPlan {
  landingPageId: string;
  workshopId: string;
  slug: string;
  oldSha: string;
  newSha: string;
  oldUpdatedAt: Date;
  oldCustomHtml: string;
  newCustomHtml: string;
  /** "target" rows are written; "no-op"/"skip" rows are reported only. */
  decision: RowDecision["kind"];
  skipReason?: SkipReason;
  skipDetail?: string;
  /** Sanitizer audit on the NEW render — non-empty blocks a clean apply. */
  strippedTags: string[];
  strippedAttrs: string[];
  sanitizerStripped: boolean;
  /** NEW-value validation result (design marker / no unresolved / CTA href). */
  validation: NewValueValidation;
}

// ─── Backup / report file shapes ───────────────────────────────────────────────

export interface KajabiBackupEntry {
  landingPageId: string;
  workshopId: string;
  slug: string;
  oldCustomHtml: string;
  oldUpdatedAt: string; // ISO
  oldSha: string;
  newSha: string;
}

export interface KajabiBackupFile {
  kind: "solo-landing-kajabi-backfill";
  runId: string;
  createdAt: string; // ISO
  databaseHost: string;
  /** The OLD global template id targeted (for the rollback inventory). */
  oldGlobalTemplateId: string;
  /** SHA of the new global template customHtml at apply time (rollout window). */
  newGlobalSha: string;
  entries: KajabiBackupEntry[];
}

/** Construct one backup entry from a target plan about to be written. */
export function toKajabiBackupEntry(plan: KajabiRowPlan): KajabiBackupEntry {
  return {
    landingPageId: plan.landingPageId,
    workshopId: plan.workshopId,
    slug: plan.slug,
    oldCustomHtml: plan.oldCustomHtml,
    oldUpdatedAt: plan.oldUpdatedAt.toISOString(),
    oldSha: plan.oldSha,
    newSha: plan.newSha,
  };
}

// ─── Expected-count gate (Task 7) ──────────────────────────────────────────────

export interface ExpectCountResult {
  ok: boolean;
  reason?: string;
}

/**
 * Apply is refused unless the operator-supplied `--expect-count N` exactly
 * matches the number of TARGET rows the dry-run found (claudex R3 / Task 7).
 * `expected === undefined` (flag not passed) FAILS for an apply — the operator
 * MUST assert the count.
 */
export function checkExpectedCount(
  matchedTargets: number,
  expected: number | undefined,
): ExpectCountResult {
  if (expected === undefined) {
    return {
      ok: false,
      reason:
        `--expect-count <N> is required for --apply. The dry-run matched ` +
        `${matchedTargets} target row(s); re-run with --expect-count ${matchedTargets}.`,
    };
  }
  if (expected !== matchedTargets) {
    return {
      ok: false,
      reason:
        `--expect-count ${expected} does NOT match the ${matchedTargets} target row(s) found. ` +
        `Aborting (a drift in target count means the targeting changed under you).`,
    };
  }
  return { ok: true };
}

// ─── Template-update (Script 1) CAS plan ────────────────────────────────────────

export interface TemplateUpdatePlan {
  templateId: string;
  oldSha: string;
  newSha: string;
  oldUpdatedAt: Date;
  oldCustomHtml: string;
  newCustomHtml: string;
  /** True when newSha === oldSha — nothing to do (idempotent). */
  isNoOp: boolean;
}

export interface TemplateBackupFile {
  kind: "solo-landing-template-update";
  runId: string;
  createdAt: string; // ISO
  databaseHost: string;
  templateId: string;
  oldUpdatedAt: string; // ISO
  oldSha: string;
  newSha: string;
  oldCustomHtml: string;
}

/**
 * CAS-guard decision for the template update: refuse to write unless the live
 * row's updatedAt + SHA still match what the operator captured/expects. Returns
 * a decision; the runner performs the actual conditional update.
 */
export interface TemplateCasInput {
  liveUpdatedAt: Date;
  liveSha: string;
  expectedUpdatedAt?: Date;
  expectedOldSha?: string;
}

export interface TemplateCasResult {
  ok: boolean;
  reason?: string;
}

export function checkTemplateCas(input: TemplateCasInput): TemplateCasResult {
  const { liveUpdatedAt, liveSha, expectedUpdatedAt, expectedOldSha } = input;
  if (expectedOldSha !== undefined && liveSha !== expectedOldSha) {
    return {
      ok: false,
      reason:
        `live template SHA ${liveSha.slice(0, 12)}… != expected ${expectedOldSha.slice(0, 12)}… ` +
        `— the template changed since you captured the expected value. Aborting.`,
    };
  }
  if (expectedUpdatedAt !== undefined && liveUpdatedAt.getTime() !== expectedUpdatedAt.getTime()) {
    return {
      ok: false,
      reason:
        `live template updatedAt ${liveUpdatedAt.toISOString()} != expected ` +
        `${expectedUpdatedAt.toISOString()} — concurrent edit. Aborting.`,
    };
  }
  return { ok: true };
}

// ─── CLI flag parsing (shared shape, kajabi-specific flags) ─────────────────────

export const OVERRIDE_FLAG = "--i-know-this-is-prod";

export type Mode = "dry-run" | "apply" | "restore";

export interface KajabiParsedArgs {
  mode: Mode;
  hasOverride: boolean;
  restoreFile?: string;
  /** Path to Script 1's OLD template backup (the expected-old-render source). */
  oldTemplateBackup?: string;
  /** Path to the NEW artifact HTML (default resolved by the CLI wrapper). */
  newTemplate?: string;
  /** Single-page canary by slug. */
  slug?: string;
  /** Batch size cap. */
  limit?: number;
  /** Operator-asserted target count. */
  expectCount?: number;
  /** Per-workshop price exceptions. */
  allowPrice: string[];
}

function readNumberFlag(argv: string[], flag: string): number | undefined {
  const idx = argv.indexOf(flag);
  if (idx < 0) return undefined;
  const raw = argv[idx + 1];
  if (raw === undefined) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

function readStringFlag(argv: string[], flag: string): string | undefined {
  const idx = argv.indexOf(flag);
  if (idx < 0) return undefined;
  return argv[idx + 1];
}

function readRepeatableFlag(argv: string[], flag: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === flag && argv[i + 1] !== undefined) out.push(argv[i + 1]);
  }
  return out;
}

export function parseKajabiArgs(argv: string[]): KajabiParsedArgs {
  const hasOverride = argv.includes(OVERRIDE_FLAG);
  const common = {
    hasOverride,
    oldTemplateBackup: readStringFlag(argv, "--old-template-backup"),
    newTemplate: readStringFlag(argv, "--new-template"),
    slug: readStringFlag(argv, "--slug"),
    limit: readNumberFlag(argv, "--limit"),
    expectCount: readNumberFlag(argv, "--expect-count"),
    allowPrice: readRepeatableFlag(argv, "--allow-price"),
  };

  const restoreIdx = argv.indexOf("--restore");
  if (restoreIdx >= 0) {
    return { mode: "restore", restoreFile: argv[restoreIdx + 1], ...common };
  }
  if (argv.includes("--apply")) {
    return { mode: "apply", ...common };
  }
  return { mode: "dry-run", ...common };
}
