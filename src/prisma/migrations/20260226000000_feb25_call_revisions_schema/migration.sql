-- Feb 25 Call Revisions: Schema additions for Sprints 2-6
-- Category: defaultTitle, defaultDescription (auto-title generation)
-- Workshop: geoTargetAreas, excludedClients (targeting fields)
-- Registration: attended, attendedAt, marketingOptIn (attendance + opt-in)
-- Note: parkingInstructions column kept as-is; renamed via @map in Prisma schema only

-- AlterTable
ALTER TABLE "categories" ADD COLUMN "defaultDescription" TEXT,
ADD COLUMN "defaultTitle" TEXT;

-- AlterTable
ALTER TABLE "registrations" ADD COLUMN "attended" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "attendedAt" TIMESTAMP(3),
ADD COLUMN "marketingOptIn" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "workshops" ADD COLUMN "excludedClients" TEXT,
ADD COLUMN "geoTargetAreas" TEXT;
