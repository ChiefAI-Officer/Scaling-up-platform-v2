-- Spec 19ap: PUBLIC campaigns have no organization roster or ownership.
-- Existing rows are preserved; this changes only column nullability.
-- @approved: Drops a NOT NULL constraint without deleting or rewriting data; approved in Spec 19ap.
ALTER TABLE "assessment_campaigns" ALTER COLUMN "organizationId" DROP NOT NULL;
