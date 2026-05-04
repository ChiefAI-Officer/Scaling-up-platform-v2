-- BUG-06–08: mark backfill-created messages so they can be reverted cleanly
ALTER TABLE "approval_messages" ADD COLUMN "synthetic" BOOLEAN NOT NULL DEFAULT false;

-- Index supports the backfill script's idempotency dup-check
CREATE INDEX "approval_messages_approvalId_synthetic_idx" ON "approval_messages"("approvalId", "synthetic");
