-- Wave S (Jul 3 2026) — LVA peer benchmarks (Jeff July-1 #12/#13, spec 19s).
--
-- One additive enum + one additive table, no changes to existing tables, no
-- data movement, no backfill:
--
--   BenchmarkMetricKind — QUESTION only this wave (per-question peer mean for
--   the LVA S3 factors). DOMAIN/SECTION/SCALEUP arrive with the SU-Full
--   consolidation follow-on as additive ALTER TYPE ... ADD VALUE migrations.
--
--   assessment_benchmarks — admin-set peer values, template-level (stableKeys
--   carry cross-version continuity per ADR-0001; peers are a reference
--   dataset, not version content — spec 19s S-1). The table ships EMPTY and
--   unread (flag WAVE_S_PEER_BENCHMARKS_ENABLED default OFF); reports render
--   peers only for keys an admin has explicitly saved (omit-empty, ADR-0019).

CREATE TYPE "BenchmarkMetricKind" AS ENUM ('QUESTION');

CREATE TABLE "assessment_benchmarks" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "metricKind" "BenchmarkMetricKind" NOT NULL,
    "metricKey" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assessment_benchmarks_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "assessment_benchmarks_templateId_metricKind_metricKey_key" ON "assessment_benchmarks"("templateId", "metricKind", "metricKey");

CREATE INDEX "assessment_benchmarks_templateId_idx" ON "assessment_benchmarks"("templateId");

ALTER TABLE "assessment_benchmarks" ADD CONSTRAINT "assessment_benchmarks_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "assessment_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
