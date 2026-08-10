-- Admin-authored defaults for future INVITED campaigns and immutable campaign
-- snapshots. Both columns remain nullable for dark deployment and rollback.
ALTER TABLE "assessment_templates"
  ADD COLUMN "invitedWelcomeDefault" JSONB;

ALTER TABLE "assessment_campaigns"
  ADD COLUMN "invitedWelcomeSnapshot" JSONB;

-- One deterministic migration-only resolver keeps the template and campaign
-- backfills byte-identical. PUBLIC campaigns never call this function.
CREATE OR REPLACE FUNCTION migration_invited_welcome_config(template_alias TEXT)
RETURNS JSONB AS $$
DECLARE
  lede JSONB;
  fine_print TEXT;
BEGIN
  CASE template_alias
    WHEN 'leadership-vision-alignment' THEN
      lede := jsonb_build_array(
        'The Leadership Vision Alignment Assessment lists all the leadership team members'' views on the company''s current status, its priorities and its future. Great for preparing your strategy sessions and priority making.'
      );
      fine_print := 'Answer in one sitting or come back later — your link stays active.';
    WHEN 'qsp-v2' THEN
      lede := jsonb_build_array(
        'This is your Quarterly Session Preparation Assessment. It lists all the leadership team members'' views on the company''s performance in the previous quarter and their ideas and wishes for the coming quarter. Great for preparing your new Quarterly Session and priority making.'
      );
      fine_print := 'Answer in one sitting or come back later — your link stays active.';
    WHEN 'RockHabits' THEN
      lede := jsonb_build_array(
        'The checklist has been predominantly devised utilizing the Scaling Up / Rockefeller Habits 2.0 methodology, alongside academic growth models and organizational development theories. We have received input from many seasoned growth entrepreneurs, coaches, mentors and academics.',
        'We would highly recommend repeating this checklist annually, in order to keep track of your progress. In the questionnaire, each item is rated on a scale from 0 to 3, with four items in each habit.'
      );
      fine_print := 'Answer in one sitting or come back later — your link stays active.';
    WHEN 'five-dysfunctions' THEN
      lede := jsonb_build_array(
        'This is your Five Dysfunctions assessment. It lists all the team members'' views on the five fundamentals of teamwork: trust, constructive conflict, commitment, accountability and results. Great for preparing your next team session.'
      );
      fine_print := 'Answer in one sitting or come back later — your link stays active.';
    WHEN 'scaling-up-full' THEN
      lede := jsonb_build_array(
        'The assessment has been predominantly devised utilizing the Scaling Up / Rockefeller Habits 2.0 methodology, alongside academic growth models and organizational development theories. We have received input from many seasoned growth entrepreneurs, coaches, mentors and academics.',
        'We hope and believe you will be positively surprised by the number of Scaling Up insights throughout your report. We would highly recommend repeating this assessment annually, in order to keep track of your progress.'
      );
      fine_print := 'Answer in one sitting or come back later — your link stays active.';
    ELSE
      lede := jsonb_build_array(
        'A quick check on how your team works together. You can answer in one sitting or come back later — your link stays active.'
      );
      fine_print := NULL;
  END CASE;

  RETURN jsonb_build_object(
    'schemaVersion', 1,
    'eyebrow', 'You''re invited',
    'headingTemplate', '{{campaignName}}',
    'ledeParagraphs', lede,
    'sharingHeading', 'How your answers are shared',
    'scoresHeading', 'Your category scores',
    'scoresDescription', 'See where the team stands across each category.',
    'ctaLabel', 'Start the assessment',
    'finePrint', fine_print
  );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

UPDATE "assessment_templates" AS t
SET "invitedWelcomeDefault" = migration_invited_welcome_config(t."alias")
WHERE t."deletedAt" IS NULL
  AND t."invitedWelcomeDefault" IS NULL;

UPDATE "assessment_campaigns" AS c
SET "invitedWelcomeSnapshot" = migration_invited_welcome_config(t."alias")
FROM "assessment_templates" AS t
WHERE c."templateId" = t."id"
  AND c."accessMode" = 'INVITED'
  AND c."invitedWelcomeSnapshot" IS NULL;

DROP FUNCTION migration_invited_welcome_config(TEXT);

CREATE OR REPLACE FUNCTION assessment_campaign_block_invited_welcome_snapshot_mutation()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD."invitedWelcomeSnapshot" IS NOT NULL
     AND NEW."invitedWelcomeSnapshot" IS DISTINCT FROM OLD."invitedWelcomeSnapshot" THEN
    RAISE EXCEPTION 'AssessmentCampaign invited Welcome snapshot is immutable once set (campaign=%).', OLD.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER assessment_campaign_invited_welcome_snapshot_immutability_trigger
BEFORE UPDATE OF "invitedWelcomeSnapshot" ON "assessment_campaigns"
FOR EACH ROW
EXECUTE FUNCTION assessment_campaign_block_invited_welcome_snapshot_mutation();
