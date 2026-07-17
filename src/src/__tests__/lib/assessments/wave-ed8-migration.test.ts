/**
 * Wave ED8 — migration pin for 20260716150000_wave_ed8_version_archived_at
 * (spec 19ak §3, co-validate blocker C1).
 *
 * No live DB in CI, so the migration SQL is pinned statically (the spec's
 * approved "equivalent" verification): the file must add `archivedAt`
 * additively AND replace the v7.5 immutability trigger FUNCTION (same
 * function name, `CREATE OR REPLACE FUNCTION` only — the trigger itself is
 * untouched) so that published rows accept archivedAt-only UPDATEs while
 * everything else (content, scoring, publishedAt, DELETE) still raises.
 */
import { readFileSync } from "fs";
import { join } from "path";

const MIGRATIONS_DIR = join(__dirname, "..", "..", "..", "..", "prisma", "migrations");

const NEW_MIGRATION = join(
  MIGRATIONS_DIR,
  "20260716150000_wave_ed8_version_archived_at",
  "migration.sql",
);

const V75_MIGRATION = join(
  MIGRATIONS_DIR,
  "20260514230000_add_assessment_infrastructure_v7_5",
  "migration.sql",
);

/** Strip SQL line comments so DDL assertions test executable statements only. */
function stripLineComments(sql: string): string {
  return sql
    .split(/\r?\n/)
    .filter((line) => !/^\s*--/.test(line))
    .join("\n");
}

describe("Wave ED8 migration (archivedAt + immutability-trigger replacement)", () => {
  const sql = readFileSync(NEW_MIGRATION, "utf-8");
  const executableSql = stripLineComments(sql);
  const v75Sql = readFileSync(V75_MIGRATION, "utf-8");

  it("adds the archivedAt column additively (nullable, no default rewrite)", () => {
    expect(executableSql).toMatch(
      /ALTER TABLE "assessment_template_versions"\s+ADD COLUMN "archivedAt" TIMESTAMP\(3\);/,
    );
    // Additive only: nullable column, no NOT NULL, no DEFAULT backfill.
    const alterLine = executableSql
      .split(/\r?\n/)
      .find((l) => /ALTER TABLE "assessment_template_versions"/.test(l));
    expect(alterLine).toBeDefined();
    expect(alterLine).not.toMatch(/NOT NULL/i);
    expect(alterLine).not.toMatch(/DEFAULT/i);
  });

  it("replaces the SAME function name the v7.5 migration installed (CREATE OR REPLACE, trigger untouched)", () => {
    const v75FnMatch = v75Sql.match(
      /CREATE OR REPLACE FUNCTION\s+([A-Za-z0-9_]+)\s*\(\)/,
    );
    expect(v75FnMatch).not.toBeNull();
    const fnName = (v75FnMatch as RegExpMatchArray)[1];

    // The new migration must CREATE OR REPLACE exactly that function...
    expect(executableSql).toMatch(
      new RegExp(`CREATE OR REPLACE FUNCTION\\s+${fnName}\\s*\\(\\)`),
    );
    // ...and must NOT touch the trigger wiring (no CREATE TRIGGER — the
    // existing trigger keeps pointing at the replaced function).
    expect(executableSql).not.toMatch(/CREATE\s+TRIGGER/i);
  });

  it("allows archivedAt-only UPDATEs on published rows (to_jsonb minus archivedAt comparison)", () => {
    // The column-complete allow-list: NEW and OLD must be identical once
    // archivedAt is removed from both sides.
    expect(executableSql).toMatch(
      /\(to_jsonb\(NEW\)\s*-\s*'archivedAt'\)\s+IS DISTINCT FROM\s+\(to_jsonb\(OLD\)\s*-\s*'archivedAt'\)/,
    );
    // The comparison must gate an UPDATE-branch RAISE on published rows.
    expect(executableSql).toMatch(/OLD\."publishedAt" IS NOT NULL/);
    expect(executableSql).toMatch(/TG_OP = 'UPDATE'/);
  });

  it("still raises on DELETE of published rows, unconditionally", () => {
    const deleteBranch = executableSql.match(
      /IF TG_OP = 'DELETE' THEN\s+RAISE EXCEPTION/,
    );
    expect(deleteBranch).not.toBeNull();
    // The DELETE branch must not be softened by any archivedAt escape hatch.
    const deleteIdx = executableSql.indexOf("IF TG_OP = 'DELETE'");
    const raiseIdx = executableSql.indexOf("RAISE EXCEPTION", deleteIdx);
    expect(deleteIdx).toBeGreaterThan(-1);
    expect(raiseIdx).toBeGreaterThan(deleteIdx);
    const betweenIfAndRaise = executableSql.slice(deleteIdx, raiseIdx);
    expect(betweenIfAndRaise).not.toMatch(/archivedAt/);
  });

  it("contains NO destructive DDL anywhere in the file (case-insensitive)", () => {
    // Whole file including comments — the Migration Safety Gate must have
    // nothing to even question.
    expect(sql).not.toMatch(/DROP /i);
    expect(sql).not.toMatch(/TRUNCATE/i);
    expect(sql).not.toMatch(/DELETE\s+FROM/i);
    expect(sql).not.toMatch(/ALTER\s+COLUMN\b.*\bDROP\b/i);
  });

  it("documents the ED8 archive semantics in a header comment", () => {
    expect(sql).toMatch(/Wave ED8/);
    expect(sql).toMatch(/19ak/);
    expect(sql).toMatch(/archivedAt/);
  });
});
