-- Spec 19ao / ADR-0030: additive shared assessment-email sending lease.
-- Old workers ignore these nullable/defaulted columns, so deployment must use
-- the quiesced expand/cutover runbook before new workers are resumed.

ALTER TABLE "assessment_email_outbox"
  ADD COLUMN "leaseToken" TEXT,
  ADD COLUMN "leaseExpiresAt" TIMESTAMP(3),
  ADD COLUMN "cancelledAt" TIMESTAMP(3),
  ADD COLUMN "cancelReason" TEXT,
  ADD COLUMN "featureKey" TEXT,
  ADD COLUMN "authorizationProvenance" JSONB,
  ADD COLUMN "contentProvenance" JSONB,
  ADD COLUMN "sendFenceGeneration" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "assessment_email_outbox_status_nextAttemptAt_createdAt_idx"
  ON "assessment_email_outbox" ("status", "nextAttemptAt", "createdAt");

CREATE INDEX "assessment_email_outbox_status_leaseExpiresAt_idx"
  ON "assessment_email_outbox" ("status", "leaseExpiresAt");
