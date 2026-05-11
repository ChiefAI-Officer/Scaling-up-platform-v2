-- ENH-MAY6-11: admin/staff-editable transactional email template.
-- Single global template per emailType; missing row -> composer falls back
-- to hardcoded HTML, so prod deploys with zero backfill.

CREATE TABLE "transactional_email_templates" (
    "id" TEXT NOT NULL,
    "emailType" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "previousSubject" TEXT,
    "previousBody" TEXT,

    CONSTRAINT "transactional_email_templates_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "transactional_email_templates_emailType_key" ON "transactional_email_templates"("emailType");
