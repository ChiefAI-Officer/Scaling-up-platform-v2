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

type CriticalTable = (typeof CRITICAL_TABLES)[number];

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
      const rows = await model.findMany();
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
  const filename = `snapshot-${timestamp}.json`;
  const outPath = join(SNAPSHOT_DIR, filename);

  const payload = {
    createdAt: new Date().toISOString(),
    databaseUrlHost: process.env.DATABASE_URL.split("@")[1]?.split("/")[0] ?? "unknown",
    nodeEnv: process.env.NODE_ENV ?? "unknown",
    isProdLike: isProd,
    tables: CRITICAL_TABLES.length,
    totalRows: Object.values(snapshot).reduce((sum, rows) => sum + rows.length, 0),
    errors,
    data: snapshot,
  };

  await writeFile(outPath, JSON.stringify(payload, null, 2), "utf-8");
  console.log(`\nWrote ${payload.totalRows} rows across ${CRITICAL_TABLES.length} tables to:`);
  console.log(`  ${outPath}`);
  if (Object.keys(errors).length > 0) {
    console.warn(`\n⚠️  ${Object.keys(errors).length} table(s) failed — review errors above.`);
    process.exit(2);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
