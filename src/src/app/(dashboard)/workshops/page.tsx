export const dynamic = 'force-dynamic';

import Link from "next/link";
import { db } from "@/lib/db";
import { formatDate, getWorkshopStatusColor, getWorkshopStatusLabel } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

async function getWorkshops() {
  return db.workshop.findMany({
    include: {
      coach: true,
      workshopType: true,
      _count: { select: { registrations: true } },
    },
    orderBy: { eventDate: "asc" },
  });
}

export default async function WorkshopsPage() {
  const workshops = await getWorkshops();

  // Group by status for pipeline view
  const pipeline = {
    REQUESTED: workshops.filter((w) => w.status === "REQUESTED"),
    VALIDATING: workshops.filter((w) => w.status === "VALIDATING"),
    APPROVED: workshops.filter((w) => w.status === "APPROVED"),
    SETUP_IN_PROGRESS: workshops.filter((w) => w.status === "SETUP_IN_PROGRESS"),
    MARKETING_ACTIVE: workshops.filter((w) => w.status === "MARKETING_ACTIVE"),
    REGISTRATION_OPEN: workshops.filter((w) => w.status === "REGISTRATION_OPEN"),
    COMPLETED: workshops.filter((w) => w.status === "COMPLETED"),
    CANCELLED: workshops.filter((w) => w.status === "CANCELLED"),
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Workshops</h1>
          <p className="text-gray-600">Manage all workshop events</p>
        </div>
        <Link
          href="/workshops/new"
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          + New Workshop
        </Link>
      </div>

      {/* Pipeline View */}
      <div className="overflow-x-auto">
        <div className="inline-flex gap-4 pb-4 min-w-full">
          {Object.entries(pipeline).map(([status, statusWorkshops]) => (
            <div
              key={status}
              className="w-80 flex-shrink-0 bg-gray-50 rounded-lg"
            >
              <div className="p-4 border-b bg-white rounded-t-lg">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-gray-900">
                    {getWorkshopStatusLabel(status)}
                  </h3>
                  <span className="bg-gray-200 text-gray-700 px-2 py-1 rounded text-sm font-medium">
                    {statusWorkshops.length}
                  </span>
                </div>
              </div>
              <div className="p-2 space-y-2 max-h-[600px] overflow-y-auto">
                {statusWorkshops.length === 0 ? (
                  <p className="text-gray-400 text-sm text-center py-8">
                    No workshops
                  </p>
                ) : (
                  statusWorkshops.map((workshop) => (
                    <Link
                      key={workshop.id}
                      href={`/workshops/${workshop.id}`}
                      className="block bg-white rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow border"
                    >
                      <h4 className="font-medium text-gray-900 mb-1 line-clamp-2">
                        {workshop.title}
                      </h4>
                      <p className="text-sm text-gray-500 mb-2">
                        {workshop.workshopType.name}
                      </p>
                      <div className="flex items-center justify-between text-xs text-gray-500">
                        <span>{formatDate(workshop.eventDate)}</span>
                        <span>
                          {workshop._count.registrations}/{workshop.maxAttendees}
                        </span>
                      </div>
                      <div className="mt-2 pt-2 border-t">
                        <p className="text-xs text-gray-600">
                          {workshop.coach.firstName} {workshop.coach.lastName}
                        </p>
                      </div>
                    </Link>
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Table View */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-6 py-4 border-b">
          <h2 className="font-semibold">All Workshops</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Workshop
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Coach
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Registrations
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Format
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {workshops.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                    No workshops yet.{" "}
                    <Link
                      href="/workshops/new"
                      className="text-blue-600 hover:underline"
                    >
                      Create your first workshop
                    </Link>
                  </td>
                </tr>
              ) : (
                workshops.map((workshop) => (
                  <tr key={workshop.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <Link
                        href={`/workshops/${workshop.id}`}
                        className="text-blue-600 hover:text-blue-800 font-medium"
                      >
                        {workshop.title}
                      </Link>
                      <p className="text-sm text-gray-500">
                        {workshop.workshopType.name}
                      </p>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      {workshop.coach.firstName} {workshop.coach.lastName}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      {formatDate(workshop.eventDate)}
                    </td>
                    <td className="px-6 py-4">
                      <Badge
                        className={getWorkshopStatusColor(workshop.status)}
                        variant="secondary"
                      >
                        {getWorkshopStatusLabel(workshop.status)}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      {workshop._count.registrations} / {workshop.maxAttendees}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      {workshop.format === "VIRTUAL"
                        ? "Virtual"
                        : workshop.format === "HYBRID"
                        ? "Hybrid"
                        : "In-Person"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
