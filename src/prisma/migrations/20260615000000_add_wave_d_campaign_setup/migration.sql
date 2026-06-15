-- Wave D (Spec 17) — campaign-setup additive migration.
--
-- ADDITIVE ONLY. Every change is a new nullable / defaulted column, one new
-- enum type, a one-time idempotent backfill, and one new partial index. No
-- column is dropped, no data is truncated, NO core-table NOT NULL is relaxed.
-- Safe to deploy ahead of the feature code.
--
-- IMPORTANT: there is intentionally NO new `AssessmentCampaignStatus` value.
-- "Scheduled" is a DERIVED app-state computed in code
--   (status = DRAFT AND inviteTiming = ON_OPEN AND invitesSentAt IS NULL AND openAt > now)
-- so this migration MUST NOT `ALTER TYPE "AssessmentCampaignStatus"`.

-- 1. New enum: invitation dispatch timing.
CREATE TYPE "AssessmentInviteTiming" AS ENUM ('IMMEDIATELY', 'ON_OPEN');

-- 2. AssessmentCampaign — additive columns (all nullable or defaulted).
ALTER TABLE "assessment_campaigns"
  ADD COLUMN "deletedAt" TIMESTAMP(3),
  ADD COLUMN "inviteTiming" "AssessmentInviteTiming" NOT NULL DEFAULT 'IMMEDIATELY',
  ADD COLUMN "inviteSendStartedAt" TIMESTAMP(3),
  ADD COLUMN "inviteSendHeartbeatAt" TIMESTAMP(3),
  ADD COLUMN "invitesSentAt" TIMESTAMP(3),
  ADD COLUMN "sendResultsToRespondent" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "notifyCoachOnCompletion" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "invitationBodyHtml" TEXT;

-- 3. AssessmentTemplate — results-email approval-binding columns.
ALTER TABLE "assessment_templates"
  ADD COLUMN "resultsEmailContentApprovedHash" TEXT,
  ADD COLUMN "resultsEmailContentApprovedAt" TIMESTAMP(3),
  ADD COLUMN "resultsEmailContentApprovedBy" TEXT;

-- 4. Backfill: stamp existing campaigns as already-sent so the future
--    scheduled-send cron never re-sends legacy (pre-Wave-D) invitations.
--    COALESCE keeps this idempotent if re-run.
UPDATE "assessment_campaigns"
  SET "invitesSentAt" = COALESCE("invitesSentAt", "createdAt")
  WHERE "invitesSentAt" IS NULL;

-- 5. Partial composite index for the due-unsent scheduled-send scan. Prisma
--    cannot express a partial index in schema.prisma, so it lives only here.
CREATE INDEX "idx_campaign_due_unsent"
  ON "assessment_campaigns" ("openAt")
  WHERE "invitesSentAt" IS NULL AND "inviteSendStartedAt" IS NULL AND "deletedAt" IS NULL;
