-- Esperto historical-import: provenance + idempotency key on AssessmentCampaign.
--
-- ADDITIVE ONLY — adds one nullable column + a partial unique index. No data is
-- dropped, truncated, or deleted; existing campaigns keep externalId NULL.
--
-- The value is stored namespaced as "esperto:<campaignid>" (see spec 12 §6.2 / ADR-0006).
-- The Prisma-generated full unique index is replaced with a PARTIAL unique index
-- (WHERE "externalId" IS NOT NULL) so that the many non-imported campaigns can all
-- keep externalId NULL — mirroring the organizations.externalId pattern.

ALTER TABLE "assessment_campaigns" ADD COLUMN "externalId" TEXT;

DROP INDEX IF EXISTS "assessment_campaigns_externalId_key";
CREATE UNIQUE INDEX "assessment_campaigns_externalId_unique"
  ON "assessment_campaigns" ("externalId") WHERE "externalId" IS NOT NULL;
