-- Persist the report-style policy independently of versioned assessment content.
-- Existing rows retain Classic output. Campaigns with completed submissions are
-- locked at their first completion; campaigns with none remain editable.

CREATE TYPE "AssessmentReportStyle" AS ENUM ('CLASSIC', 'EXECUTIVE_BOARDROOM', 'MODERN_DASHBOARD');
CREATE TYPE "AssessmentReportStyleSource" AS ENUM ('TEMPLATE_DEFAULT', 'CAMPAIGN_OVERRIDE');

ALTER TABLE "assessment_templates"
  ADD COLUMN "defaultReportStyle" "AssessmentReportStyle" NOT NULL DEFAULT 'CLASSIC';

ALTER TABLE "assessment_campaigns"
  ADD COLUMN "reportStyle" "AssessmentReportStyle" NOT NULL DEFAULT 'CLASSIC',
  ADD COLUMN "reportStyleSource" "AssessmentReportStyleSource" NOT NULL DEFAULT 'TEMPLATE_DEFAULT',
  ADD COLUMN "reportStyleLockedAt" TIMESTAMP(3);

UPDATE "assessment_campaigns" AS c
SET "reportStyleLockedAt" = first_submission."submittedAt"
FROM (
  SELECT "campaignId", MIN("submittedAt") AS "submittedAt"
  FROM "assessment_submissions"
  GROUP BY "campaignId"
) AS first_submission
WHERE c."id" = first_submission."campaignId";
