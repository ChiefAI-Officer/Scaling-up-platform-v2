-- Quick Assessment (Spec 15): durable email outbox + public-submit idempotency.
-- ADDITIVE ONLY (ADD COLUMN / CREATE TABLE / CREATE INDEX / ADD CONSTRAINT) — no
-- destructive ops, so no `-- @approved` needed for the migration-safety gate.

-- 1. Public-submit idempotency key on submissions (nullable; only set for PUBLIC).
ALTER TABLE "assessment_submissions" ADD COLUMN "idempotencyKey" TEXT;

-- Partial unique index: enforce uniqueness only on non-null keys (mirrors the
-- existing resultsTokenHash partial-unique pattern on this table).
CREATE UNIQUE INDEX "assessment_submissions_idempotencyKey_key"
  ON "assessment_submissions" ("idempotencyKey")
  WHERE "idempotencyKey" IS NOT NULL;

-- 2. Durable email outbox for lead/result notifications.
CREATE TABLE "assessment_email_outbox" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "recipientEmail" TEXT NOT NULL,
    "recipientRole" TEXT NOT NULL,
    "emailType" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "bodyHtml" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "sentAt" TIMESTAMP(3),
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "assessment_email_outbox_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "assessment_email_outbox_submissionId_recipientRole_key"
  ON "assessment_email_outbox" ("submissionId", "recipientRole");

CREATE INDEX "assessment_email_outbox_status_nextAttemptAt_idx"
  ON "assessment_email_outbox" ("status", "nextAttemptAt");

CREATE INDEX "assessment_email_outbox_submissionId_idx"
  ON "assessment_email_outbox" ("submissionId");

ALTER TABLE "assessment_email_outbox"
  ADD CONSTRAINT "assessment_email_outbox_submissionId_fkey"
  FOREIGN KEY ("submissionId") REFERENCES "assessment_submissions"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
