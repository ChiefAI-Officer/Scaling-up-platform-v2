-- AlterTable: Add Coach profile fields for Feb 25 revisions (Sprint 4)
ALTER TABLE "coaches" ADD COLUMN "linkedinUrl" TEXT,
ADD COLUMN "showBookCallCta" BOOLEAN NOT NULL DEFAULT true;
