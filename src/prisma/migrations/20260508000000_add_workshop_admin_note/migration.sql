-- ENH-MAY6-2: Admin-only side table for workshop notes.
-- Side table over column for structural privacy: coach-facing Prisma includes
-- on Workshop never reach this table.

CREATE TABLE "workshop_admin_notes" (
    "id" TEXT NOT NULL,
    "workshopId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "updatedBy" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workshop_admin_notes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "workshop_admin_notes_workshopId_key" ON "workshop_admin_notes"("workshopId");

ALTER TABLE "workshop_admin_notes" ADD CONSTRAINT "workshop_admin_notes_workshopId_fkey" FOREIGN KEY ("workshopId") REFERENCES "workshops"("id") ON DELETE CASCADE ON UPDATE CASCADE;
