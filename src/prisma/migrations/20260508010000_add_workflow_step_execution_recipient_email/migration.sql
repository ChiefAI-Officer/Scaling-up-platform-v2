-- ENH-MAY6-10: snapshot of recipient email at row-write time on
-- workflow_step_executions. Nullable; existing rows stay NULL. Snapshot over
-- render-time join so the audit log preserves the address we sent to even if
-- the registration's email changes later.

ALTER TABLE "workflow_step_executions" ADD COLUMN "recipientEmail" TEXT;
