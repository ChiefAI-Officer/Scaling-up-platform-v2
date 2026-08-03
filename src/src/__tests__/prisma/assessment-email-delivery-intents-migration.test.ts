import { readFileSync } from "fs";
import path from "path";

const MIGRATION_PATH = path.join(
  process.cwd(),
  "prisma",
  "migrations",
  "20260803140000_add_assessment_email_delivery_intents",
  "migration.sql",
);

describe("assessment email delivery intents migration", () => {
  it("creates the additive intent ledger with its reconciliation indexes", () => {
    const sql = readFileSync(MIGRATION_PATH, "utf8");

    expect(sql).toContain('CREATE TABLE "assessment_email_delivery_intents"');
    expect(sql).toContain(
      'CREATE UNIQUE INDEX "assessment_email_delivery_intents_submissionId_recipientRole_key"',
    );
    expect(sql).toContain('("status", "nextAttemptAt", "createdAt", "id")');
    expect(sql).toContain('("status", "expiresAt", "id")');
    expect(sql).toContain('("status", "heldAt", "id")');
    expect(sql).toMatch(/ON DELETE CASCADE/);
    expect(sql).not.toMatch(/INSERT INTO "assessment_email_delivery_intents"/);
    expect(sql).not.toMatch(/AssessmentEmailOutbox.*ALTER COLUMN/s);
  });
});
