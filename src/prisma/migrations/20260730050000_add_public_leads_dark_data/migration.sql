-- Spec 19ao: default-off Public leads data/access foundation.
-- This migration is additive except for replacing the incorrectly global
-- public idempotency index with the campaign-scoped equivalent.

ALTER TABLE "coaches"
  ADD COLUMN "deletedAt" TIMESTAMP(3),
  ADD COLUMN "publicLeadMailQuiescedAt" TIMESTAMP(3);

CREATE INDEX "coaches_deletedAt_idx" ON "coaches" ("deletedAt");

CREATE TABLE "coach_referral_keys" (
  "id" TEXT NOT NULL,
  "coachId" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "coach_referral_keys_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "coach_referral_keys_coachId_fkey"
    FOREIGN KEY ("coachId") REFERENCES "coaches"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "coach_referral_keys_key_key"
  ON "coach_referral_keys" ("key");
CREATE INDEX "coach_referral_keys_coachId_revokedAt_idx"
  ON "coach_referral_keys" ("coachId", "revokedAt");

CREATE TABLE "coach_email_identities" (
  "normalizedEmail" TEXT NOT NULL,
  "coachId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "coach_email_identities_pkey" PRIMARY KEY ("normalizedEmail"),
  CONSTRAINT "coach_email_identities_coachId_fkey"
    FOREIGN KEY ("coachId") REFERENCES "coaches"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "coach_email_identities_kind_check"
    CHECK ("kind" IN ('CURRENT', 'LEGACY'))
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "coaches"
    GROUP BY LOWER(BTRIM("email"))
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Cannot create Coach email identity namespace: normalized Coach emails collide';
  END IF;
END
$$;

INSERT INTO "coach_email_identities"
  ("normalizedEmail", "coachId", "kind", "createdAt", "updatedAt")
SELECT LOWER(BTRIM("email")), "id", 'CURRENT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "coaches";

CREATE INDEX "coach_email_identities_coachId_kind_revokedAt_idx"
  ON "coach_email_identities" ("coachId", "kind", "revokedAt");
CREATE UNIQUE INDEX "coach_email_identities_one_current_per_coach_key"
  ON "coach_email_identities" ("coachId")
  WHERE "kind" = 'CURRENT' AND "revokedAt" IS NULL;

CREATE OR REPLACE FUNCTION "sync_coach_email_identity"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  new_normalized TEXT := LOWER(BTRIM(NEW."email"));
  old_normalized TEXT;
BEGIN
  IF new_normalized = '' THEN
    RAISE EXCEPTION 'Coach email cannot normalize to blank';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    old_normalized := LOWER(BTRIM(OLD."email"));
    IF old_normalized = new_normalized THEN
      RETURN NEW;
    END IF;

    UPDATE "coach_email_identities"
    SET "kind" = 'LEGACY', "updatedAt" = CURRENT_TIMESTAMP
    WHERE "normalizedEmail" = old_normalized
      AND "coachId" = OLD."id"
      AND "kind" = 'CURRENT';
  END IF;

  INSERT INTO "coach_email_identities"
    ("normalizedEmail", "coachId", "kind", "createdAt", "updatedAt")
  VALUES
    (new_normalized, NEW."id", 'CURRENT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

  RETURN NEW;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION
      'Normalized Coach email identity % is already owned', new_normalized
      USING ERRCODE = '23505';
END
$$;

CREATE TRIGGER "coaches_sync_email_identity"
AFTER INSERT OR UPDATE OF "email" ON "coaches"
FOR EACH ROW
EXECUTE FUNCTION "sync_coach_email_identity"();

ALTER TABLE "assessment_submissions"
  ADD COLUMN "referringCoachId" TEXT,
  ADD COLUMN "referringCoachEmailSnapshot" TEXT,
  ADD COLUMN "attributionSource" TEXT,
  ADD COLUMN "publicLeadPolicyVersion" TEXT,
  ADD COLUMN "publicLeadDeletedAt" TIMESTAMP(3),
  ADD COLUMN "publicTakerNameNormalized" TEXT,
  ADD COLUMN "publicTakerEmailNormalized" TEXT,
  ADD COLUMN "requestFingerprint" TEXT,
  ADD COLUMN "requestFingerprintVersion" INTEGER;

ALTER TABLE "assessment_submissions"
  ADD CONSTRAINT "assessment_submissions_referringCoachId_fkey"
  FOREIGN KEY ("referringCoachId") REFERENCES "coaches"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

UPDATE "assessment_submissions"
SET
  "publicTakerEmailNormalized" =
    LOWER(BTRIM(COALESCE("publicTaker"->>'email', ''))),
  "publicTakerNameNormalized" =
    LOWER(BTRIM(CONCAT_WS(
      ' ',
      "publicTaker"->>'firstName',
      "publicTaker"->>'lastName'
    )))
WHERE "publicTaker" IS NOT NULL;

DROP INDEX IF EXISTS "assessment_submissions_idempotencyKey_key";

CREATE UNIQUE INDEX "assessment_submissions_campaignId_idempotencyKey_key"
  ON "assessment_submissions" ("campaignId", "idempotencyKey")
  WHERE "idempotencyKey" IS NOT NULL;

CREATE INDEX "assessment_submissions_referringCoachId_submittedAt_id_idx"
  ON "assessment_submissions" ("referringCoachId", "submittedAt", "id");
CREATE INDEX "assessment_submissions_publicLeadDeletedAt_idx"
  ON "assessment_submissions" ("publicLeadDeletedAt");
CREATE INDEX "assessment_submissions_owner_email_prefix_idx"
  ON "assessment_submissions"
    ("referringCoachId", "publicTakerEmailNormalized" text_pattern_ops)
  WHERE "referringCoachId" IS NOT NULL AND "publicLeadDeletedAt" IS NULL;
CREATE INDEX "assessment_submissions_owner_name_prefix_idx"
  ON "assessment_submissions"
    ("referringCoachId", "publicTakerNameNormalized" text_pattern_ops)
  WHERE "referringCoachId" IS NOT NULL AND "publicLeadDeletedAt" IS NULL;

CREATE TABLE "public_lead_exports" (
  "id" TEXT NOT NULL,
  "requestedByUserId" TEXT NOT NULL,
  "ownerCoachId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "filter" JSONB NOT NULL,
  "authorizationGeneration" INTEGER NOT NULL DEFAULT 0,
  "manifestDigest" TEXT,
  "manifestRowCount" INTEGER,
  "emittedDigest" TEXT,
  "emittedRowCount" INTEGER,
  "artifactCiphertext" BYTEA,
  "artifactNonce" BYTEA,
  "artifactAuthTag" BYTEA,
  "artifactKeyVersion" TEXT,
  "expiresAt" TIMESTAMP(3),
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "abortedAt" TIMESTAMP(3),
  "errorClass" TEXT,
  "nextSortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "public_lead_exports_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "public_lead_exports_requestedByUserId_createdAt_idx"
  ON "public_lead_exports" ("requestedByUserId", "createdAt");
CREATE INDEX "public_lead_exports_status_createdAt_idx"
  ON "public_lead_exports" ("status", "createdAt");

CREATE TABLE "public_lead_export_items" (
  "id" TEXT NOT NULL,
  "exportId" TEXT NOT NULL,
  "submissionId" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL,
  CONSTRAINT "public_lead_export_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "public_lead_export_items_exportId_fkey"
    FOREIGN KEY ("exportId") REFERENCES "public_lead_exports"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "public_lead_export_items_submissionId_fkey"
    FOREIGN KEY ("submissionId") REFERENCES "assessment_submissions"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "public_lead_export_items_exportId_submissionId_key"
  ON "public_lead_export_items" ("exportId", "submissionId");
CREATE UNIQUE INDEX "public_lead_export_items_exportId_sortOrder_key"
  ON "public_lead_export_items" ("exportId", "sortOrder");
CREATE INDEX "public_lead_export_items_submissionId_idx"
  ON "public_lead_export_items" ("submissionId");

CREATE TABLE "public_lead_export_exclusions" (
  "id" TEXT NOT NULL,
  "exportItemId" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "public_lead_export_exclusions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "public_lead_export_exclusions_exportItemId_fkey"
    FOREIGN KEY ("exportItemId") REFERENCES "public_lead_export_items"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "public_lead_export_exclusions_exportItemId_key"
  ON "public_lead_export_exclusions" ("exportItemId");

CREATE TABLE "public_lead_export_chunks" (
  "id" TEXT NOT NULL,
  "exportId" TEXT NOT NULL,
  "batchIndex" INTEGER NOT NULL,
  "ciphertext" BYTEA NOT NULL,
  "nonce" BYTEA NOT NULL,
  "authTag" BYTEA NOT NULL,
  "rowCount" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "public_lead_export_chunks_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "public_lead_export_chunks_exportId_fkey"
    FOREIGN KEY ("exportId") REFERENCES "public_lead_exports"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "public_lead_export_chunks_exportId_batchIndex_key"
  ON "public_lead_export_chunks" ("exportId", "batchIndex");
CREATE INDEX "public_lead_export_chunks_exportId_batchIndex_idx"
  ON "public_lead_export_chunks" ("exportId", "batchIndex");
