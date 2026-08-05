ALTER TABLE "assessment_submissions"
  ADD COLUMN "referringCoachId" TEXT;

CREATE INDEX "assessment_submissions_referringCoachId_submittedAt_idx"
  ON "assessment_submissions"("referringCoachId", "submittedAt");

ALTER TABLE "assessment_submissions"
  ADD CONSTRAINT "assessment_submissions_referringCoachId_fkey"
  FOREIGN KEY ("referringCoachId") REFERENCES "coaches"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
