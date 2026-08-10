import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const migrationPath = path.join(
  root,
  "prisma/migrations/20260810160000_add_invited_welcome_snapshots/migration.sql",
);

describe("invited Welcome snapshot migration", () => {
  it("adds nullable template defaults and campaign snapshots", () => {
    const schema = readFileSync(path.join(root, "prisma/schema.prisma"), "utf8");
    expect(schema).toMatch(/invitedWelcomeDefault\s+Json\?/);
    expect(schema).toMatch(/invitedWelcomeSnapshot\s+Json\?/);
  });

  it("backfills all invited lifecycles, leaves public rows untouched, then locks snapshots", () => {
    expect(existsSync(migrationPath)).toBe(true);
    const sql = existsSync(migrationPath) ? readFileSync(migrationPath, "utf8") : "";
    expect(sql).toContain('ADD COLUMN "invitedWelcomeDefault" JSONB');
    expect(sql).toContain('ADD COLUMN "invitedWelcomeSnapshot" JSONB');
    expect(sql).toContain('t."deletedAt" IS NULL');
    expect(sql).toContain('c."accessMode" = \'INVITED\'');
    expect(sql).not.toMatch(/c\."status"\s*=/);
    expect(sql).not.toMatch(/c\."deletedAt"\s+IS\s+NULL/);
    expect(sql).toContain("leadership-vision-alignment");
    expect(sql).toContain("qsp-v2");
    expect(sql).toContain("five-dysfunctions");
    expect(sql).toContain("RockHabits");
    expect(sql).toContain("scaling-up-full");
    expect(sql).toContain("assessment_campaign_invited_welcome_snapshot_immutability_trigger");
    expect(sql.indexOf('SET "invitedWelcomeSnapshot"')).toBeLessThan(
      sql.indexOf("CREATE TRIGGER assessment_campaign_invited_welcome_snapshot_immutability_trigger"),
    );
    expect(sql).toContain('OLD."invitedWelcomeSnapshot" IS NOT NULL');
    expect(sql).not.toContain("assessment_template_versions");
    expect(sql).not.toContain("contentHash");
  });
});
