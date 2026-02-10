import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCoach } from "@/lib/authorization";
import { db } from "@/lib/db";
import { StatusPill } from "@/components/ui/status-pill";

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
          <h1 className="text-2xl font-bold text-gray-900">{workshop.title}</h1>
          <p className="text-gray-500">{workshop.workshopType.name}</p>
        </div>
        <StatusPill status={workshop.status} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
            Event Details
          </h2>
          <div className="space-y-2 text-sm text-gray-700">
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

        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
            Registrations
          </h2>
          <p className="text-3xl font-semibold text-gray-900">
            {workshop._count.registrations}
          </p>
          <p className="text-sm text-gray-500">of {workshop.maxAttendees} max attendees</p>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
          Description
        </h2>
        <p className="text-sm text-gray-700">
          {workshop.description || "No workshop description provided yet."}
        </p>
      </div>

      <div className="flex items-center gap-3">
        <Link
          href="/portal/workshops"
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Back to Workshops
        </Link>
        <Link
          href="/portal/registrations"
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          View Registrations
        </Link>
      </div>
    </div>
  );
}
