/**
 * rollback-workshop-customhtml-core.ts
 *
 * Pure, side-effect-free planning logic for the per-workshop customHtml bulk
 * rollback ops tool (scripts/rollback-workshop-customhtml.mjs).
 *
 * WHY this exists separately from the CLI script (mirrors
 * backfill-solo-landing-customhtml-core.ts + safe-seed-guard.ts):
 *   - The .mjs CLI wrapper runs under `node` (NOT `tsx`) and is excluded from
 *     the TS build. Jest's testMatch only picks up `.test.ts(x)`.
 *   - Factoring the enumerate/compute/skip decision (`planRollback`) into this
 *     TS module makes it unit-testable with fixtures WITHOUT a live DB and
 *     WITHOUT loading the .mjs entrypoint.
 *   - The .mjs wrapper reimplements `planRollback` inline (plain JS) for the
 *     same node-can't-import-ts reason safe-seed.mjs duplicates checkGuard.
 *     ANY logic change here MUST be mirrored in the .mjs (and vice versa).
 *
 * No imports of `@/lib/db` or anything with side effects — everything here is
 * pure and deterministic.
 *
 * ── Rollback semantics (the load-bearing decision) ──────────────────────────
 * The route (api/workshops/[id]/landing-pages/[template]/route.ts) writes one
 * `AuditLog` row per customHtml change: entityType="LandingPage",
 * action="UPDATE_CUSTOM_HTML", changes = JSON string
 *   { op, template, previousCustomHtml, prevSha, newSha,
 *     newCustomHtmlLength, actorRole, sanitizerStripped }
 * where `previousCustomHtml` is the value BEFORE that write and `newSha` is the
 * sha256 of the value AFTER that write.
 *
 * Given a deployment-window filter (since/until/actor/workshop), for each
 * affected LandingPage we want to undo the WHOLE window — i.e. restore the page
 * to the state it had BEFORE the FIRST in-window change. So the TARGET body is
 * the `previousCustomHtml` of the EARLIEST in-window UPDATE_CUSTOM_HTML row for
 * that page.
 *
 * The value we EXPECT the page to currently hold (the CAS comparand) is the
 * result of the LAST in-window change for that page. We cannot store the full
 * "after" body in the audit row (only its sha), so the EXPECTED comparand is
 * the `previousCustomHtml` of the row IMMEDIATELY AFTER the last in-window row
 * for that page when one exists — otherwise it is the page's CURRENT stored
 * value validated by sha. To stay robust without a full after-body, the CAS is
 * implemented as: compare the sha256 of the page's CURRENT customHtml against
 * the last in-window row's `newSha`. If they differ, the page was edited after
 * the window closed (or rolled forward) → SKIP (diverged), never clobber.
 * Only when the current value's sha matches the last in-window newSha do we
 * restore (CAS keyed on the literal current value so the DB updateMany is
 * value-exact).
 */

import { createHash } from "node:crypto";

/** SHA-256 hex digest of a string (used to detect post-window divergence). */
export function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/**
 * The parsed `changes` JSON shape written by the route's UPDATE_CUSTOM_HTML
 * audit rows. Only the fields the rollback planner reads are typed; extra keys
 * are ignored.
 */
export interface CustomHtmlAuditChanges {
  op?: string;
  template?: string;
  previousCustomHtml?: string | null;
  prevSha?: string;
  newSha?: string;
  newCustomHtmlLength?: number;
  actorRole?: string;
  sanitizerStripped?: boolean;
}

/**
 * A minimal AuditLog row as fetched by the CLI (the planner does not need the
 * full Prisma row). `changes` is the raw JSON STRING exactly as stored.
 */
export interface AuditRowInput {
  id: string;
  entityId: string; // the LandingPage id
  performedBy: string | null;
  timestamp: Date | string;
  changes: string; // JSON string
}

/** The CURRENT state of a LandingPage, keyed by id in the input map. */
export interface CurrentPage {
  id: string;
  workshopId: string;
  template: string;
  customHtml: string | null;
  status?: string | null;
}

/** A page that WILL be restored when run with --apply. */
export interface RestorePlanEntry {
  landingPageId: string;
  workshopId: string;
  template: string;
  /** The value to write back (state before the window began). May be null. */
  targetCustomHtml: string | null;
  /** The exact current value the CAS updateMany must match to write. */
  expectedCurrentCustomHtml: string | null;
  /** Number of in-window audit rows folded into this page's plan. */
  inWindowChangeCount: number;
  firstAuditId: string;
  lastAuditId: string;
}

/** A page that is SKIPPED because its current value diverged from expectation. */
export interface SkippedPlanEntry {
  landingPageId: string;
  workshopId: string;
  template: string;
  reason: "diverged" | "missing-page" | "no-target";
  /** sha of the page's current value (for the report). */
  currentSha: string;
  /** sha the last in-window row says the value should be. */
  expectedSha: string;
  inWindowChangeCount: number;
}

export interface RollbackPlan {
  toRestore: RestorePlanEntry[];
  skippedDiverged: SkippedPlanEntry[];
  /** Total distinct LandingPages touched by the in-window audit rows. */
  totalPages: number;
}

function parseChanges(raw: string): CustomHtmlAuditChanges | null {
  try {
    const obj = JSON.parse(raw);
    return obj && typeof obj === "object" ? (obj as CustomHtmlAuditChanges) : null;
  } catch {
    return null;
  }
}

function toMillis(t: Date | string): number {
  return t instanceof Date ? t.getTime() : new Date(t).getTime();
}

/**
 * Pure planner. Given the in-window UPDATE_CUSTOM_HTML audit rows (already
 * filtered by since/until/actor/workshop at the DB layer) and the CURRENT state
 * of every referenced LandingPage, compute which pages to restore and which to
 * skip as diverged.
 *
 * Algorithm, per affected LandingPage:
 *   1. Sort that page's in-window rows by timestamp ascending.
 *   2. TARGET = previousCustomHtml of the EARLIEST row (state before the window).
 *   3. EXPECTED sha = newSha of the LATEST row (what the page should hold now).
 *   4. Read the page's CURRENT customHtml from currentPagesById.
 *        - page missing            → skip ("missing-page")
 *        - sha(current) !== EXPECTED → skip ("diverged", someone edited it after)
 *        - else                    → restore (CAS on the literal current value).
 *   5. A page whose earliest row has no usable target (undefined) is skipped
 *      ("no-target") rather than guessed.
 *
 * Returns the plan; writes nothing. The CLI applies it (or prints it on dry-run).
 */
export function planRollback(
  auditRows: AuditRowInput[],
  currentPagesById: Map<string, CurrentPage> | Record<string, CurrentPage>
): RollbackPlan {
  const pageMap: Map<string, CurrentPage> =
    currentPagesById instanceof Map
      ? currentPagesById
      : new Map(Object.entries(currentPagesById));

  // Group rows by LandingPage (entityId).
  const byPage = new Map<string, AuditRowInput[]>();
  for (const row of auditRows) {
    const list = byPage.get(row.entityId);
    if (list) list.push(row);
    else byPage.set(row.entityId, [row]);
  }

  const toRestore: RestorePlanEntry[] = [];
  const skippedDiverged: SkippedPlanEntry[] = [];

  for (const [pageId, rows] of byPage) {
    // Sort ascending by timestamp; stable on id for deterministic ties.
    const sorted = [...rows].sort((a, b) => {
      const d = toMillis(a.timestamp) - toMillis(b.timestamp);
      return d !== 0 ? d : a.id.localeCompare(b.id);
    });

    const earliest = sorted[0];
    const latest = sorted[sorted.length - 1];
    const earliestChanges = parseChanges(earliest.changes);
    const latestChanges = parseChanges(latest.changes);

    const current = pageMap.get(pageId);
    const template = current?.template ?? latestChanges?.template ?? earliestChanges?.template ?? "";
    const workshopId = current?.workshopId ?? "";

    // The state before the window began.
    const target =
      earliestChanges && "previousCustomHtml" in earliestChanges
        ? earliestChanges.previousCustomHtml ?? null
        : undefined;

    // The sha the page SHOULD currently hold (result of the last in-window write).
    const expectedSha = latestChanges?.newSha ?? "";

    if (target === undefined) {
      skippedDiverged.push({
        landingPageId: pageId,
        workshopId,
        template,
        reason: "no-target",
        currentSha: current ? sha256(current.customHtml ?? "") : "",
        expectedSha,
        inWindowChangeCount: sorted.length,
      });
      continue;
    }

    if (!current) {
      skippedDiverged.push({
        landingPageId: pageId,
        workshopId,
        template,
        reason: "missing-page",
        currentSha: "",
        expectedSha,
        inWindowChangeCount: sorted.length,
      });
      continue;
    }

    const currentValue = current.customHtml ?? null;
    const currentSha = sha256(currentValue ?? "");

    // CAS comparand: the page must currently hold what the last in-window write
    // produced. If it doesn't, someone edited it after the window → skip.
    if (currentSha !== expectedSha) {
      skippedDiverged.push({
        landingPageId: pageId,
        workshopId,
        template,
        reason: "diverged",
        currentSha,
        expectedSha,
        inWindowChangeCount: sorted.length,
      });
      continue;
    }

    toRestore.push({
      landingPageId: pageId,
      workshopId,
      template,
      targetCustomHtml: target,
      expectedCurrentCustomHtml: currentValue,
      inWindowChangeCount: sorted.length,
      firstAuditId: earliest.id,
      lastAuditId: latest.id,
    });
  }

  return {
    toRestore,
    skippedDiverged,
    totalPages: byPage.size,
  };
}

// ─── CLI arg parsing (pure) ─────────────────────────────────────────────────

export interface ParsedRollbackArgs {
  since?: string;
  until?: string;
  actor?: string;
  workshop?: string;
  apply: boolean;
  hasOverride: boolean;
  help: boolean;
}

/**
 * Parse the rollback CLI argv (no I/O). The prod-override flag matches the
 * existing scripts' convention (safe-seed.mjs OVERRIDE_FLAG).
 */
export function parseRollbackArgs(argv: string[], overrideFlag: string): ParsedRollbackArgs {
  const out: ParsedRollbackArgs = {
    apply: false,
    hasOverride: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case "--apply":
        out.apply = true;
        break;
      case overrideFlag:
        out.hasOverride = true;
        break;
      case "--help":
      case "-h":
        out.help = true;
        break;
      case "--since":
        out.since = argv[++i];
        break;
      case "--until":
        out.until = argv[++i];
        break;
      case "--actor":
        out.actor = argv[++i];
        break;
      case "--workshop":
        out.workshop = argv[++i];
        break;
      default:
        // Allow --key=value form too.
        if (a.startsWith("--since=")) out.since = a.slice("--since=".length);
        else if (a.startsWith("--until=")) out.until = a.slice("--until=".length);
        else if (a.startsWith("--actor=")) out.actor = a.slice("--actor=".length);
        else if (a.startsWith("--workshop=")) out.workshop = a.slice("--workshop=".length);
        break;
    }
  }
  return out;
}
