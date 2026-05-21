#!/usr/bin/env node
/**
 * check-migration-safety.mjs
 *
 * Scans each migration.sql under prisma/migrations/ for destructive
 * SQL operations and fails (exit non-zero) when any are found that
 * haven't been explicitly approved via a `-- @approved: <reason>`
 * comment immediately preceding the destructive statement.
 *
 * Usage:
 *   node scripts/check-migration-safety.mjs
 *   node scripts/check-migration-safety.mjs --migration=<dir-name>  (check a single migration)
 *
 * Exit codes:
 *   0  — no destructive ops, or all destructive ops have approval comments
 *   1  — at least one unapproved destructive op found
 *   2  — script error
 *
 * Approval comment format (must be on the line immediately preceding):
 *   -- @approved: brief reason (referencing PR / Linear ticket / discussion)
 *   DROP COLUMN ...
 */

import { readdir, readFile, realpath } from "node:fs/promises";
import { existsSync, realpathSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, "..", "prisma", "migrations");

// Patterns considered destructive — we want explicit human approval for these.
const DESTRUCTIVE_PATTERNS = [
  /\bDROP\s+TABLE\b/i,
  /\bDROP\s+COLUMN\b/i,
  /\bTRUNCATE\b/i,
  /\bDELETE\s+FROM\b/i,
  /\bALTER\s+TABLE\b.*\bDROP\b/i,
  /\bALTER\s+COLUMN\b.*\bDROP\b/i,
];

const APPROVAL_REGEX = /^\s*--\s*@approved:\s*\S/;

export function findDestructiveOps(sqlContent) {
  const lines = sqlContent.split(/\r?\n/);
  const issues = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Skip comment-only lines (won't execute as SQL)
    if (/^\s*--/.test(line)) continue;
    const matched = DESTRUCTIVE_PATTERNS.find((p) => p.test(line));
    if (!matched) continue;

    // Check the immediately-preceding non-blank line for an @approved comment.
    let approvalFound = false;
    for (let j = i - 1; j >= 0; j--) {
      const prev = lines[j];
      if (prev.trim() === "") continue;
      approvalFound = APPROVAL_REGEX.test(prev);
      break;
    }
    if (!approvalFound) {
      issues.push({
        lineNumber: i + 1,
        line: line.trim().slice(0, 120),
        pattern: matched.source,
      });
    }
  }
  return issues;
}

async function main() {
  if (!existsSync(MIGRATIONS_DIR)) {
    console.error(`Migrations dir not found: ${MIGRATIONS_DIR}`);
    process.exit(2);
  }
  const args = process.argv.slice(2);
  const onlyMigration = args.find((a) => a.startsWith("--migration="))?.split("=")[1];

  const entries = await readdir(MIGRATIONS_DIR, { withFileTypes: true });
  let migrationDirs = entries
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
  if (onlyMigration) {
    migrationDirs = migrationDirs.filter((d) => d === onlyMigration);
    if (migrationDirs.length === 0) {
      console.error(`Migration not found: ${onlyMigration}`);
      process.exit(2);
    }
  }

  let totalIssues = 0;
  const offenders = [];

  for (const dir of migrationDirs) {
    const sqlPath = join(MIGRATIONS_DIR, dir, "migration.sql");
    if (!existsSync(sqlPath)) continue;
    const sql = await readFile(sqlPath, "utf-8");
    const issues = findDestructiveOps(sql);
    if (issues.length > 0) {
      offenders.push({ migration: dir, issues });
      totalIssues += issues.length;
    }
  }

  if (totalIssues === 0) {
    console.log(`✓ Checked ${migrationDirs.length} migration(s) — no unapproved destructive ops.`);
    process.exit(0);
  }

  console.error(`❌ Found ${totalIssues} unapproved destructive op(s) in ${offenders.length} migration(s):\n`);
  for (const { migration, issues } of offenders) {
    console.error(`  ${migration}/migration.sql`);
    for (const issue of issues) {
      console.error(`    line ${issue.lineNumber}: ${issue.line}`);
    }
  }
  console.error(
    `\nTo approve a destructive op, add this comment IMMEDIATELY ABOVE the SQL statement:`,
  );
  console.error(`  -- @approved: <brief reason / PR link / Linear ticket>`);
  process.exit(1);
}

// Allow import for tests; run only when invoked as CLI. Use realpath on
// both sides so macOS /var → /private/var symlink resolution doesn't
// cause a false negative (process.argv[1] keeps /var; import.meta.url
// resolves to /private/var).
const scriptPath = fileURLToPath(import.meta.url);
const invokedPath = process.argv[1];
const isCli =
  scriptPath === invokedPath ||
  (existsSync(invokedPath) &&
    realpathSync(scriptPath) === realpathSync(invokedPath));
if (isCli) {
  main().catch((e) => {
    console.error(e);
    process.exit(2);
  });
}
