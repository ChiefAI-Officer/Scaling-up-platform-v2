-- Classify assessment templates by delivery purpose. The two existing public
-- quiz instruments are explicit data migrations; runtime code must not infer
-- type from aliases after this migration.
CREATE TYPE "AssessmentTemplateDeliveryType" AS ENUM (
  'PUBLIC_MARKETING_QUIZ',
  'INVITED_ASSESSMENT'
);

ALTER TABLE "assessment_templates"
ADD COLUMN "deliveryType" "AssessmentTemplateDeliveryType";

UPDATE "assessment_templates"
SET "deliveryType" = CASE
  WHEN "alias" IN ('scaling-up-quick', 'sunhub-quick-quiz')
    THEN 'PUBLIC_MARKETING_QUIZ'::"AssessmentTemplateDeliveryType"
  ELSE 'INVITED_ASSESSMENT'::"AssessmentTemplateDeliveryType"
END;

ALTER TABLE "assessment_templates"
ALTER COLUMN "deliveryType" SET DEFAULT 'INVITED_ASSESSMENT',
ALTER COLUMN "deliveryType" SET NOT NULL;

-- Once any version has been published, a template's delivery purpose is an
-- immutable fact. This trigger backs up every API/import/admin path and closes
-- the race between a published-version check and the template update.
CREATE OR REPLACE FUNCTION assessment_template_block_published_delivery_type_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD."deliveryType" IS DISTINCT FROM NEW."deliveryType"
    AND EXISTS (
      SELECT 1
      FROM "assessment_template_versions"
      WHERE "templateId" = OLD."id"
        AND "publishedAt" IS NOT NULL
    )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = format(
        'AssessmentTemplate %s deliveryType is locked after its first published version.',
        OLD."id"
      );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER assessment_template_delivery_type_immutable_after_publish
BEFORE UPDATE OF "deliveryType" ON "assessment_templates"
FOR EACH ROW
EXECUTE FUNCTION assessment_template_block_published_delivery_type_change();
