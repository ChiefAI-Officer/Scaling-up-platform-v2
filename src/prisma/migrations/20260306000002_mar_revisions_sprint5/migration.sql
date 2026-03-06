-- MR-33: Add coachResponse field to ApprovalQueue for INFO_REQUESTED messaging
ALTER TABLE "approval_queue" ADD COLUMN IF NOT EXISTS "coachResponse" TEXT;
