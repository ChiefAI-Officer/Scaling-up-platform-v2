import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const schema = readFileSync(path.join(root, "prisma/schema.prisma"), "utf8");
const migrationPath = path.join(
  root,
  "prisma/migrations/20260915090000_add_assessment_campaign_closed_at/migration.sql",
);
const migration = existsSync(migrationPath)
  ? readFileSync(migrationPath, "utf8")
  : "";

describe("assessment campaign closed-at migration", () => {
  it("adds a purpose-specific nullable lifecycle timestamp", () => {
    const model =
      schema.match(/model AssessmentCampaign \{[\s\S]*?\n\}/)?.[0] ?? "";

    expect(model).toMatch(
      /^\s*closedAt\s+DateTime\?\s+\/\/ terminal lifecycle transition timestamp/m,
    );
  });

  it("uses one additive nullable column with no backfill or destructive clause", () => {
    expect(existsSync(migrationPath)).toBe(true);
    expect(migration).toContain(
      'ALTER TABLE "assessment_campaigns" ADD COLUMN "closedAt" TIMESTAMP(3);',
    );
    expect(migration).not.toMatch(
      /\bDEFAULT\b|\bUPDATE\b|\bDELETE\b|DROP\s+(?:TABLE|COLUMN)|NOT\s+NULL/i,
    );
  });
});
