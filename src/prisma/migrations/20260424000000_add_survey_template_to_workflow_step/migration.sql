-- BUG-06: Add surveyTemplateId to WorkflowStep for pinned survey template picker
-- This allows SEND_SURVEY_LINK steps to pin a specific survey template
-- instead of always resolving by category/type lookup.

ALTER TABLE "workflow_steps" ADD COLUMN "surveyTemplateId" TEXT;

ALTER TABLE "workflow_steps"
  ADD CONSTRAINT "workflow_steps_surveyTemplateId_fkey"
  FOREIGN KEY ("surveyTemplateId")
  REFERENCES "survey_templates"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

CREATE INDEX "workflow_steps_surveyTemplateId_idx" ON "workflow_steps"("surveyTemplateId");
