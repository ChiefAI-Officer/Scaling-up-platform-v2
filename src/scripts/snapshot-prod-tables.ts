/**
 * snapshot-prod-tables.ts
 *
 * Exports critical tables to a timestamped JSON snapshot under .snapshots/.
 * Run BEFORE any production schema change as a belt-and-suspenders safety
 * net on top of Neon's continuous backups (PITR).
 *
 * Usage:
 *   cd src && npm run snapshot:prod        (auto-loads .env.production.local)
 *
 * Env resolution order:
 *   1. process.env.DATABASE_URL (if already set in shell)
 *   2. .env.production.local    (what `vercel env pull` writes — preferred)
 *   3. .env.local               (Next.js local override convention)
 *   4. .env                     (default — usually dev DB)
 *
 * Output: src/.snapshots/snapshot-YYYY-MM-DD-HHmmss.json
 *
 * Restore: see scripts/restore-from-snapshot.ts
 */

import { config as loadEnv } from "dotenv";
import { join } from "node:path";

// Load env files BEFORE importing PrismaClient — Prisma reads
// process.env.DATABASE_URL on import. dotenv.config() does not overwrite
// already-set env vars, so process.env wins if DATABASE_URL is exported
// in the shell.
const SRC_DIR = join(__dirname, "..");
loadEnv({ path: join(SRC_DIR, ".env.production.local") });
loadEnv({ path: join(SRC_DIR, ".env.local") });
loadEnv({ path: join(SRC_DIR, ".env") });

import { PrismaClient } from "@prisma/client";
import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
// @ts-expect-error — sibling .mjs helper, no type declarations
import { isConnectionError, classifySnapshot } from "./snapshot-prod-helpers.mjs";

const SNAPSHOT_DIR = join(SRC_DIR, ".snapshots");

// Tables that hold operator-configured data Jeff/Suzanne set up by hand.
// Add to this list if more high-cost tables get configured manually.
const CRITICAL_TABLES = [
  "User",
  "Coach",
  "CoachCertification",
  "Workshop",
  "WorkshopType",
  "Registration",
  "Survey",
  "SurveyTemplate",
  "SurveyQuestion",
  "Workflow",
  "WorkflowStep",
  "WorkflowAssignment",
  "WorkflowStepExecution",
  "TransactionalEmailTemplate",
  "AssessmentTemplate",
  "AssessmentTemplateVersion",
  "AssessmentCampaign",
  "AssessmentSubmission",
  "AccessGroup",
  "AccessGroupCoach",
  "AccessGroupTemplate",
  "Organization",
] as const;

// The subset whose loss caused the production wipes. If ANY of these fail to
// export, the snapshot is not trustworthy as a recovery fixture → hard fail.
const CORE_TABLES: readonly string[] = [
  "User",
  "Coach",
  "CoachCertification",
  "Survey",
  "SurveyTemplate",
  "SurveyQuestion",
  "Workflow",
  "WorkflowStep",
];

const MAX_ATTEMPTS = 3;

// Retry transient connectivity failures (e.g. a Neon pooler cold-start drop on
// the first query) so a blip doesn't silently leave a table out of the snapshot.
async function findManyWithRetry(
  model: { findMany: () => Promise<unknown[]> },
  table: string,
): Promise<unknown[]> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await model.findMany();
    } catch (e) {
      lastErr = e;
      const msg = e instanceof Error ? e.message : String(e);
      if (!isConnectionError(msg) || attempt === MAX_ATTEMPTS) throw e;
      const backoffMs = 500 * attempt;
      console.warn(
        `  ${table}: connection error (attempt ${attempt}/${MAX_ATTEMPTS}) — retrying in ${backoffMs}ms`,
      );
      await new Promise((r) => setTimeout(r, backoffMs));
    }
  }
  throw lastErr;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set. Aborting.");
    process.exit(1);
  }

  const isProd = process.env.DATABASE_URL.includes("neon.tech") || process.env.NODE_ENV === "production";
  console.log(
    `Snapshot target: ${isProd ? "production (Neon)" : "non-prod"} — ${process.env.DATABASE_URL.replace(/:[^@]+@/, ":***@").slice(0, 80)}…`,
  );

  if (!existsSync(SNAPSHOT_DIR)) {
    await mkdir(SNAPSHOT_DIR, { recursive: true });
  }

  const prisma = new PrismaClient();
  const snapshot: Record<string, unknown[]> = {};
  const errors: Record<string, string> = {};

  for (const table of CRITICAL_TABLES) {
    const modelName = table.charAt(0).toLowerCase() + table.slice(1) as keyof PrismaClient;
    const model = prisma[modelName] as unknown as { findMany: () => Promise<unknown[]> } | undefined;
    if (!model || typeof model.findMany !== "function") {
      errors[table] = "model not found on prisma client";
      continue;
    }
    try {
      const rows = await findManyWithRetry(model, table);
      snapshot[table] = rows;
      console.log(`  ${table}: ${rows.length} rows`);
    } catch (e) {
      errors[table] = e instanceof Error ? e.message : String(e);
      console.error(`  ${table}: ERROR — ${errors[table]}`);
    }
  }

  await prisma.$disconnect();

  const timestamp = new Date()
    .toISOString()
    .replace(/[:.]/g, "-")
    .slice(0, 19);
  const outcome = classifySnapshot(Object.keys(errors), CORE_TABLES);
  // A partial snapshot must NEVER be named like a complete one.
  const filename = `snapshot-${timestamp}${outcome.filenameSuffix}.json`;
  const outPath = join(SNAPSHOT_DIR, filename);

  const payload = {
    createdAt: new Date().toISOString(),
    databaseUrlHost: process.env.DATABASE_URL.split("@")[1]?.split("/")[0] ?? "unknown",
    nodeEnv: process.env.NODE_ENV ?? "unknown",
    isProdLike: isProd,
    complete: !outcome.partial,
    tables: CRITICAL_TABLES.length,
    totalRows: Object.values(snapshot).reduce((sum, rows) => sum + rows.length, 0),
    errors,
    data: snapshot,
  };

  await writeFile(outPath, JSON.stringify(payload, null, 2), "utf-8");
  console.log(`\nWrote ${payload.totalRows} rows across ${CRITICAL_TABLES.length} tables to:`);
  console.log(`  ${outPath}`);

  if (outcome.severe) {
    console.error(
      `\n❌ INCOMPLETE SNAPSHOT — core table(s) failed to export: ${outcome.coreFailed.join(", ")}.`,
    );
    console.error(
      "   This file is NOT a safe recovery fixture (saved with a .PARTIAL suffix). Re-run `npm run snapshot:prod`.",
    );
    process.exit(outcome.exitCode);
  }
  if (outcome.partial) {
    console.warn(
      `\n⚠️  PARTIAL SNAPSHOT — ${Object.keys(errors).length} non-core table(s) failed (saved with a .PARTIAL suffix). Review errors above.`,
    );
    process.exit(outcome.exitCode);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
