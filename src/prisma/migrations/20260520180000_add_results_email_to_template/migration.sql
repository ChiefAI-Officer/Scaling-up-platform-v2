-- Phase F0 (Checkpoint 1b) — Results Email card support on AssessmentTemplate.
--
-- Adds three nullable / default-valued columns so the editor's
-- Metadata-tab Results Email card has somewhere to persist. No data risk —
-- existing rows get NULL subject/body and `false` content-approved.
--
-- Plan: ~/.claude/plans/yes-we-were-in-cosmic-jellyfish.md (F0).
ALTER TABLE "assessment_templates"
  ADD COLUMN "resultsEmailSubject" TEXT,
  ADD COLUMN "resultsEmailBodyMarkdown" TEXT,
  ADD COLUMN "resultsEmailContentApproved" BOOLEAN NOT NULL DEFAULT false;
