-- FIG-005: Add categoryId to LandingPage for per-category template filtering
-- UP

ALTER TABLE "landing_pages" ADD COLUMN "categoryId" TEXT;

ALTER TABLE "landing_pages" ADD CONSTRAINT "landing_pages_categoryId_fkey"
  FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "landing_pages_categoryId_idx" ON "landing_pages"("categoryId");
