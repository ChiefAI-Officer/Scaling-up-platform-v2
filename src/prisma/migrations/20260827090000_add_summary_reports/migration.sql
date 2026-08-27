-- Summary reporting foundation: immutable generated-report records and their
-- ordered source-submission snapshots. This migration is additive only.

CREATE TYPE "SummaryReportType" AS ENUM (
    'SCALING_CEO_FULL',
    'SCALING_CONDENSED_CEO',
    'SCALING_SELF_COMPARISON',
    'LVA_CEO_FULL',
    'QSP_V1_CEO_FULL',
    'QSP_V2_CEO_FULL',
    'ROCKEFELLER_FULL'
);

CREATE TYPE "SummaryReportSourceRole" AS ENUM ('CEO', 'TEAM', 'FOCUS', 'EARLIER');

CREATE TABLE "summary_reports" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "reportType" "SummaryReportType" NOT NULL,
    "name" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "createdByEmailSnapshot" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rendererVersion" TEXT NOT NULL,
    "inputSnapshot" JSONB NOT NULL,
    "inputHash" TEXT NOT NULL,
    "moderationManifest" JSONB,
    "creationRequestId" TEXT NOT NULL,
    "artifactPath" TEXT NOT NULL,
    "artifactSha256" TEXT NOT NULL,
    "artifactSizeBytes" INTEGER NOT NULL,
    "artifactCreatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "summary_reports_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "summary_report_sources" (
    "id" TEXT NOT NULL,
    "summaryReportId" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "role" "SummaryReportSourceRole" NOT NULL,
    "position" INTEGER NOT NULL,
    "respondentSnapshot" JSONB NOT NULL,

    CONSTRAINT "summary_report_sources_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "summary_reports_creationRequestId_key"
    ON "summary_reports"("creationRequestId");

CREATE UNIQUE INDEX "summary_reports_artifactPath_key"
    ON "summary_reports"("artifactPath");

CREATE INDEX "summary_reports_campaignId_createdAt_idx"
    ON "summary_reports"("campaignId", "createdAt");

CREATE INDEX "summary_reports_createdByUserId_createdAt_idx"
    ON "summary_reports"("createdByUserId", "createdAt");

CREATE UNIQUE INDEX "summary_report_sources_summaryReportId_submissionId_key"
    ON "summary_report_sources"("summaryReportId", "submissionId");

CREATE UNIQUE INDEX "summary_report_sources_summaryReportId_role_position_key"
    ON "summary_report_sources"("summaryReportId", "role", "position");

CREATE INDEX "summary_report_sources_submissionId_idx"
    ON "summary_report_sources"("submissionId");

ALTER TABLE "summary_reports"
    ADD CONSTRAINT "summary_reports_campaignId_fkey"
    FOREIGN KEY ("campaignId") REFERENCES "assessment_campaigns"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "summary_report_sources"
    ADD CONSTRAINT "summary_report_sources_summaryReportId_fkey"
    FOREIGN KEY ("summaryReportId") REFERENCES "summary_reports"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "summary_report_sources"
    ADD CONSTRAINT "summary_report_sources_submissionId_fkey"
    FOREIGN KEY ("submissionId") REFERENCES "assessment_submissions"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION reject_summary_report_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION USING ERRCODE = '55000',
        MESSAGE = format('%s rows are immutable', TG_TABLE_NAME);
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "summary_reports_reject_mutation"
    BEFORE UPDATE OR DELETE ON "summary_reports"
    FOR EACH ROW EXECUTE FUNCTION reject_summary_report_mutation();

CREATE TRIGGER "summary_report_sources_reject_mutation"
    BEFORE UPDATE OR DELETE ON "summary_report_sources"
    FOR EACH ROW EXECUTE FUNCTION reject_summary_report_mutation();
