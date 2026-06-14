#!/usr/bin/env node
/**
 * rollback-workshop-customhtml.mjs  (Wave B, Task 6 — R3-HIGH-2)
 *
 * DRY-RUN-BY-DEFAULT, prod-guarded bulk rollback of per-workshop
 * LandingPage.customHtml edits made during a bad deployment window.
 *
 * ── What it does ────────────────────────────────────────────────────────────
 * Enumerates `AuditLog` rows
 *   { entityType: "LandingPage", action: "UPDATE_CUSTOM_HTML" }
 * filtered by an optional deployment window (--since / --until), --actor, and
 * --workshop, ordered by timestamp. For each affected LandingPage it restores
 * the page to the state it had BEFORE the FIRST in-window change — i.e. the
 * `previousCustomHtml` from the EARLIEST in-window UPDATE_CUSTOM_HTML row for
 * that page (the state before the bad window began).
 *
 * VALUE-COMPARE CAS: a page is only restored if its CURRENT `customHtml` still
 * equals what the LAST in-window write produced (matched by sha256 against that
 * row's `newSha`). Any page whose current value has DIVERGED (someone edited it
 * after the window) is SKIPPED and reported — never clobbered.
 *
 * ── Safety ──────────────────────────────────────────────────────────────────
 *   • DRY RUN is the DEFAULT. Without --apply NOTHING is written — it prints the
 *     plan (pages it would restore, pages it would skip) and exits.
 *   • PROD GUARD: refuses to run against a Neon/prod DATABASE_URL host unless
 *     --i-know-this-is-prod is passed (reuses the safe-seed.mjs guard exactly).
 *     The guard is enforced for --apply; dry-run may connect read-only.
 *   • CAS SKIP on diverged pages (see above).
 *   • On --apply, writes ONE summary AuditLog row
 *     (action: "ROLLBACK_CUSTOM_HTML_BATCH") recording counts
 *     (restored / skipped-diverged / total) + the filter used.
 *
 * ── Single-level note (Q7) ──────────────────────────────────────────────────
 * Restore is single-level: the audit rows store only `previousCustomHtml` (the
 * value before each write) + shas — not the full "after" body. The target is
 * the earliest in-window `previousCustomHtml`; the CAS comparand is sha-matched
 * to the latest in-window `newSha`. This is intentional (see the runbook,
 * docs/specs/v7.6/17b-ops-runbook.md, §Retention).
 *
 * ── Code-sync note ──────────────────────────────────────────────────────────
 * The PURE planner is reimplemented inline below in plain JS because this .mjs
 * runs under `node` (not tsx) and cannot import the TypeScript canonical source
 * src/lib/scripts/rollback-workshop-customhtml-core.ts. The canonical TS module
 * is what Jest tests (planRollback / parseRollbackArgs). ANY logic change here
 * MUST be mirrored there and vice versa. The prod-host guard is IMPORTED from
 * safe-seed.mjs (no duplication of guard logic).
 *
 * ── Usage ────────────────────────────────────────────────────────────────────
 *   cd src
 *   # dry run (default — no writes), whole UPDATE_CUSTOM_HTML history:
 *   node scripts/rollback-workshop-customhtml.mjs
 *   # window + actor filter, dry run:
 *   node scripts/rollback-workshop-customhtml.mjs --since 2026-06-12T00:00:00Z --until 2026-06-13T00:00:00Z --actor admin@x.com
 *   # single workshop:
 *   node scripts/rollback-workshop-customhtml.mjs --workshop ws_123
 *   # APPLY (writes) — prod requires the explicit ack:
 *   node scripts/rollback-workshop-customhtml.mjs --since ... --apply --i-know-this-is-prod
 *
 * Exit codes:
 *   0  dry-run completed, or apply completed.
 *   1  prod guard rejected / bad args / runtime error.
 */

import { createHash } from "node:crypto";
import { OVERRIDE_FLAG, checkGuard, parseHost } from "./safe-seed.mjs";

const AUDIT_ENTITY_TYPE = "LandingPage";
const AUDIT_ACTION = "UPDATE_CUSTOM_HTML";
const SUMMARY_ACTION = "ROLLBACK_CUSTOM_HTML_BATCH";

// ─── Pure helpers (mirror src/lib/scripts/rollback-workshop-customhtml-core.ts) ─

function sha256(value) {
  return createHash("sha256").update(value ?? "", "utf8").digest("hex");
}

function parseChanges(raw) {
  try {
    const obj = JSON.parse(raw);
    return obj && typeof obj === "object" ? obj : null;
  } catch {
    return null;
  }
}

function toMillis(t) {
  return t instanceof Date ? t.getTime() : new Date(t).getTime();
}

/**
 * Pure planner — see the TS canonical source for the full contract.
 * @param {Array<{id:string,entityId:string,performedBy:string|null,timestamp:Date|string,changes:string}>} auditRows
 * @param {Map<string,{id:string,workshopId:string,template:string,customHtml:string|null,status?:string|null}>} currentPagesById
 * @returns {{toRestore:Array,skippedDiverged:Array,totalPages:number}}
 */
function planRollback(auditRows, currentPagesById) {
  const pageMap =
    currentPagesById instanceof Map
      ? currentPagesById
      : new Map(Object.entries(currentPagesById));

  const byPage = new Map();
  for (const row of auditRows) {
    const list = byPage.get(row.entityId);
    if (list) list.push(row);
    else byPage.set(row.entityId, [row]);
  }

  const toRestore = [];
  const skippedDiverged = [];

  for (const [pageId, rows] of byPage) {
    const sorted = [...rows].sort((a, b) => {
      const d = toMillis(a.timestamp) - toMillis(b.timestamp);
      return d !== 0 ? d : a.id.localeCompare(b.id);
    });

    const earliest = sorted[0];
    const latest = sorted[sorted.length - 1];
    const earliestChanges = parseChanges(earliest.changes);
    const latestChanges = parseChanges(latest.changes);

    const current = pageMap.get(pageId);
    const template =
      current?.template ?? latestChanges?.template ?? earliestChanges?.template ?? "";
    const workshopId = current?.workshopId ?? "";

    const target =
      earliestChanges && "previousCustomHtml" in earliestChanges
        ? earliestChanges.previousCustomHtml ?? null
        : undefined;
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

  return { toRestore, skippedDiverged, totalPages: byPage.size };
}

function parseRollbackArgs(argv, overrideFlag) {
  const out = { apply: false, hasOverride: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--apply") out.apply = true;
    else if (a === overrideFlag) out.hasOverride = true;
    else if (a === "--help" || a === "-h") out.help = true;
    else if (a === "--since") out.since = argv[++i];
    else if (a === "--until") out.until = argv[++i];
    else if (a === "--actor") out.actor = argv[++i];
    else if (a === "--workshop") out.workshop = argv[++i];
    else if (a.startsWith("--since=")) out.since = a.slice("--since=".length);
    else if (a.startsWith("--until=")) out.until = a.slice("--until=".length);
    else if (a.startsWith("--actor=")) out.actor = a.slice("--actor=".length);
    else if (a.startsWith("--workshop=")) out.workshop = a.slice("--workshop=".length);
  }
  return out;
}

// ─── CLI ─────────────────────────────────────────────────────────────────────

const USAGE = `
rollback-workshop-customhtml.mjs — bulk roll back per-workshop customHtml edits.

DRY RUN BY DEFAULT. Pass --apply to write. Prod requires ${OVERRIDE_FLAG}.

  --since <ISO>        only audit rows at/after this timestamp
  --until <ISO>        only audit rows at/before this timestamp
  --actor <email>      only edits performed by this actor (performedBy)
  --workshop <id>      only LandingPages belonging to this workshop id
  --apply              actually write (default: dry run, no writes)
  ${OVERRIDE_FLAG}  required to run against a Neon/prod host
  -h, --help           show this help

Per affected page: restores the state BEFORE the first in-window edit; SKIPS any
page whose current value has diverged from the last in-window edit (CAS). On
--apply, writes one ${SUMMARY_ACTION} audit row with the counts + filter.
`;

function printPlan(plan, args) {
  console.log("\n── Rollback plan ────────────────────────────────────────");
  console.log(
    `Filter: since=${args.since ?? "(none)"} until=${args.until ?? "(none)"} ` +
      `actor=${args.actor ?? "(any)"} workshop=${args.workshop ?? "(any)"}`
  );
  console.log(
    `Pages touched in window: ${plan.totalPages}  ` +
      `→ restore: ${plan.toRestore.length}  skip: ${plan.skippedDiverged.length}`
  );

  if (plan.toRestore.length) {
    console.log("\nWILL RESTORE:");
    for (const r of plan.toRestore) {
      console.log(
        `  • page=${r.landingPageId} workshop=${r.workshopId} template=${r.template} ` +
          `(${r.inWindowChangeCount} in-window edit(s)) → ` +
          `${r.targetCustomHtml === null ? "<null/clear>" : `${r.targetCustomHtml.length} chars`}`
      );
    }
  }
  if (plan.skippedDiverged.length) {
    console.log("\nWILL SKIP:");
    for (const s of plan.skippedDiverged) {
      console.log(
        `  • page=${s.landingPageId} workshop=${s.workshopId} template=${s.template} ` +
          `reason=${s.reason} currentSha=${s.currentSha.slice(0, 12)}… ` +
          `expectedSha=${s.expectedSha.slice(0, 12)}…`
      );
    }
  }
  console.log("\n─────────────────────────────────────────────────────────");
}

async function main() {
  const args = parseRollbackArgs(process.argv.slice(2), OVERRIDE_FLAG);

  if (args.help) {
    console.log(USAGE);
    process.exit(0);
  }

  const url = process.env.DATABASE_URL ?? "";
  const host = parseHost(url);
  const expectedHost = process.env.ASSESSMENT_PROD_EXPECTED_HOST;

  console.log(
    `rollback-workshop-customhtml — mode=${args.apply ? "APPLY" : "dry-run"} ` +
      `host=${host || "(none)"}`
  );

  // Prod guard applies to WRITE (--apply) only; dry-run may connect read-only.
  if (args.apply) {
    const decision = checkGuard({ url, expectedHost, hasOverride: args.hasOverride });
    if (!decision.allowed) {
      console.error(`\n❌ BLOCKED — prod guard refused (--apply).\n`);
      // The shared guard's reason is written for safe-seed.mjs; print THIS
      // script's actionable re-run hint, then the guard's reason as detail.
      console.error(
        `  Refusing to modify production without explicit confirmation.\n` +
          `  Re-run with: node scripts/rollback-workshop-customhtml.mjs ` +
          `<your filters> --apply ${OVERRIDE_FLAG}\n`
      );
      console.error(`  Detail: ${decision.reason}\n`);
      process.exit(1);
    }
  }

  // Lazy-import Prisma only after the guard so --help never touches the DB.
  const { PrismaClient } = await import("@prisma/client");
  const db = new PrismaClient();

  try {
    // Build the audit-row filter from CLI args.
    const where = { entityType: AUDIT_ENTITY_TYPE, action: AUDIT_ACTION };
    if (args.actor) where.performedBy = args.actor;
    if (args.since || args.until) {
      where.timestamp = {};
      if (args.since) where.timestamp.gte = new Date(args.since);
      if (args.until) where.timestamp.lte = new Date(args.until);
    }
    // --workshop: scope to that workshop's LandingPage ids.
    if (args.workshop) {
      const pages = await db.landingPage.findMany({
        where: { workshopId: args.workshop },
        select: { id: true },
      });
      where.entityId = { in: pages.map((p) => p.id) };
    }

    const auditRows = await db.auditLog.findMany({
      where,
      orderBy: { timestamp: "asc" },
      select: {
        id: true,
        entityId: true,
        performedBy: true,
        timestamp: true,
        changes: true,
      },
    });

    if (auditRows.length === 0) {
      console.log("\nNo UPDATE_CUSTOM_HTML audit rows match the filter. Nothing to do.");
      return;
    }

    // Fetch CURRENT state of every referenced LandingPage.
    const pageIds = [...new Set(auditRows.map((r) => r.entityId))];
    const pages = await db.landingPage.findMany({
      where: { id: { in: pageIds } },
      select: { id: true, workshopId: true, template: true, customHtml: true, status: true },
    });
    const currentPagesById = new Map(pages.map((p) => [p.id, p]));

    const plan = planRollback(auditRows, currentPagesById);
    printPlan(plan, args);

    if (!args.apply) {
      console.log(
        "\nDRY RUN — no writes. Re-run with --apply " +
          `(${OVERRIDE_FLAG} for prod) to perform the rollback.`
      );
      return;
    }

    if (plan.toRestore.length === 0) {
      console.log("\nNothing to restore (every matched page was a skip). No writes.");
      return;
    }

    // APPLY: per-page value-compare CAS updateMany, then ONE summary audit row.
    let restored = 0;
    let casAborted = 0;
    const restoredPageIds = [];
    for (const r of plan.toRestore) {
      const res = await db.landingPage.updateMany({
        where: { id: r.landingPageId, customHtml: r.expectedCurrentCustomHtml },
        data: { customHtml: r.targetCustomHtml, updatedAt: new Date() },
      });
      if (res.count === 1) {
        restored += 1;
        restoredPageIds.push(r.landingPageId);
      } else {
        // Lost the race between plan + apply — treat as a diverged skip.
        casAborted += 1;
        plan.skippedDiverged.push({
          landingPageId: r.landingPageId,
          workshopId: r.workshopId,
          template: r.template,
          reason: "diverged",
          currentSha: "(changed during apply)",
          expectedSha: "",
          inWindowChangeCount: r.inWindowChangeCount,
        });
      }
    }

    const summaryChanges = {
      op: "rollback-batch",
      filter: {
        since: args.since ?? null,
        until: args.until ?? null,
        actor: args.actor ?? null,
        workshop: args.workshop ?? null,
      },
      totalPages: plan.totalPages,
      restored,
      skippedDiverged: plan.skippedDiverged.length,
      casAbortedDuringApply: casAborted,
      restoredPageIds,
    };

    await db.auditLog.create({
      data: {
        entityType: AUDIT_ENTITY_TYPE,
        action: SUMMARY_ACTION,
        performedBy: process.env.ROLLBACK_ACTOR ?? "SCRIPT:rollback-workshop-customhtml",
        // entityId is batch-level — there is no single page; use a sentinel.
        entityId: "BATCH",
        changes: JSON.stringify(summaryChanges),
      },
    });

    console.log(
      `\nAPPLIED: ${restored} restored, ${plan.skippedDiverged.length} skipped ` +
        `(of ${plan.totalPages} pages). Summary audit row written (${SUMMARY_ACTION}).`
    );
  } finally {
    await db.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
