import { existsSync, readFileSync } from "fs";
import { join } from "path";

const APP_ROOT = join(__dirname, "..", "..", "..", "..", "..");
const SCHEMA_PATH = join(APP_ROOT, "prisma", "schema.prisma");
const MIGRATION_PATH = join(
  APP_ROOT,
  "prisma",
  "migrations",
  "20260827090000_add_summary_reports",
  "migration.sql",
);

function modelBlock(schema: string, modelName: string): string {
  return schema.match(new RegExp(`model ${modelName} \\{[\\s\\S]*?\\n\\}`))?.[0] ?? "";
}

function stripLineComments(sql: string): string {
  return sql
    .split(/\r?\n/)
    .filter((line) => !/^\s*--/.test(line))
    .join("\n");
}

describe("summary report persistence schema contract", () => {
  const schema = readFileSync(SCHEMA_PATH, "utf-8");
  const migration = existsSync(MIGRATION_PATH) ? readFileSync(MIGRATION_PATH, "utf-8") : "";
  const executableMigration = stripLineComments(migration);
  const summaryReport = modelBlock(schema, "SummaryReport");
  const summaryReportSource = modelBlock(schema, "SummaryReportSource");

  it("defines immutable generated reports and their ordered source rows", () => {
    expect(summaryReport).toMatch(/@@map\("summary_reports"\)/);
    expect(summaryReport).toMatch(/creationRequestId\s+String\s+@unique/);
    expect(summaryReport).toMatch(/artifactPath\s+String\s+@unique/);
    expect(summaryReportSource).toMatch(/@@map\("summary_report_sources"\)/);
    expect(summaryReportSource).toMatch(/position\s+Int/);
  });

  it("prevents duplicate submissions and duplicate role positions within a report", () => {
    expect(summaryReportSource).toMatch(/@@unique\(\[summaryReportId, submissionId\]\)/);
    expect(summaryReportSource).toMatch(
      /@@unique\(\[summaryReportId, role, position\]\)/,
    );

    expect(executableMigration).toMatch(
      /CREATE UNIQUE INDEX "summary_report_sources_summaryReportId_submissionId_key"\s+ON "summary_report_sources"\("summaryReportId", "submissionId"\)/,
    );
    expect(executableMigration).toMatch(
      /CREATE UNIQUE INDEX "summary_report_sources_summaryReportId_role_position_key"\s+ON "summary_report_sources"\("summaryReportId", "role", "position"\)/,
    );
  });

  it("does not expose an updatedAt mutation path on either immutable model", () => {
    expect(summaryReport).not.toMatch(/\bupdatedAt\b/);
    expect(summaryReportSource).not.toMatch(/\bupdatedAt\b/);
  });

  it("rejects UPDATE and DELETE for reports and report sources with SQLSTATE 55000", () => {
    expect(executableMigration).toMatch(
      /CREATE OR REPLACE FUNCTION reject_summary_report_mutation\(\)/,
    );
    expect(executableMigration).toMatch(/RAISE EXCEPTION USING ERRCODE = '55000'/);

    expect(executableMigration).toMatch(
      /CREATE TRIGGER "summary_reports_reject_mutation"\s+BEFORE UPDATE OR DELETE ON "summary_reports"\s+FOR EACH ROW EXECUTE FUNCTION reject_summary_report_mutation\(\)/,
    );
    expect(executableMigration).toMatch(
      /CREATE TRIGGER "summary_report_sources_reject_mutation"\s+BEFORE UPDATE OR DELETE ON "summary_report_sources"\s+FOR EACH ROW EXECUTE FUNCTION reject_summary_report_mutation\(\)/,
    );
  });
});
