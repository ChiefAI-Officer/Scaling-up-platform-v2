/**
 * backfill-solo-landing-customhtml.ts
 *
 * One-off, guarded, side-effect-free backfill of EXISTING SOLO_LANDING
 * LandingPage.customHtml snapshots.
 *
 * ── Why ───────────────────────────────────────────────────────────────────
 * We swapped the Solo Landing header logo (old CSS-quadrant `.su-mark-q`
 * block → an inline `data:image/svg+xml;base64` <img>) and made
 * `buildWorkshopVariables` emit a zoned `event_time` token. The PUBLIC render
 * reads the per-build SNAPSHOT `LandingPage.customHtml`, and `runAutoBuild`
 * skips already-built pages — so existing SOLO_LANDING pages keep BOTH the old
 * logo AND a now-dead literal `{{event_time}}` token. This script refreshes
 * those frozen snapshots.
 *
 * Re-running `runAutoBuild` is NOT acceptable: it can re-send the
 * "Workshop Ready" email (workshopBuiltEmailSentAt guard), reassigns workflows,
 * and flips workshop status. This script does ONLY a targeted content update.
 *
 * ── Approach: re-interpolation (not string-replace) ─────────────────────────
 * For each target row we RE-INTERPOLATE the CURRENT prod
 * `PageTemplate.customHtml` for that template, reusing auto-build's exact
 * pipeline:
 *     buildWorkshopVariables(workshopId)          (zoned event_time, etc.)
 *   → enrichedVars (+ registration_url / registrationUrl, two-pass)
 *   → interpolateContentForHtml(...)              (HTML-escapes every var)
 *   → sanitizeCustomHtml(..., { allowTokenUris: false })  (strict re-sanitize)
 * This refreshes the logo AND resolves the zoned {{event_time}} in one shot.
 *
 * NOTE on reusing auto-build internals: runAutoBuild() does NOT expose a
 * standalone "build one page's customHtml" function — the interpolate+sanitize
 * step is inlined inside buildOnePage(), and the surrounding function has the
 * exact side effects (email, workflows, status flip) we must avoid. So we
 * REPLICATE the minimal pipeline here, importing the SAME library functions
 * auto-build uses (buildWorkshopVariables / interpolateContentForHtml /
 * sanitizeCustomHtml) and reconstructing enrichedVars the same way (the
 * `registration_url` two-pass uses the EXISTING REGISTRATION LandingPage slug,
 * which is what the original build used). If auto-build's pipeline changes,
 * this replication must be kept in sync (documented here intentionally).
 *
 * ── Modes ───────────────────────────────────────────────────────────────────
 *   --dry-run   (DEFAULT, no writes) — per-row: ids, old→new SHA, sanitizer
 *               strippedTags/strippedAttrs, presence of new <img> + resolved
 *               time. Summarises counts.
 *   --apply     write new customHtml. Per row: back up old value first, then
 *               compare-and-swap on updatedAt (update where { id, updatedAt }).
 *               0 rows updated (concurrent edit) → SKIP + log, never clobber.
 *   --restore <backupFile>  read the JSON backup, restore each row's
 *               customHtml (CAS-guarded against the recorded post-write state
 *               where possible).
 *
 * ── Prod guard ───────────────────────────────────────────────────────────────
 * --apply / --restore against a Neon/prod host are REFUSED unless
 * --i-know-this-is-prod is passed (reuses the safe-seed guard). --dry-run may
 * connect read-only without the flag.
 *
 * ── Usage ────────────────────────────────────────────────────────────────────
 *   cd src
 *   npx tsx scripts/backfill-solo-landing-customhtml.ts                 # dry-run
 *   npx tsx scripts/backfill-solo-landing-customhtml.ts --apply --i-know-this-is-prod
 *   npx tsx scripts/backfill-solo-landing-customhtml.ts --restore .snapshots/<file>.json --i-know-this-is-prod
 *
 * Backup file: src/.snapshots/backfill-solo-landing-customhtml-<ISO>.json
 *   { kind, createdAt, databaseHost, entries: [{ landingPageId, workshopId,
 *     oldCustomHtml, oldUpdatedAt, oldSha, newSha }] }
 */

import { config as loadEnv } from "dotenv";
import { join } from "node:path";

// Load env files BEFORE importing PrismaClient (Prisma reads DATABASE_URL on
// import). dotenv does not overwrite already-set vars, so a shell-exported
// DATABASE_URL wins. Mirrors snapshot-prod-tables.ts.
const SRC_DIR = join(__dirname, "..");
loadEnv({ path: join(SRC_DIR, ".env.production.local") });
loadEnv({ path: join(SRC_DIR, ".env.local") });
loadEnv({ path: join(SRC_DIR, ".env") });

import { PrismaClient } from "@prisma/client";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";

import { checkGuard, parseHost } from "../src/lib/scripts/safe-seed-guard";
import {
  buildWorkshopVariables,
} from "../src/lib/templates/template-interpolation";
import { interpolateContentForHtml } from "../src/lib/templates/interpolate-content-html";
import { sanitizeCustomHtml } from "../src/lib/templates/sanitize-custom-html";
import {
  toBackupEntry,
  parseArgs,
  type RowPlan,
  type BackupFile,
} from "../src/lib/scripts/backfill-solo-landing-customhtml-core";
import {
  buildPlans as buildPlansRunner,
  applyPlans as applyPlansRunner,
  restoreFromBackup as restoreFromBackupRunner,
  type DbClient,
  type SanitizeOutcome,
} from "../src/lib/scripts/backfill-solo-landing-customhtml-runner";

const db = new PrismaClient();
const SNAPSHOT_DIR = join(SRC_DIR, ".snapshots");

// ─── Re-interpolation (mirrors auto-build-service buildOnePage) ──────────────

/**
 * Re-interpolate a SOLO_LANDING PageTemplate.customHtml for a given workshop,
 * exactly as auto-build would: enrichedVars (with registration_url two-pass
 * from the EXISTING REGISTRATION LandingPage slug) → interpolate → strict
 * sanitize. Returns the sanitized string + the sanitizer audit.
 */
async function reinterpolateCustomHtml(
  workshopId: string,
  templateCustomHtml: string,
): Promise<SanitizeOutcome | null> {
  const variables = await buildWorkshopVariables(workshopId);
  if (!variables) return null;

  // registration_url two-pass: auto-build builds REGISTRATION first and uses
  // its slug. The page already exists (this is a refresh), so we read the
  // stored REGISTRATION slug — the same value the original build embedded.
  const existingReg = await db.landingPage.findUnique({
    where: {
      workshopId_template: { workshopId, template: "REGISTRATION" },
    },
    select: { slug: true },
  });
  const registrationUrl = existingReg?.slug
    ? `${process.env.APP_URL}/workshop/${existingReg.slug}`
    : "";

  const enrichedVars: Record<string, string | null | undefined> = {
    ...variables,
    registration_url: registrationUrl,
    registrationUrl,
  };

  const interpolated = interpolateContentForHtml(templateCustomHtml, enrichedVars);
  const { sanitized, strippedTags, strippedAttrs } = sanitizeCustomHtml(interpolated, {
    allowTokenUris: false,
  });
  return { sanitized, strippedTags, strippedAttrs };
}

// ─── Plan builder ────────────────────────────────────────────────────────────

/**
 * Find SOLO_LANDING LandingPages needing refresh + compute new values.
 * Delegates to the tested runner, wiring the real Prisma client + the
 * real interpolate/sanitize pipeline (reinterpolateCustomHtml).
 */
async function buildPlans(): Promise<RowPlan[]> {
  return buildPlansRunner(db as unknown as DbClient, reinterpolateCustomHtml);
}

// ─── Reporting ───────────────────────────────────────────────────────────────

function printPlanReport(plans: RowPlan[]): void {
  console.log("\n── Per-row plan ──────────────────────────────────────────");
  for (const p of plans) {
    const flag = p.isNoOp ? "NO-OP" : "CHANGE";
    console.log(
      `\n[${flag}] landingPage=${p.landingPageId} workshop=${p.workshopId}`,
    );
    console.log(`  oldSha=${p.oldSha.slice(0, 16)}…  newSha=${p.newSha.slice(0, 16)}…`);
    console.log(
      `  sanitizer: strippedTags=[${p.strippedTags.join(", ")}] strippedAttrs=[${p.strippedAttrs.join(", ")}]`,
    );
    console.log(
      `  new <img data-URI> present: ${p.checks.hasNewLogo}  ` +
        `event_time resolved: ${p.checks.eventTimeResolved}  ` +
        `old logo gone: ${!p.checks.stillHasOldLogo}`,
    );
    if (p.sanitizerStripped) {
      console.warn(`  ⚠ sanitizer stripped content — investigate before --apply`);
    }
    if (!p.checks.hasNewLogo || !p.checks.eventTimeResolved || p.checks.stillHasOldLogo) {
      console.warn(`  ⚠ new value did not fully satisfy the refresh checks`);
    }
  }
  console.log("\n──────────────────────────────────────────────────────────");
}

function printSummary(plans: RowPlan[]): void {
  const changes = plans.filter((p) => !p.isNoOp);
  const noops = plans.filter((p) => p.isNoOp);
  const stripped = plans.filter((p) => p.sanitizerStripped);
  console.log(
    `\nSummary: ${plans.length} target rows — ${changes.length} change, ${noops.length} no-op` +
      (stripped.length ? `, ${stripped.length} with sanitizer strips (BLOCK)` : ""),
  );
}

// ─── Apply ───────────────────────────────────────────────────────────────────

async function writeBackup(host: string, plans: RowPlan[]): Promise<string> {
  if (!existsSync(SNAPSHOT_DIR)) await mkdir(SNAPSHOT_DIR, { recursive: true });
  const iso = new Date().toISOString().replace(/[:.]/g, "-");
  const file = join(SNAPSHOT_DIR, `backfill-solo-landing-customhtml-${iso}.json`);
  const backup: BackupFile = {
    kind: "solo-landing-customhtml-backfill",
    createdAt: new Date().toISOString(),
    databaseHost: host,
    entries: plans.map(toBackupEntry),
  };
  await writeFile(file, JSON.stringify(backup, null, 2), "utf8");
  return file;
}

async function applyPlans(plans: RowPlan[], host: string): Promise<void> {
  const result = await applyPlansRunner(db as unknown as DbClient, plans, {
    writeBackup: (changes) => writeBackup(host, changes),
  });

  if (result.blocked > 0) {
    console.error(
      `❌ Refusing to apply — ${result.blocked} row(s) had sanitizer strips ` +
        `(strippedTags/strippedAttrs non-empty). Investigate first.`,
    );
    for (const b of plans.filter((p) => !p.isNoOp && p.sanitizerStripped)) {
      console.error(
        `   landingPage=${b.landingPageId} tags=[${b.strippedTags.join(",")}] attrs=[${b.strippedAttrs.join(",")}]`,
      );
    }
    process.exitCode = 1;
    return;
  }

  if (!result.backupFile) {
    console.log("Nothing to apply (all target rows are no-ops).");
    return;
  }

  console.log(`Backup written: ${result.backupFile}`);
  console.log(`\nApplied: ${result.updated} updated, ${result.skipped} skipped (CAS abort).`);
  console.log(`Restore with: --restore ${result.backupFile} --i-know-this-is-prod`);
}

// ─── Restore ─────────────────────────────────────────────────────────────────

async function restoreFromBackup(file: string): Promise<void> {
  const raw = await readFile(file, "utf8");
  const backup = JSON.parse(raw) as BackupFile;
  const result = await restoreFromBackupRunner(db as unknown as DbClient, backup);
  console.log(`\nRestore: ${result.restored} restored, ${result.skipped} skipped.`);
}

// ─── main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const { mode, hasOverride, restoreFile } = parseArgs(process.argv.slice(2));
  const url = process.env.DATABASE_URL ?? "";
  const host = parseHost(url);
  const expectedHost = process.env.ASSESSMENT_PROD_EXPECTED_HOST;

  console.log(`backfill-solo-landing-customhtml — mode=${mode}  host=${host || "(none)"}`);

  // Prod guard applies to WRITE modes only. Dry-run may connect read-only.
  if (mode === "apply" || mode === "restore") {
    const decision = checkGuard({ url, expectedHost, hasOverride });
    if (!decision.allowed) {
      console.error(`\n❌ BLOCKED — prod guard refused (${mode}).\n`);
      console.error(`  ${decision.reason}\n`);
      process.exitCode = 1;
      return;
    }
  }

  if (mode === "restore") {
    if (!restoreFile) {
      console.error("Usage: --restore <backupFile.json> --i-know-this-is-prod");
      process.exitCode = 1;
      return;
    }
    await restoreFromBackup(restoreFile);
    return;
  }

  const plans = await buildPlans();
  if (plans.length === 0) {
    console.log("No SOLO_LANDING rows need a refresh. Nothing to do.");
    return;
  }

  printPlanReport(plans);
  printSummary(plans);

  if (mode === "dry-run") {
    console.log("\nDRY RUN — no writes. Re-run with --apply --i-know-this-is-prod to apply.");
    return;
  }

  await applyPlans(plans, host);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
