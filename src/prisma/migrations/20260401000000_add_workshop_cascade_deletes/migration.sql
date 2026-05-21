-- Migration: add_workshop_cascade_deletes
-- Fixes two cascade gaps on workshop permanent deletion.

-- Step 1: Clean up any existing orphaned WorkflowStepExecution rows.
-- These exist because workshopId had no FK constraint before this migration.
-- We must remove them BEFORE adding the FK constraint or the ALTER will fail.
-- @approved: orphan cleanup required before adding ON DELETE CASCADE FK in Step 2; targets only rows whose workshopId no longer matches any workshop (legitimate orphans, no operator data at risk).
DELETE FROM "workflow_step_executions"
WHERE "workshopId" NOT IN (SELECT "id" FROM "workshops");

-- Step 2: Add FK constraint on workflow_step_executions → workshops (ON DELETE CASCADE).
ALTER TABLE "workflow_step_executions"
  ADD CONSTRAINT "workflow_step_executions_workshopId_fkey"
  FOREIGN KEY ("workshopId") REFERENCES "workshops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Step 3: Drop and recreate the approval_queue → workshops FK with ON DELETE CASCADE.
-- Previously had no onDelete behavior (Prisma default SetNull for optional FK).
ALTER TABLE "approval_queue"
  DROP CONSTRAINT IF EXISTS "approval_queue_workshopId_fkey";

ALTER TABLE "approval_queue"
  ADD CONSTRAINT "approval_queue_workshopId_fkey"
  FOREIGN KEY ("workshopId") REFERENCES "workshops"("id") ON DELETE CASCADE ON UPDATE CASCADE;
