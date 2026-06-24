-- PR-3 (audit Inngest dedup): deliveryBatchKey on workflow_step_executions.
-- ADDITIVE ONLY (ADD COLUMN + CREATE UNIQUE INDEX) — no destructive ops, so no
-- `-- @approved` needed for the migration-safety gate.
--
-- Semantic idempotency key for one fan-out delivery batch. Set on the parent
-- row so a retry of the same batch reuses one parent (and skips its already-SENT
-- children). A standard UNIQUE index on a nullable column is correct here:
-- Postgres treats NULLs as distinct, so existing rows (NULL) coexist and only
-- non-null batch keys are deduped. Index name matches Prisma's convention
-- (<mapped_table>_<column>_key), mirroring assessment_submissions_idempotencyKey_key.

ALTER TABLE "workflow_step_executions" ADD COLUMN "deliveryBatchKey" TEXT;

CREATE UNIQUE INDEX "workflow_step_executions_deliveryBatchKey_key"
  ON "workflow_step_executions"("deliveryBatchKey");
