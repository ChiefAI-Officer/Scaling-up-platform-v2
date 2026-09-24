import fs from "fs";
import path from "path";

describe("timezone schema migration", () => {
  const root = path.join(process.cwd(), "prisma");

  it("adds defaulted organization and campaign timezone columns", () => {
    const schema = fs.readFileSync(path.join(root, "schema.prisma"), "utf8");
    expect(schema).toMatch(
      /model Organization[\s\S]*?timezone\s+String\s+@default\("America\/New_York"\)/,
    );
    expect(schema).toMatch(
      /model AssessmentCampaign[\s\S]*?timezone\s+String\s+@default\("America\/New_York"\)/,
    );

    const sql = fs.readFileSync(
      path.join(
        root,
        "migrations/20260924150000_add_organization_campaign_timezones/migration.sql",
      ),
      "utf8",
    );
    expect(sql).toContain('ALTER TABLE "organizations"');
    expect(sql).toContain('ALTER TABLE "assessment_campaigns"');
    expect(sql.match(/DEFAULT 'America\/New_York'/g)).toHaveLength(2);
  });
});
