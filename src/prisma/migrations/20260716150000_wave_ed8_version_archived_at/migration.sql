-- Wave ED8 (spec 19ak §3) — template version lifecycle: archivedAt.
--
-- Adds a nullable "archivedAt" mark to assessment_template_versions and
-- replaces the v7.5 immutability trigger FUNCTION (same name, CREATE OR
-- REPLACE only — the trigger wiring installed by
-- 20260514230000_add_assessment_infrastructure_v7_5 is untouched and keeps
-- pointing at this function).
--
-- New semantics on published rows (OLD."publishedAt" IS NOT NULL):
--   * DELETE          → still ALWAYS raises. Published rows can never be
--                       deleted (issued reports/campaigns pin them).
--   * UPDATE          → allowed ONLY when the sole difference between NEW
--                       and OLD is the "archivedAt" column — i.e. archive
--                       (set) and unarchive (clear) are the two lifecycle
--                       operations. Any change to content, scoring,
--                       publishedAt, or anything else still raises.
-- Unpublished (draft) rows remain freely mutable, exactly as before.
--
-- The NEW-vs-OLD comparison uses to_jsonb(row) minus 'archivedAt' so the
-- allow-list is column-complete by construction: columns added in future
-- migrations are automatically protected without editing this function.

ALTER TABLE "assessment_template_versions" ADD COLUMN "archivedAt" TIMESTAMP(3);

CREATE OR REPLACE FUNCTION assessment_template_version_block_published_mutation()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD."publishedAt" IS NOT NULL THEN
    IF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION 'AssessmentTemplateVersion row % is published (publishedAt=%) and is immutable. Create a new versionNumber instead.',
        OLD.id, OLD."publishedAt";
    END IF;
    IF TG_OP = 'UPDATE' AND (to_jsonb(NEW) - 'archivedAt') IS DISTINCT FROM (to_jsonb(OLD) - 'archivedAt') THEN
      RAISE EXCEPTION 'AssessmentTemplateVersion row % is published (publishedAt=%) and is immutable (only archivedAt may change). Create a new versionNumber instead.',
        OLD.id, OLD."publishedAt";
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;
