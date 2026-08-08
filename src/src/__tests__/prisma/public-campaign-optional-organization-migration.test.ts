import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(process.cwd());
const schema = readFileSync(path.join(root, "prisma/schema.prisma"), "utf8");
const migrationPath = path.join(
  root,
  "prisma/migrations/20260808120000_public_campaign_optional_organization/migration.sql",
);
const migration = existsSync(migrationPath)
  ? readFileSync(migrationPath, "utf8")
  : "";

describe("public campaign optional organization migration", () => {
  it("makes the AssessmentCampaign scalar and relation optional", () => {
    const model =
      schema.match(/model AssessmentCampaign \{[\s\S]*?\n\}/)?.[0] ?? "";

    expect(model).toMatch(/organizationId\s+String\?/);
    expect(model).toMatch(/organization\s+Organization\?/);
  });

  it("drops only NOT NULL and performs no row backfill", () => {
    expect(existsSync(migrationPath)).toBe(true);
    expect(migration).toMatch(
      /ALTER TABLE "assessment_campaigns" ALTER COLUMN "organizationId" DROP NOT NULL;/,
    );
    expect(migration).not.toMatch(/\bUPDATE\b|\bDELETE\b|\bINSERT\b/i);
  });
});
