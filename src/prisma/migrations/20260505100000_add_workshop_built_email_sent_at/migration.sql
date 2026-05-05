-- BUG-MAY4-2: atomic guard column to prevent duplicate "Workshop Ready" emails
ALTER TABLE "workshops" ADD COLUMN "workshopBuiltEmailSentAt" TIMESTAMP(3);
