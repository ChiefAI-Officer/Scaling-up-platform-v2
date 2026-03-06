-- March 2026 Sprint 1 Revisions
-- MR-04: Rename WorkshopStatus REQUESTED → INFO_REQUESTED
-- This renames the initial workshop submission state to "Info Requested"
-- to clarify that the platform is awaiting information from the coach.

-- UP: Rename existing REQUESTED records and update default
UPDATE "Workshop" SET "status" = 'INFO_REQUESTED' WHERE "status" = 'REQUESTED';
ALTER TABLE "Workshop" ALTER COLUMN "status" SET DEFAULT 'INFO_REQUESTED';
