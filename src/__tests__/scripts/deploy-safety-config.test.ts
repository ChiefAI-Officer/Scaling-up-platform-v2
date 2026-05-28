/**
 * Config-integrity guard for the database-wipe protections.
 *
 * Parses the real config files (not string-grep heuristics) and asserts the
 * safety wiring is present and correctly ordered, so an accidental edit that
 * removes the gate or unwraps a destructive prisma command fails CI.
 *
 *   - build paths run check-migration-safety BEFORE `prisma migrate deploy`
 *   - db:reset / db:migrate / db:push route through safe-prisma.mjs
 *   - NO npm script invokes a raw destructive prisma command
 *     (`migrate dev`, `migrate reset`, `db push`) outside the wrapper
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = join(__dirname, "..", "..");

function readJson(rel: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(SRC, rel), "utf-8"));
}

const pkg = readJson("package.json") as { scripts: Record<string, string> };
const vercel = readJson("vercel.json") as { buildCommand: string };

function checkBeforeMigrateDeploy(cmd: string): boolean {
  const check = cmd.indexOf("check-migration-safety");
  const deploy = cmd.indexOf("migrate deploy");
  return check !== -1 && deploy !== -1 && check < deploy;
}

describe("build gate ordering", () => {
  test("package.json build runs check-migration-safety before migrate deploy", () => {
    expect(checkBeforeMigrateDeploy(pkg.scripts.build)).toBe(true);
  });

  test("vercel.json buildCommand runs check-migration-safety before migrate deploy", () => {
    expect(checkBeforeMigrateDeploy(vercel.buildCommand)).toBe(true);
  });
});

describe("destructive db scripts route through safe-prisma", () => {
  test("db:reset goes through safe-prisma migrate reset", () => {
    expect(pkg.scripts["db:reset"]).toMatch(/safe-prisma\.mjs migrate reset/);
  });
  test("db:migrate goes through safe-prisma migrate dev", () => {
    expect(pkg.scripts["db:migrate"]).toMatch(/safe-prisma\.mjs migrate dev/);
  });
  test("db:push goes through safe-prisma db push", () => {
    expect(pkg.scripts["db:push"]).toMatch(/safe-prisma\.mjs db push/);
  });
});

describe("no raw unguarded destructive prisma command in any npm script", () => {
  // `prisma migrate deploy` and `prisma generate` are allowed raw — they cannot wipe.
  const RAW_DESTRUCTIVE = /\bprisma\s+migrate\s+(dev|reset)\b|\bprisma\s+db\s+push\b/;

  test("every script either avoids destructive prisma or wraps it in safe-prisma.mjs", () => {
    const offenders = Object.entries(pkg.scripts).filter(([, cmd]) =>
      RAW_DESTRUCTIVE.test(cmd),
    );
    expect(offenders).toEqual([]);
  });
});
