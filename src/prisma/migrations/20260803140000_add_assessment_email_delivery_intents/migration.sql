-- Additive durable intent ledger for assessment-email reconciliation.
-- The existing assessment_email_outbox remains the sole SMTP-facing queue.

CREATE TABLE "assessment_email_delivery_intents" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "invitationId" TEXT NOT NULL,
    "respondentId" TEXT NOT NULL,
    "recipientRole" TEXT NOT NULL,
    "emailType" TEXT NOT NULL,
    "recipientEmail" TEXT,
    "subject" TEXT,
    "bodyHtml" TEXT,
    "payloadHash" TEXT NOT NULL,
    "snapshotSchemaVersion" INTEGER NOT NULL DEFAULT 1,
    "rendererContractVersion" INTEGER NOT NULL DEFAULT 1,
    "authorizationSnapshot" JSONB,
    "contentProvenance" JSONB,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "version" INTEGER NOT NULL DEFAULT 0,
    "holdReason" TEXT,
    "holdReasons" JSONB,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastErrorClass" TEXT,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "heldAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "handedOffOutboxId" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,
    "resolutionReasonCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "assessment_email_delivery_intents_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "assessment_email_delivery_intents_submissionId_recipientRole_key"
  ON "assessment_email_delivery_intents" ("submissionId", "recipientRole");

CREATE INDEX "assessment_email_delivery_intents_status_nextAttemptAt_createdAt_id_idx"
  ON "assessment_email_delivery_intents" ("status", "nextAttemptAt", "createdAt", "id");

CREATE INDEX "assessment_email_delivery_intents_status_expiresAt_id_idx"
  ON "assessment_email_delivery_intents" ("status", "expiresAt", "id");

CREATE INDEX "assessment_email_delivery_intents_status_heldAt_id_idx"
  ON "assessment_email_delivery_intents" ("status", "heldAt", "id");

CREATE INDEX "assessment_email_delivery_intents_submissionId_idx"
  ON "assessment_email_delivery_intents" ("submissionId");

ALTER TABLE "assessment_email_delivery_intents"
  ADD CONSTRAINT "assessment_email_delivery_intents_submissionId_fkey"
  FOREIGN KEY ("submissionId") REFERENCES "assessment_submissions"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
