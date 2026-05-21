/**
 * restore-from-snapshot.ts
 *
 * EMERGENCY restore tool — imports a snapshot JSON back into the database
 * using upsert (so it won't blow away unrelated rows added since the
 * snapshot).
 *
 * Usage:
 *   cd src && npm run restore:from-snapshot -- <snapshot-file> [--table=<TableName>]
 *
 * Env resolution order (same as snapshot script):
 *   1. process.env.DATABASE_URL (if already set in shell)
 *   2. .env.production.local    (preferred — `vercel env pull` writes this)
 *   3. .env.local
 *   4. .env
 *
 * Defaults:
 *   - If --table is omitted, restores ALL tables from the snapshot
 *   - Upsert by primary key (`id` field). If a snapshot row's id matches an
 *     existing row, that row is updated. New rows are created.
 *   - Does NOT delete rows in the DB that aren't in the snapshot — this
 *     keeps additive prod activity safe.
 *
 * For a true point-in-time restore (including deletions), use Neon's
 * PITR via the Neon dashboard — see docs/runbooks/database-protection.md.
 */

import { config as loadEnv } from "dotenv";
import { join } from "node:path";

// Load env files BEFORE importing PrismaClient. dotenv.config() does not
// overwrite already-set env vars.
const SRC_DIR = join(__dirname, "..");
loadEnv({ path: join(SRC_DIR, ".env.production.local") });
loadEnv({ path: join(SRC_DIR, ".env.local") });
loadEnv({ path: join(SRC_DIR, ".env") });

import { PrismaClient } from "@prisma/client";
import { readFile } from "node:fs/promises";

interface SnapshotPayload {
  createdAt: string;
  databaseUrlHost: string;
  nodeEnv: string;
  isProdLike: boolean;
  tables: number;
  totalRows: number;
  errors: Record<string, string>;
  data: Record<string, Array<Record<string, unknown>>>;
}

async function main() {
  const args = process.argv.slice(2);
  const snapshotPath = args.find((a) => !a.startsWith("--"));
  const tableFilter = args.find((a) => a.startsWith("--table="))?.split("=")[1];

  if (!snapshotPath) {
    console.error("Usage: tsx scripts/restore-from-snapshot.ts <snapshot-file> [--table=<TableName>]");
    process.exit(1);
  }
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set. Aborting.");
    process.exit(1);
  }

  const raw = await readFile(snapshotPath, "utf-8");
  const snapshot = JSON.parse(raw) as SnapshotPayload;

  console.log(`Restoring from: ${snapshotPath}`);
  console.log(`  Snapshot created: ${snapshot.createdAt}`);
  console.log(`  Snapshot source: ${snapshot.databaseUrlHost} (${snapshot.nodeEnv})`);
  console.log(`  Target: ${process.env.DATABASE_URL.replace(/:[^@]+@/, ":***@").slice(0, 80)}…`);
  if (tableFilter) console.log(`  Table filter: ${tableFilter}`);

  const prisma = new PrismaClient();
  const tables = tableFilter ? [tableFilter] : Object.keys(snapshot.data);
  let totalUpserted = 0;
  const errors: Record<string, string> = {};

  for (const table of tables) {
    const rows = snapshot.data[table];
    if (!rows) {
      console.warn(`  ${table}: not in snapshot — skipping`);
      continue;
    }
    const modelName = (table.charAt(0).toLowerCase() + table.slice(1)) as keyof PrismaClient;
    const model = prisma[modelName] as unknown as {
      upsert: (args: { where: { id: string }; create: Record<string, unknown>; update: Record<string, unknown> }) => Promise<unknown>;
    } | undefined;
    if (!model || typeof model.upsert !== "function") {
      errors[table] = "model.upsert not found on prisma client";
      console.error(`  ${table}: ERROR — ${errors[table]}`);
      continue;
    }
    let upserted = 0;
    for (const row of rows) {
      try {
        await model.upsert({
          where: { id: row.id as string },
          create: row,
          update: row,
        });
        upserted++;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        errors[`${table}:${row.id}`] = msg;
        console.error(`    upsert ${table}#${row.id} failed: ${msg.slice(0, 100)}`);
      }
    }
    console.log(`  ${table}: ${upserted}/${rows.length} upserted`);
    totalUpserted += upserted;
  }

  await prisma.$disconnect();
  console.log(`\nRestored ${totalUpserted} rows across ${tables.length} table(s).`);
  if (Object.keys(errors).length > 0) {
    console.warn(`⚠️  ${Object.keys(errors).length} error(s) during restore.`);
    process.exit(2);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
