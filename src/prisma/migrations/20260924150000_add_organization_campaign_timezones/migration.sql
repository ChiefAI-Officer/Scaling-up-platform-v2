-- Additive defaults preserve the platform's historical Eastern-time meaning
-- while making future wall-clock intent explicit.
ALTER TABLE "organizations"
ADD COLUMN "timezone" TEXT NOT NULL DEFAULT 'America/New_York';

ALTER TABLE "assessment_campaigns"
ADD COLUMN "timezone" TEXT NOT NULL DEFAULT 'America/New_York';
