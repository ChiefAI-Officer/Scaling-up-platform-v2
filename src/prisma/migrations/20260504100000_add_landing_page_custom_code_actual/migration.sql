-- CHG-03: customCode rendered on THANK_YOU pages for iDev affiliate tracking.
-- Copied at build time from the source PageTemplate; never accepted from
-- request bodies on coach-accessible routes.
ALTER TABLE "landing_pages" ADD COLUMN "customCode" TEXT;

-- CHG-03: paid thank-you pages look up the registration by stripeSessionId
-- to scope it to the workshop. Without this index, every paid thank-you hit
-- does a sequential scan against the registrations table.
CREATE INDEX "registrations_stripeSessionId_idx" ON "registrations"("stripeSessionId");
