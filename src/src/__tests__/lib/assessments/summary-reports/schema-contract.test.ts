import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { Prisma } from "@prisma/client";

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

  it("preserves the generated client's complete artifact/provenance and source field contract", () => {
    const scalarFields = (name: string) => Object.fromEntries(Prisma.dmmf.datamodel.models.find((model) => model.name === name)!.fields.filter((field) => field.kind !== "object").map((field) => [field.name, `${field.type}${field.isRequired ? "" : "?"}`]));
    expect(scalarFields("SummaryReport")).toEqual({
      id: "String", campaignId: "String", reportType: "SummaryReportType", name: "String",
      templateId: "String", versionId: "String", language: "String", createdByUserId: "String",
      createdByEmailSnapshot: "String", createdAt: "DateTime", rendererVersion: "String",
      inputSnapshot: "Json", inputHash: "String", moderationManifest: "Json?", creationRequestId: "String",
      artifactPath: "String", artifactSha256: "String", artifactSizeBytes: "Int", artifactCreatedAt: "DateTime",
    });
    expect(scalarFields("SummaryReportSource")).toEqual({ id: "String", summaryReportId: "String", submissionId: "String", role: "SummaryReportSourceRole", position: "Int", respondentSnapshot: "Json" });
    const enums = Prisma.dmmf.datamodel.enums;
    expect(enums.find((entry) => entry.name === "SummaryReportType")!.values.map((value) => value.name)).toEqual(["SCALING_CEO_FULL", "SCALING_CONDENSED_CEO", "SCALING_SELF_COMPARISON", "LVA_CEO_FULL", "QSP_V1_CEO_FULL", "QSP_V2_CEO_FULL", "ROCKEFELLER_FULL"]);
    expect(enums.find((entry) => entry.name === "SummaryReportSourceRole")!.values.map((value) => value.name)).toEqual(["CEO", "TEAM", "FOCUS", "EARLIER"]);
  });

  it.each([
    ["SummaryReport", "campaign", "AssessmentCampaign", "campaignId", "Restrict", "assessment_campaigns", "summary_reports"],
    ["SummaryReportSource", "summaryReport", "SummaryReport", "summaryReportId", "Cascade", "summary_reports", "summary_report_sources"],
    ["SummaryReportSource", "submission", "AssessmentSubmission", "submissionId", "Restrict", "assessment_submissions", "summary_report_sources"],
  ])("pins %s.%s foreign keys, delete action and inverse relation", (modelName, fieldName, target, from, deleteAction, table, sourceTable) => {
    const models = Prisma.dmmf.datamodel.models;
    const relation = models.find((model) => model.name === modelName)!.fields.find((field) => field.name === fieldName)!;
    expect(relation).toMatchObject({ type: target, relationFromFields: [from], relationToFields: ["id"], relationOnDelete: deleteAction });
    expect(models.find((model) => model.name === target)!.fields).toEqual(expect.arrayContaining([expect.objectContaining({ type: modelName, isList: true, relationName: relation.relationName })]));
    expect(executableMigration).toMatch(new RegExp(`ALTER TABLE "${sourceTable}"\\s+ADD CONSTRAINT "${sourceTable}_${from}_fkey"\\s+FOREIGN KEY \\("${from}"\\) REFERENCES "${table}"\\("id"\\)\\s+ON DELETE ${deleteAction.toUpperCase()} ON UPDATE CASCADE`));
  });

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
