import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const schema = readFileSync(path.join(root, "prisma/schema.prisma"), "utf8");
const migrationPath = path.join(
  root,
  "prisma/migrations/20260830100000_add_referred_results_coach_removal/migration.sql",
);
const migration = existsSync(migrationPath)
  ? readFileSync(migrationPath, "utf8")
  : "";

describe("referred results Coach-removal migration", () => {
  it("adds a purpose-specific nullable tombstone to AssessmentSubmission", () => {
    const model =
      schema.match(/model AssessmentSubmission \{[\s\S]*?\n\}/)?.[0] ?? "";

    expect(model).toMatch(
      /^\s*referredResultsDeletedAt\s+DateTime\?\s+\/\/ Coach-collection tombstone/m,
    );
    expect(model).not.toMatch(/^\s*deletedAt\s+DateTime\?/m);
  });

  it("uses an additive migration without rewriting or deleting submissions", () => {
    expect(existsSync(migrationPath)).toBe(true);
    expect(migration).toContain(
      'ALTER TABLE "assessment_submissions" ADD COLUMN "referredResultsDeletedAt" TIMESTAMP(3);',
    );
    expect(migration).not.toMatch(
      /\bDELETE\b|\bUPDATE\b|DROP\s+(?:TABLE|COLUMN)/i,
    );
  });
});
