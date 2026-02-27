-- Sprint 5: Auto-Build on Approval schema fields
-- UP: Add isActiveTemplate to landing_pages, add category/format/phase to workflows

-- LandingPage.isActiveTemplate — marks a page as the active template for auto-build cloning
ALTER TABLE "landing_pages" ADD COLUMN "isActiveTemplate" BOOLEAN NOT NULL DEFAULT false;

-- Workflow category/format/phase — enables auto-assignment on workshop approval
ALTER TABLE "workflows" ADD COLUMN "categoryId" TEXT;
ALTER TABLE "workflows" ADD COLUMN "workshopFormat" TEXT;
ALTER TABLE "workflows" ADD COLUMN "workflowPhase" TEXT;

-- FK constraint: workflows.categoryId → categories.id
ALTER TABLE "workflows" ADD CONSTRAINT "workflows_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
