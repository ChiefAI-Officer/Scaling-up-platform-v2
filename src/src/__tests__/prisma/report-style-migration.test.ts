import fs from "fs";
import path from "path";

const appRoot = process.cwd();
const schemaPath = path.join(appRoot, "prisma/schema.prisma");
const migrationPath = path.join(
  appRoot,
  "prisma/migrations/20260805090000_add_assessment_report_styles/migration.sql",
);

describe("assessment report style persistence migration", () => {
  it("defines the closed style policy and backfills the first completed submission", () => {
    const schema = fs.readFileSync(schemaPath, "utf8");
    const sql = fs.readFileSync(migrationPath, "utf8");

    expect(schema).toMatch(
      /enum AssessmentReportStyle \{\s+CLASSIC\s+EXECUTIVE_BOARDROOM\s+MODERN_DASHBOARD\s+\}/s,
    );
    expect(schema).toMatch(
      /enum AssessmentReportStyleSource \{\s+TEMPLATE_DEFAULT\s+CAMPAIGN_OVERRIDE\s+\}/s,
    );
    expect(schema).toMatch(
      /defaultReportStyle\s+AssessmentReportStyle\s+@default\(CLASSIC\)/,
    );
    expect(schema).toMatch(
      /reportStyle\s+AssessmentReportStyle\s+@default\(CLASSIC\)/,
    );
    expect(schema).toMatch(
      /reportStyleSource\s+AssessmentReportStyleSource\s+@default\(TEMPLATE_DEFAULT\)/,
    );
    expect(schema).toMatch(/reportStyleLockedAt\s+DateTime\?/);

    expect(sql).toContain('CREATE TYPE "AssessmentReportStyle" AS ENUM');
    expect(sql).toContain('CREATE TYPE "AssessmentReportStyleSource" AS ENUM');
    expect(sql).toMatch(
      /ADD COLUMN "defaultReportStyle" "AssessmentReportStyle" NOT NULL DEFAULT 'CLASSIC'/,
    );
    expect(sql).toMatch(
      /ADD COLUMN "reportStyle" "AssessmentReportStyle" NOT NULL DEFAULT 'CLASSIC'/,
    );
    expect(sql).toMatch(
      /ADD COLUMN "reportStyleSource" "AssessmentReportStyleSource" NOT NULL DEFAULT 'TEMPLATE_DEFAULT'/,
    );
    expect(sql).toContain('ADD COLUMN "reportStyleLockedAt" TIMESTAMP(3)');
    expect(sql).toContain('MIN("submittedAt")');
    expect(sql).toContain('GROUP BY "campaignId"');
    expect(sql).toMatch(
      /WHERE c\."id" = first_submission\."campaignId"/,
    );
  });
});
