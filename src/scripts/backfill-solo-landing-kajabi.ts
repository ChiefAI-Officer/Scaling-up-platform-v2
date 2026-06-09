/**
 * backfill-solo-landing-kajabi.ts  [Tasks 7–13]
 *
 * Script 2 of the GLOBAL SOLO_LANDING Kajabi rollout: a guarded, canary-first,
 * audited, reversible backfill of the EXISTING per-workshop SOLO_LANDING
 * LandingPage.customHtml snapshots from the OLD global design to the NEW Kajabi
 * design.
 *
 * ── TARGETING (the #1 thing to get right; claudex R2-High1 / R3-High1) ────────
 * `LandingPage.customHtml` is the INTERPOLATED per-workshop snapshot, so it will
 * NEVER equal the RAW PageTemplate.customHtml hash. We therefore do NOT gate on
 * a shared raw-template hash. Instead, for each candidate SOLO_LANDING page:
 *   1. re-interpolate the BACKED-UP OLD global template
 *      (--old-template-backup <Script-1 backup>) with THIS workshop's
 *      buildWorkshopVariables + REGISTRATION slug (the SAME two-pass auto-build
 *      uses), strict-sanitize → expectedOldRender;
 *   2. re-interpolate the NEW artifact (--new-template <path>, default the
 *      docs/specs artifact — explicit, NOT "current active template") the same
 *      way → newRender;
 *   3. SHA(currentCustomHtml) == SHA(newRender) → NO-OP (already migrated);
 *      SHA(currentCustomHtml) == SHA(expectedOldRender) → TARGET;
 *      anything else → SKIP + log (bespoke / category / hand-edited — never clobber).
 *   Also: if sourceTemplateId is set and != the old global template id → SKIP.
 *
 * ── PREFLIGHTS on each TARGET (skip + flag if any fail) ─────────────────────────
 *   - coach photo: coach.profileImage non-empty (Task 7);
 *   - CTA (Task 8): registration_url is absolute https on the expected prod host
 *     AND the slug belongs to a PUBLISHED REGISTRATION page for the same workshop;
 *   - price (Task 9): rendered {{price}} not TBD/Free unless --allow-price <wsId>;
 *   - new-value validity: contains data-su-mc, NO unresolved {{, non-empty CTA href.
 *
 * ── EXPECTED-COUNT GATE (Task 7) ────────────────────────────────────────────────
 * --apply requires --expect-count N exactly == the dry-run TARGET count, else abort.
 *
 * ── CANARY + BATCH (Task 11) ────────────────────────────────────────────────────
 * --slug <slug> (single page) and --limit <N> (batch the candidate scan).
 *
 * ── AUDIT + REPORTS + BACKUP + CAS + RESTORE (Tasks 10/12/13) ────────────────────
 * Every apply/restore writes an AuditLog row + a JSON report under src/.snapshots/.
 * Backup-before-write; CAS-on-updatedAt; --restore <backup> CAS-restores rows.
 * The backup records oldGlobalTemplateId + newGlobalSha for the rollback window.
 *
 * ── Usage ──────────────────────────────────────────────────────────────────────
 *   cd src
 *   npx tsx scripts/backfill-solo-landing-kajabi.ts \
 *     --old-template-backup .snapshots/solo-landing-template-update-<ISO>.json   # dry-run
 *   ... --slug <canarySlug>                                                       # canary dry-run
 *   ... --slug <canarySlug> --expect-count 1 --apply --i-know-this-is-prod        # canary apply
 *   ... --expect-count <N> --apply --i-know-this-is-prod                          # full apply
 *   ... --restore .snapshots/solo-landing-kajabi-backfill-<ISO>.json --i-know-this-is-prod
 *   ... --inventory                                                               # rollout-window list
 */

import { config as loadEnv } from "dotenv";
import { join } from "node:path";

const SRC_DIR = join(__dirname, "..");
const REPO_ROOT = join(SRC_DIR, "..");
loadEnv({ path: join(SRC_DIR, ".env.production.local") });
loadEnv({ path: join(SRC_DIR, ".env.local") });
loadEnv({ path: join(SRC_DIR, ".env") });

import { PrismaClient } from "@prisma/client";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";

import { checkGuard, parseHost } from "../src/lib/scripts/safe-seed-guard";
import { buildWorkshopVariables } from "../src/lib/templates/template-interpolation";
import { interpolateContentForHtml } from "../src/lib/templates/interpolate-content-html";
import { sanitizeCustomHtml } from "../src/lib/templates/sanitize-custom-html";
import {
  parseKajabiArgs,
  checkExpectedCount,
  toKajabiBackupEntry,
  NEW_DESIGN_MARKER,
  type KajabiRowPlan,
  type KajabiBackupFile,
  type TemplateBackupFile,
} from "../src/lib/scripts/solo-landing-kajabi-core";
import {
  buildBackfillPlans,
  applyBackfillPlans,
  restoreBackfill,
  inventorySoloPages,
  type DbClient,
  type SanitizeOutcome,
  type WorkshopFacts,
} from "../src/lib/scripts/solo-landing-kajabi-runner";

const db = new PrismaClient();
const SNAPSHOT_DIR = join(SRC_DIR, ".snapshots");
const DEFAULT_ARTIFACT = join(REPO_ROOT, "docs/specs/master-class-landing-kajabi.html");

// ─── Per-workshop renders + facts (the real pipeline, injected into the runner) ──

/**
 * Re-interpolate a template's customHtml for a workshop, exactly as auto-build's
 * Pass 2 does: buildWorkshopVariables → enrichedVars (+ registration_url two-pass
 * from the EXISTING REGISTRATION slug) → interpolate → STRICT sanitize.
 *
 * Fix 3 (P2): accepts a pre-resolved registrationUrl so the caller (resolveWorkshopFacts)
 * does the single REGISTRATION lookup and passes the result in — eliminates the
 * duplicate db.landingPage.findUnique that was happening once here and once in
 * resolveWorkshopFacts for every candidate workshop.
 */
async function reinterpolate(
  workshopId: string,
  templateCustomHtml: string,
  registrationUrl: string,
): Promise<SanitizeOutcome | null> {
  const variables = await buildWorkshopVariables(workshopId);
  if (!variables) return null;
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

/** Resolve the per-workshop preflight facts (coach photo / registration / price). */
async function resolveWorkshopFacts(workshopId: string): Promise<WorkshopFacts | null> {
  const workshop = await db.workshop.findUnique({
    where: { id: workshopId },
    include: {
      coach: { select: { profileImage: true } },
      pricingTier: { select: { amountCents: true } },
    },
  });
  if (!workshop) return null;

  // Single REGISTRATION lookup — result is shared with reinterpolate (Fix 3).
  const reg = await db.landingPage.findUnique({
    where: { workshopId_template: { workshopId, template: "REGISTRATION" } },
    select: { slug: true, status: true },
  });
  const registrationUrl = reg?.slug ? `${process.env.APP_URL}/workshop/${reg.slug}` : "";

  // Mirror buildWorkshopVariables' price derivation (same source as checkout).
  const renderedPrice = workshop.pricingTier
    ? `$${(workshop.pricingTier.amountCents / 100).toFixed(0)}`
    : workshop.isFree
      ? "Free"
      : workshop.priceCents
        ? `$${(workshop.priceCents / 100).toFixed(0)}`
        : "TBD";

  return {
    coachProfileImage: workshop.coach?.profileImage ?? null,
    registrationUrl,
    registrationSlug: reg?.slug ?? null,
    registrationPublished: reg?.status === "PUBLISHED",
    renderedPrice,
  };
}

// ─── Reporting ───────────────────────────────────────────────────────────────

function printReport(plans: KajabiRowPlan[]): void {
  console.log("\n── Per-row plan ──────────────────────────────────────────");
  for (const p of plans) {
    if (p.decision === "target") {
      console.log(`\n[TARGET] ${p.slug} (lp=${p.landingPageId} ws=${p.workshopId})`);
      console.log(`  oldSha=${p.oldSha.slice(0, 14)}… newSha=${p.newSha.slice(0, 14)}…`);
      console.log(`  cta=${p.validation.resolvedCtaHref ?? "—"}`);
      if (p.sanitizerStripped) {
        console.warn(
          `  ⚠ sanitizer stripped: tags=[${p.strippedTags.join(",")}] attrs=[${p.strippedAttrs.join(",")}] (BLOCKS apply)`,
        );
      }
    } else if (p.decision === "no-op") {
      console.log(`\n[NO-OP] ${p.slug} — already on the new design.`);
    } else {
      console.log(`\n[SKIP] ${p.slug} — ${p.skipReason}${p.skipDetail ? `: ${p.skipDetail}` : ""}`);
    }
  }
  console.log("\n──────────────────────────────────────────────────────────");
}

async function writeReport(runId: string, host: string, mode: string, plans: KajabiRowPlan[]): Promise<string> {
  if (!existsSync(SNAPSHOT_DIR)) await mkdir(SNAPSHOT_DIR, { recursive: true });
  const iso = new Date().toISOString().replace(/[:.]/g, "-");
  const file = join(SNAPSHOT_DIR, `solo-landing-kajabi-report-${mode}-${iso}.json`);
  const report = {
    kind: "solo-landing-kajabi-report",
    runId,
    mode,
    createdAt: new Date().toISOString(),
    databaseHost: host,
    rows: plans.map((p) => ({
      slug: p.slug,
      landingPageId: p.landingPageId,
      workshopId: p.workshopId,
      decision: p.decision,
      skipReason: p.skipReason,
      skipDetail: p.skipDetail,
      oldSha: p.oldSha,
      newSha: p.newSha,
      cta: p.validation.resolvedCtaHref,
      sanitizerStripped: p.sanitizerStripped,
    })),
  };
  await writeFile(file, JSON.stringify(report, null, 2), "utf8");
  return file;
}

async function writeBackfillBackup(
  runId: string,
  host: string,
  oldGlobalTemplateId: string,
  newGlobalSha: string,
  targets: KajabiRowPlan[],
): Promise<string> {
  if (!existsSync(SNAPSHOT_DIR)) await mkdir(SNAPSHOT_DIR, { recursive: true });
  const iso = new Date().toISOString().replace(/[:.]/g, "-");
  const file = join(SNAPSHOT_DIR, `solo-landing-kajabi-backfill-${iso}.json`);
  const backup: KajabiBackupFile = {
    kind: "solo-landing-kajabi-backfill",
    runId,
    createdAt: new Date().toISOString(),
    databaseHost: host,
    oldGlobalTemplateId,
    newGlobalSha,
    entries: targets.map(toKajabiBackupEntry),
  };
  await writeFile(file, JSON.stringify(backup, null, 2), "utf8");
  return file;
}

// ─── main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const args = parseKajabiArgs(argv);
  const url = process.env.DATABASE_URL ?? "";
  const host = parseHost(url);
  const expectedHostGuard = process.env.ASSESSMENT_PROD_EXPECTED_HOST;
  const operator = process.env.OPERATOR_EMAIL || process.env.ADMIN_EMAIL || "SYSTEM";
  const runId = randomUUID();

  // Expected production host for the CTA preflight — derive from APP_URL.
  const ctaExpectedHost = (() => {
    try {
      return new URL(process.env.APP_URL ?? "").host;
    } catch {
      return "";
    }
  })();

  console.log(`backfill-solo-landing-kajabi — mode=${args.mode} host=${host || "(none)"} runId=${runId}`);

  if (argv.includes("--inventory")) {
    const inv = await inventorySoloPages(db as unknown as DbClient);
    console.log(`\nSOLO_LANDING inventory (${inv.length} pages):`);
    for (const row of inv) {
      console.log(`  ${row.slug}  sha=${row.sha.slice(0, 14)}…  src=${row.sourceTemplateId ?? "—"}`);
    }
    return;
  }

  if (args.mode === "apply" || args.mode === "restore") {
    const decision = checkGuard({ url, expectedHost: expectedHostGuard, hasOverride: args.hasOverride });
    if (!decision.allowed) {
      console.error(`\n❌ BLOCKED — prod guard refused (${args.mode}).\n  ${decision.reason}\n`);
      process.exitCode = 1;
      return;
    }
  }

  if (args.mode === "restore") {
    if (!args.restoreFile) {
      console.error("Usage: --restore <backfillBackup.json> --i-know-this-is-prod");
      process.exitCode = 1;
      return;
    }
    const backup = JSON.parse(await readFile(args.restoreFile, "utf8")) as KajabiBackupFile;
    const result = await restoreBackfill(db as unknown as DbClient, backup, { operator, runId });
    console.log(`\nRestore: ${result.restored} restored, ${result.skipped} skipped.`);
    return;
  }

  // dry-run + apply both build the plans first.
  if (!args.oldTemplateBackup) {
    console.error("Required: --old-template-backup <Script-1 backup .json> (the expected-old-render source).");
    process.exitCode = 1;
    return;
  }
  const oldBackup = JSON.parse(await readFile(args.oldTemplateBackup, "utf8")) as TemplateBackupFile;
  if (oldBackup.kind !== "solo-landing-template-update") {
    console.error("--old-template-backup is not a recognised template-update backup.");
    process.exitCode = 1;
    return;
  }
  const artifactPath = args.newTemplate ?? DEFAULT_ARTIFACT;
  const newArtifactRaw = await readFile(artifactPath, "utf8");
  // Mirror Script 1 (update-solo-landing-template.ts → loadSanitizedArtifact):
  // the template stored in DB is save-time-sanitized with allowTokenUris:true (default).
  // Targeting hashes must be computed from the SAME sanitized string, not raw.
  const {
    sanitized: newArtifactSanitized,
    didStripContent,
    strippedTags,
    strippedAttrs,
  } = sanitizeCustomHtml(newArtifactRaw);
  if (didStripContent) {
    console.error(
      `Artifact sanitize STRIPPED content — refusing to proceed.\n` +
        `  strippedTags=[${strippedTags.join(", ")}] strippedAttrs=[${strippedAttrs.join(", ")}]`,
    );
    process.exitCode = 1;
    return;
  }
  if (!newArtifactSanitized.includes(NEW_DESIGN_MARKER)) {
    console.error(`Sanitized artifact does not contain the design marker "${NEW_DESIGN_MARKER}".`);
    process.exitCode = 1;
    return;
  }
  const newGlobalSha = oldBackup.newSha; // SHA of the template we patched live.

  const { plans, counts } = await buildBackfillPlans(
    db as unknown as DbClient,
    reinterpolate,
    resolveWorkshopFacts,
    {
      oldGlobalTemplateId: oldBackup.templateId,
      oldTemplateCustomHtml: oldBackup.oldCustomHtml,
      newTemplateCustomHtml: newArtifactSanitized,
      expectedHost: ctaExpectedHost,
      allowPriceWorkshopIds: args.allowPrice,
      slug: args.slug,
      limit: args.limit,
    },
  );

  printReport(plans);
  console.log(
    `\nSummary: ${counts.candidates} candidates — ${counts.targets} target, ${counts.noops} no-op, ${counts.skips} skip.`,
  );
  const reportFile = await writeReport(runId, host, args.mode, plans);
  console.log(`Report: ${reportFile}`);

  if (args.mode === "dry-run") {
    console.log(`\nDRY RUN — no writes. To apply: --expect-count ${counts.targets} --apply --i-know-this-is-prod`);
    return;
  }

  // apply: enforce the expected-count gate.
  const gate = checkExpectedCount(counts.targets, args.expectCount);
  if (!gate.ok) {
    console.error(`\n❌ ${gate.reason}`);
    process.exitCode = 1;
    return;
  }

  const result = await applyBackfillPlans(db as unknown as DbClient, plans, {
    writeBackup: (targets) =>
      writeBackfillBackup(runId, host, oldBackup.templateId, newGlobalSha, targets),
    operator,
    runId,
    newGlobalSha,
  });

  if (result.blocked > 0) {
    console.error(`\n❌ Refusing to apply — ${result.blocked} target row(s) had sanitizer strips.`);
    process.exitCode = 1;
    return;
  }
  if (!result.backupFile) {
    console.log("Nothing to apply (no target rows).");
    return;
  }
  console.log(`\nBackup: ${result.backupFile}`);
  console.log(`Applied: ${result.updated} updated, ${result.skipped} skipped (CAS abort).`);
  console.log(`Restore with: --restore ${result.backupFile} --i-know-this-is-prod`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
