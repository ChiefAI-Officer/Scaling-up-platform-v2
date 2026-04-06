-- Add COUNTER_OFFERED to ApprovalStatus enum
-- NOTE: ALTER TYPE ADD VALUE cannot run inside a transaction that also uses the new value
ALTER TYPE "ApprovalStatus" ADD VALUE IF NOT EXISTS 'COUNTER_OFFERED';

-- Add counter-offer fields to ApprovalQueue
ALTER TABLE "approval_queue"
  ADD COLUMN IF NOT EXISTS "counterOfferCents" INTEGER,
  ADD COLUMN IF NOT EXISTS "counterOfferNote"  TEXT;
