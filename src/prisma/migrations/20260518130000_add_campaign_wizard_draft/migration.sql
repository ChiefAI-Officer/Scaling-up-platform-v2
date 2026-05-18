-- Assessment Tool v7.6 — Task K: Campaign Wizard auto-save drafts.
--
-- Adds a single table mirroring the WorkshopDraft precedent:
--   - One row per coach (coachId unique)
--   - Cascade on coach delete
--   - JSON-stringified wizard state in stepsData
--
-- Used by /api/assessment-campaign-drafts (GET/PUT/DELETE).

CREATE TABLE "assessment_campaign_wizard_drafts" (
    "id" TEXT NOT NULL,
    "coachId" TEXT NOT NULL,
    "currentStep" INTEGER NOT NULL DEFAULT 1,
    "stepsData" TEXT NOT NULL,
    "lastSavedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assessment_campaign_wizard_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "assessment_campaign_wizard_drafts_coachId_key" ON "assessment_campaign_wizard_drafts"("coachId");

-- CreateIndex
CREATE INDEX "assessment_campaign_wizard_drafts_coachId_idx" ON "assessment_campaign_wizard_drafts"("coachId");

-- AddForeignKey
ALTER TABLE "assessment_campaign_wizard_drafts" ADD CONSTRAINT "assessment_campaign_wizard_drafts_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "coaches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
