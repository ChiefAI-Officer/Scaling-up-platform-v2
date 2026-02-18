import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCoach } from "@/lib/authorization";
import { db } from "@/lib/db";
import { StatusPill } from "@/components/ui/status-pill";
import { CancelWorkshopDialog } from "@/components/workshops/cancel-workshop-dialog";

interface WorkshopDetailsPageProps {
  params: Promise<{ id: string }>;
}

export default async function WorkshopDetailsPage({
  params,
}: WorkshopDetailsPageProps) {
  const { id } = await params;
  const { coach } = await requireCoach();

  const workshop = await db.workshop.findFirst({
    where: {
      id,
      coachId: coach.id,
    },
    include: {
      workshopType: true,
      _count: {
        select: {
          registrations: true,
        },
      },
    },
  });

  if (!workshop) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{workshop.title}</h1>
          <p className="text-muted-foreground">{workshop.workshopType?.name}</p>
        </div>
        <StatusPill status={workshop.status} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Event Details
          </h2>
          <div className="space-y-2 text-sm text-foreground">
            <p>
              <span className="font-medium">Date:</span>{" "}
              {new Date(workshop.eventDate).toLocaleDateString()}
            </p>
            <p>
              <span className="font-medium">Time:</span> {workshop.eventTime || "TBD"}
            </p>
            <p>
              <span className="font-medium">Format:</span> {workshop.format}
            </p>
            <p>
              <span className="font-medium">Venue:</span>{" "}
              {workshop.venueName || "To be announced"}
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Registrations
          </h2>
          <p className="text-3xl font-semibold text-foreground">
            {workshop._count.registrations}
          </p>
          <p className="text-sm text-muted-foreground">of {workshop.maxAttendees} max attendees</p>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Description
        </h2>
        <p className="text-sm text-foreground">
          {workshop.description || "No workshop description provided yet."}
        </p>
      </div>

      <div className="flex items-center gap-3">
        <Link
          href="/portal/workshops"
          className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-accent"
        >
          Back to Workshops
        </Link>
        <Link
          href="/portal/registrations"
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          View Registrations
        </Link>
        {["REQUESTED", "AWAITING_APPROVAL", "PRE_EVENT"].includes(workshop.status) && (
          <CancelWorkshopDialog
            workshopId={workshop.id}
            workshopTitle={workshop.title}
            eventDate={workshop.eventDate.toISOString()}
          />
        )}
      </div>
    </div>
  );
}
