/**
 * update-solo-landing-template.ts  [Task 6]
 *
 * Script 1 of the GLOBAL SOLO_LANDING Kajabi rollout: a guarded, CAS-protected,
 * audited, reversible update of the SINGLE global SOLO_LANDING PageTemplate's
 * customHtml to the new Kajabi artifact.
 *
 * WHY a dedicated script (NOT the admin PATCH route):
 *   The admin PATCH route has no expected-`updatedAt`/hash check (claudex
 *   R2-High3/R3-Med1). For a prod write of the canonical global template we want
 *   read-then-CAS, an on-disk backup, save-time sanitize assertion, and a
 *   durable AuditLog row.
 *
 * ── What it does ─────────────────────────────────────────────────────────────
 *   1. Locate the global SOLO_LANDING PageTemplate
 *      (templateType=SOLO_LANDING, categoryId=null, isActive=true).
 *      >1 match → FAIL loudly. 0 match → FAIL.
 *   2. Read the new artifact (default docs/specs/master-class-landing-kajabi.html,
 *      override with --new-template <path>), run it through sanitizeCustomHtml
 *      (save-time, allowTokenUris defaulted true) and ASSERT didStripContent===false
 *      (a strip means the artifact is unsafe — abort).
 *   3. Back up { id, updatedAt, oldSha, oldCustomHtml } to src/.snapshots/.
 *   4. CAS: refuse to write unless the live row still matches the expected
 *      updatedAt/SHA. Operator may pass --expected-sha <hex> / --expected-updated-at
 *      <ISO>; otherwise the read-then-CAS-on-updatedAt (updateMany where id+updatedAt)
 *      is the guard.
 *   5. Write the sanitized artifact; capture newSha; write an AuditLog
 *      (action SOLO_LANDING_TEMPLATE_UPDATE; operator, old/new SHA, backup path).
 *
 * ── Modes ─────────────────────────────────────────────────────────────────────
 *   (default)   dry-run — locate template, show old/new SHA + sanitizer audit, no write.
 *   --apply     write (requires --i-know-this-is-prod on a prod host).
 *   --restore <templateBackup.json>  CAS-restore the pre-update value.
 *
 * ── Usage ──────────────────────────────────────────────────────────────────────
 *   cd src
 *   npx tsx scripts/update-solo-landing-template.ts                        # dry-run
 *   npx tsx scripts/update-solo-landing-template.ts --apply --i-know-this-is-prod
 *   npx tsx scripts/update-solo-landing-template.ts --restore .snapshots/<file>.json --i-know-this-is-prod
 *
 * Backups: src/.snapshots/solo-landing-template-update-<ISO>.json
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
import { sanitizeCustomHtml } from "../src/lib/templates/sanitize-custom-html";
import {
  NEW_DESIGN_MARKER,
  type TemplateBackupFile,
} from "../src/lib/scripts/solo-landing-kajabi-core";
import {
  buildTemplateUpdatePlan,
  applyTemplateUpdate,
  restoreTemplateFromBackup,
  type DbClient,
} from "../src/lib/scripts/solo-landing-kajabi-runner";

const db = new PrismaClient();
const SNAPSHOT_DIR = join(SRC_DIR, ".snapshots");
const DEFAULT_ARTIFACT = join(REPO_ROOT, "docs/specs/master-class-landing-kajabi.html");

function flagValue(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}

async function loadSanitizedArtifact(path: string): Promise<string> {
  const raw = await readFile(path, "utf8");
  const { sanitized, didStripContent, strippedTags, strippedAttrs } = sanitizeCustomHtml(raw);
  if (didStripContent) {
    throw new Error(
      `Artifact sanitize STRIPPED content — refusing to ship.\n` +
        `  strippedTags=[${strippedTags.join(", ")}] strippedAttrs=[${strippedAttrs.join(", ")}]`,
    );
  }
  if (!sanitized.includes(NEW_DESIGN_MARKER)) {
    throw new Error(`Sanitized artifact does not contain the design marker "${NEW_DESIGN_MARKER}".`);
  }
  return sanitized;
}

async function writeTemplateBackup(
  host: string,
  runId: string,
  plan: { templateId: string; oldUpdatedAt: Date; oldSha: string; newSha: string; oldCustomHtml: string },
): Promise<string> {
  if (!existsSync(SNAPSHOT_DIR)) await mkdir(SNAPSHOT_DIR, { recursive: true });
  const iso = new Date().toISOString().replace(/[:.]/g, "-");
  const file = join(SNAPSHOT_DIR, `solo-landing-template-update-${iso}.json`);
  const backup: TemplateBackupFile = {
    kind: "solo-landing-template-update",
    runId,
    createdAt: new Date().toISOString(),
    databaseHost: host,
    templateId: plan.templateId,
    oldUpdatedAt: plan.oldUpdatedAt.toISOString(),
    oldSha: plan.oldSha,
    newSha: plan.newSha,
    oldCustomHtml: plan.oldCustomHtml,
  };
  await writeFile(file, JSON.stringify(backup, null, 2), "utf8");
  return file;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const hasOverride = argv.includes("--i-know-this-is-prod");
  const mode = argv.includes("--restore")
    ? "restore"
    : argv.includes("--apply")
      ? "apply"
      : "dry-run";

  const url = process.env.DATABASE_URL ?? "";
  const host = parseHost(url);
  const expectedHost = process.env.ASSESSMENT_PROD_EXPECTED_HOST;
  const operator = process.env.OPERATOR_EMAIL || process.env.ADMIN_EMAIL || "SYSTEM";
  const runId = randomUUID();

  console.log(`update-solo-landing-template — mode=${mode} host=${host || "(none)"} runId=${runId}`);

  if (mode === "apply" || mode === "restore") {
    const decision = checkGuard({ url, expectedHost, hasOverride });
    if (!decision.allowed) {
      console.error(`\n❌ BLOCKED — prod guard refused (${mode}).\n  ${decision.reason}\n`);
      process.exitCode = 1;
      return;
    }
  }

  if (mode === "restore") {
    const file = flagValue("--restore");
    if (!file) {
      console.error("Usage: --restore <templateBackup.json> --i-know-this-is-prod");
      process.exitCode = 1;
      return;
    }
    const backup = JSON.parse(await readFile(file, "utf8")) as TemplateBackupFile;
    const result = await restoreTemplateFromBackup(db as unknown as DbClient, backup, {
      operator,
      runId,
    });
    console.log(`\nRestore: ${result.status}${result.reason ? ` — ${result.reason}` : ""}`);
    return;
  }

  const artifactPath = flagValue("--new-template") ?? DEFAULT_ARTIFACT;
  const newSanitized = await loadSanitizedArtifact(artifactPath);
  console.log(`Artifact: ${artifactPath} (sanitized, didStripContent=false)`);

  const plan = await buildTemplateUpdatePlan(db as unknown as DbClient, { newSanitized });
  console.log(`\nGlobal SOLO_LANDING template: ${plan.templateId}`);
  console.log(`  oldSha=${plan.oldSha.slice(0, 16)}…  newSha=${plan.newSha.slice(0, 16)}…`);
  console.log(`  oldUpdatedAt=${plan.oldUpdatedAt.toISOString()}`);
  console.log(`  ${plan.isNoOp ? "NO-OP (already on the new artifact)" : "CHANGE"}`);

  if (mode === "dry-run") {
    console.log(`\nDRY RUN — no writes. Re-run with --apply --i-know-this-is-prod.`);
    console.log(`When you apply, record NEW_GLOBAL_SHA = ${plan.newSha} for the backfill.`);
    return;
  }

  const expectedSha = flagValue("--expected-sha");
  const expectedUpdatedAtRaw = flagValue("--expected-updated-at");
  const result = await applyTemplateUpdate(db as unknown as DbClient, plan, {
    writeBackup: (p) => writeTemplateBackup(host, runId, p),
    operator,
    runId,
    expectedOldSha: expectedSha,
    expectedUpdatedAt: expectedUpdatedAtRaw ? new Date(expectedUpdatedAtRaw) : undefined,
  });

  console.log(`\nApply: ${result.status}${result.reason ? ` — ${result.reason}` : ""}`);
  if (result.backupFile) console.log(`Backup: ${result.backupFile}`);
  if (result.status === "applied") {
    console.log(`\n✅ NEW_GLOBAL_SHA = ${plan.newSha}`);
    console.log(`Pass this to the backfill: --new-template ${artifactPath}`);
    console.log(`Restore with: --restore ${result.backupFile} --i-know-this-is-prod`);
  } else if (result.status === "cas-abort") {
    process.exitCode = 1;
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
