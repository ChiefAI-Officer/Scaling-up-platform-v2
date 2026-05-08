-- ENH-MAY6-10: parent/child rollup for per-recipient workflow execution rows.
-- Top-level rows have parentId=null. Per-recipient child rows have parentId
-- set + non-null registrationId + non-null recipientEmail. Composite unique
-- (parentId, registrationId) makes child upserts idempotent across replays.

ALTER TABLE "workflow_step_executions" ADD COLUMN "parentId" TEXT;

ALTER TABLE "workflow_step_executions"
  ADD CONSTRAINT "workflow_step_executions_parentId_fkey"
  FOREIGN KEY ("parentId") REFERENCES "workflow_step_executions"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "workflow_step_executions_parent_recipient_unique"
  ON "workflow_step_executions"("parentId", "registrationId");

CREATE INDEX "workflow_step_executions_parentId_idx"
  ON "workflow_step_executions"("parentId");
