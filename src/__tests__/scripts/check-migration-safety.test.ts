/**
 * Tests for the migration safety gate (scripts/check-migration-safety.mjs).
 *
 * Black-box: runs the CLI against a temp migrations directory via
 * execFileSync (no shell — internal args only) and checks exit code +
 * stdout. Avoids ESM/CJS interop pain that comes with importing the
 * .mjs script directly into a CJS-based Jest config.
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SCRIPT_PATH = join(
  __dirname,
  "..",
  "..",
  "scripts",
  "check-migration-safety.mjs",
);

interface RunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

function runWithMigration(sqlContent: string): RunResult {
  const tmpRoot = mkdtempSync(join(tmpdir(), "migration-safety-test-"));
  const scriptsDir = join(tmpRoot, "scripts");
  const migrationsDir = join(tmpRoot, "prisma", "migrations", "20260101000000_test");
  mkdirSync(scriptsDir, { recursive: true });
  mkdirSync(migrationsDir, { recursive: true });

  const scriptContent = readFileSync(SCRIPT_PATH, "utf-8");
  const localScriptPath = join(scriptsDir, "check-migration-safety.mjs");
  writeFileSync(localScriptPath, scriptContent);
  writeFileSync(join(migrationsDir, "migration.sql"), sqlContent);

  try {
    const stdout = execFileSync("node", [localScriptPath], {
      cwd: tmpRoot,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { stdout, stderr: "", exitCode: 0 };
  } catch (err) {
    const e = err as { status?: number; stdout?: Buffer | string; stderr?: Buffer | string };
    return {
      stdout: typeof e.stdout === "string" ? e.stdout : e.stdout?.toString() ?? "",
      stderr: typeof e.stderr === "string" ? e.stderr : e.stderr?.toString() ?? "",
      exitCode: e.status ?? -1,
    };
  } finally {
    rmSync(tmpRoot, { recursive: true, force: true });
  }
}

describe("check-migration-safety CLI", () => {
  test("exit 0 for additive migration (ADD COLUMN only)", () => {
    const result = runWithMigration(
      `ALTER TABLE "AssessmentTemplate" ADD COLUMN "resultsEmailSubject" TEXT;`,
    );
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/no unapproved destructive ops/);
  });

  test("exit 1 for unapproved DROP COLUMN", () => {
    const result = runWithMigration(`ALTER TABLE "Workshop" DROP COLUMN "oldStatus";`);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/DROP COLUMN/);
  });

  test("exit 1 for unapproved DROP TABLE", () => {
    const result = runWithMigration(`DROP TABLE "DeprecatedThing";`);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/DROP TABLE/);
  });

  test("exit 1 for unapproved TRUNCATE", () => {
    const result = runWithMigration(`TRUNCATE TABLE "Coach";`);
    expect(result.exitCode).toBe(1);
  });

  test("exit 1 for unapproved DELETE FROM", () => {
    const result = runWithMigration(
      `DELETE FROM "Workshop" WHERE status = 'CANCELED';`,
    );
    expect(result.exitCode).toBe(1);
  });

  test("exit 0 when @approved comment immediately precedes destructive op", () => {
    const result = runWithMigration(`-- @approved: Linear SCL-123, intentional drop after migration v42
ALTER TABLE "Workshop" DROP COLUMN "oldStatus";`);
    expect(result.exitCode).toBe(0);
  });

  test("ignores destructive keywords inside SQL comments only", () => {
    const result = runWithMigration(
      `-- This migration could have used DROP TABLE but instead we add a column.
ALTER TABLE "X" ADD COLUMN "y" TEXT;`,
    );
    expect(result.exitCode).toBe(0);
  });
});
