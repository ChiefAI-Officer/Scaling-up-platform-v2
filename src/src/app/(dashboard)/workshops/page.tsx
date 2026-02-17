export const dynamic = "force-dynamic";

import Link from "next/link";
import { Suspense } from "react";
import { db } from "@/lib/db";
import {
  formatCurrency,
  formatDate,
  getWorkshopStatusColor,
  getWorkshopStatusLabel,
} from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { CopyUrlButton } from "@/components/ui/copy-url-button";
import { WorkshopApprovalActions } from "@/components/workshops/workshop-approval-actions";
import { AdminWorkshopFilters } from "@/components/workshops/admin-workshop-filters";

const APP_URL = process.env.APP_URL || "https://scaling-up-platform-v2.vercel.app";

interface PageProps {
  searchParams: Promise<{ search?: string; status?: string }>;
}

async function getWorkshops(search?: string, status?: string) {
  return db.workshop.findMany({
    where: {
      ...(search
        ? {
            OR: [
              { title: { contains: search, mode: "insensitive" as const } },
              { coach: { firstName: { contains: search, mode: "insensitive" as const } } },
              { coach: { lastName: { contains: search, mode: "insensitive" as const } } },
            ],
          }
        : {}),
      ...(status ? { status } : {}),
    },
    include: {
      coach: true,
      workshopType: true,
      approvals: {
        where: { status: "PENDING" },
        select: { id: true },
        take: 1,
      },
      _count: { select: { registrations: true } },
    },
    orderBy: [{ createdAt: "desc" }, { eventDate: "asc" }],
  });
}

function formatStartTime(eventTime: string | null): string {
  if (!eventTime) {
    return "TBD";
  }

  if (eventTime.includes("-")) {
    const [start] = eventTime.split("-").map((value) => value.trim());
    return start || eventTime;
  }

  return eventTime;
}

function costLabel(workshop: {
  isFree: boolean;
  priceCents: number | null;
  earlyBirdPriceCents: number | null;
}): string {
  if (workshop.isFree) {
    return "Free";
  }

  const cents = workshop.earlyBirdPriceCents ?? workshop.priceCents ?? 0;
  return formatCurrency(cents);
}

function formatWorkshopMode(format: string): string {
  if (format === "VIRTUAL") {
    return "Virtual";
  }
  if (format === "HYBRID") {
    return "Hybrid";
  }
  return "In-Person";
}

export default async function WorkshopsPage({ searchParams }: PageProps) {
  const { search, status } = await searchParams;
  const workshops = await getWorkshops(search, status);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Workshops</h1>
          <p className="text-gray-600">Manage all workshop events</p>
        </div>
        <Link
          href="/workshops/new"
          className="inline-flex rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          + New Workshop
        </Link>
      </div>

      {/* Search & Filter Bar */}
      <Suspense>
        <AdminWorkshopFilters />
      </Suspense>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Code
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Workshop
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Coach
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Submit Date
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Start Date
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Start Time
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Cost
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Landing URL
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Registrations
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Format
                </th>
                <th className="px-4 py-3">
                  <span className="sr-only">Edit</span>
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {workshops.length === 0 ? (
                <tr>
                  <td colSpan={13} className="px-6 py-12 text-center text-gray-500">
                    {search || status ? (
                      <>No workshops match your filters.</>
                    ) : (
                      <>
                        No workshops yet.{" "}
                        <Link href="/workshops/new" className="text-blue-600 hover:underline">
                          Create your first workshop
                        </Link>
                      </>
                    )}
                  </td>
                </tr>
              ) : (
                workshops.map((workshop) => (
                  <tr key={workshop.id} className="hover:bg-gray-50">
                    <td className="px-4 py-4 text-sm font-mono text-gray-600">
                      {workshop.workshopCode || "—"}
                    </td>
                    <td className="px-4 py-4">
                      <Link
                        href={`/workshops/${workshop.id}`}
                        className="text-blue-600 hover:text-blue-800 font-medium"
                      >
                        {workshop.title}
                      </Link>
                      <p className="text-sm text-gray-500">{workshop.workshopType?.name}</p>
                    </td>
                    <td className="px-4 py-4 text-sm text-gray-900">
                      {workshop.coach.firstName} {workshop.coach.lastName}
                    </td>
                    <td className="px-4 py-4 text-sm text-gray-900">
                      {formatDate(workshop.createdAt)}
                    </td>
                    <td className="px-4 py-4 text-sm text-gray-900">
                      {formatDate(workshop.eventDate)}
                    </td>
                    <td className="px-4 py-4 text-sm text-gray-900">
                      {formatStartTime(workshop.eventTime)}
                    </td>
                    <td className="px-4 py-4 text-sm text-gray-900">
                      {costLabel(workshop)}
                    </td>
                    <td className="px-4 py-4 text-sm">
                      {workshop.landingPageSlug ? (
                        <CopyUrlButton url={`${APP_URL}/workshop/${workshop.landingPageSlug}`} />
                      ) : (
                        <span className="text-gray-400">Not published</span>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      <Badge className={getWorkshopStatusColor(workshop.status)} variant="secondary">
                        {getWorkshopStatusLabel(workshop.status)}
                      </Badge>
                    </td>
                    <td className="px-4 py-4 text-sm">
                      {workshop.approvals[0] ? (
                        <WorkshopApprovalActions
                          approvalId={workshop.approvals[0].id}
                          workshopTitle={workshop.title}
                        />
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-4 text-sm text-gray-900">
                      <Link
                        href={`/workshops/${workshop.id}#registrations`}
                        className="text-blue-600 hover:text-blue-800 hover:underline"
                      >
                        {workshop._count.registrations} / {workshop.maxAttendees}
                      </Link>
                    </td>
                    <td className="px-4 py-4 text-sm text-gray-900">
                      {formatWorkshopMode(workshop.format)}
                    </td>
                    <td className="px-4 py-4 text-right text-sm">
                      <Link
                        href={`/workshops/${workshop.id}/landing-pages`}
                        className="text-gray-500 hover:text-blue-600 font-medium"
                      >
                        Edit
                      </Link>
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
