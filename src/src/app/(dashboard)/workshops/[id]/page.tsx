export const dynamic = 'force-dynamic';

import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import {
  formatDate,
  formatCurrency,
  getWorkshopStatusColor,
  getWorkshopStatusLabel,
  parseJsonField,
  VenueAddress,
} from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { WorkshopActions } from "./workshop-actions";
import { QuickActions } from "./quick-actions";

interface WorkshopDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function WorkshopDetailPage({
  params,
}: WorkshopDetailPageProps) {
  const { id } = await params;

  const workshop = await db.workshop.findUnique({
    where: { id },
    include: {
      coach: true,
      workshopType: true,
      registrations: {
        orderBy: { createdAt: "desc" },
      },
      tasks: {
        orderBy: { createdAt: "desc" },
      },
      landingPages: {
        select: {
          id: true,
          slug: true,
          status: true,
        },
      },
    },
  });

  if (!workshop) {
    notFound();
  }

  const completedPayments = workshop.registrations.filter(
    (r) => r.paymentStatus === "COMPLETED" || r.paymentStatus === "FREE"
  );
  const totalRevenue = workshop.registrations.reduce(
    (sum, r) => sum + (r.amountPaidCents || 0),
    0
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <Link
              href="/workshops"
              className="text-gray-500 hover:text-gray-700"
            >
              &larr; Workshops
            </Link>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">{workshop.title}</h1>
          <div className="flex items-center gap-3 mt-2">
            <Badge
              className={getWorkshopStatusColor(workshop.status)}
              variant="secondary"
            >
              {getWorkshopStatusLabel(workshop.status)}
            </Badge>
            <span className="text-gray-500">{workshop.workshopType.name}</span>
          </div>
        </div>
        <WorkshopActions workshop={workshop} />
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-gray-500">Event Date</p>
            <p className="text-xl font-semibold">{formatDate(workshop.eventDate)}</p>
            {workshop.eventTime && (
              <p className="text-gray-600">{workshop.eventTime}</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-gray-500">Registrations</p>
            <p className="text-xl font-semibold">
              {workshop.registrations.length} / {workshop.maxAttendees}
            </p>
            <p className="text-gray-600">
              {workshop.maxAttendees - workshop.registrations.length} spots left
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-gray-500">Revenue</p>
            <p className="text-xl font-semibold text-green-600">
              {formatCurrency(totalRevenue)}
            </p>
            <p className="text-gray-600">{completedPayments.length} paid</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-gray-500">Format</p>
            <p className="text-xl font-semibold">
              {workshop.format === "VIRTUAL"
                ? "Virtual"
                : workshop.format === "HYBRID"
                  ? "Hybrid"
                  : "In-Person"}
            </p>
            <p className="text-gray-600">{workshop.duration}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Details */}
        <div className="lg:col-span-2 space-y-6">
          {/* Workshop Details */}
          <Card>
            <CardHeader>
              <CardTitle>Workshop Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {workshop.description && (
                <div>
                  <p className="text-sm font-medium text-gray-500">Description</p>
                  <p className="text-gray-900 whitespace-pre-wrap">
                    {workshop.description}
                  </p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-gray-500">Coach</p>
                  <p className="text-gray-900">
                    {workshop.coach.firstName} {workshop.coach.lastName}
                  </p>
                  <p className="text-sm text-gray-500">{workshop.coach.email}</p>
                </div>

                <div>
                  <p className="text-sm font-medium text-gray-500">Pricing</p>
                  <p className="text-gray-900">
                    {workshop.isFree
                      ? "Free"
                      : formatCurrency(workshop.priceCents || 0)}
                  </p>
                  {workshop.earlyBirdPriceCents && workshop.earlyBirdDeadline && (
                    <p className="text-sm text-gray-500">
                      Early bird: {formatCurrency(workshop.earlyBirdPriceCents)}{" "}
                      until {formatDate(workshop.earlyBirdDeadline)}
                    </p>
                  )}
                </div>
              </div>

              {workshop.format !== "VIRTUAL" && workshop.venueName && (
                <div>
                  <p className="text-sm font-medium text-gray-500">Location</p>
                  <p className="text-gray-900">{workshop.venueName}</p>
                  {workshop.venueAddress && (() => {
                    const address = parseJsonField<VenueAddress>(workshop.venueAddress);
                    return address && (
                      <p className="text-sm text-gray-600">
                        {address.street && <>{address.street}, </>}
                        {address.city}, {address.state} {address.zip}
                      </p>
                    );
                  })()}
                </div>
              )}

              {workshop.landingPageSlug && (
                <div>
                  <p className="text-sm font-medium text-gray-500">Landing Page</p>
                  <Link
                    href={`/workshop/${workshop.landingPageSlug}`}
                    className="text-blue-600 hover:text-blue-700"
                    target="_blank"
                  >
                    /workshop/{workshop.landingPageSlug}
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Registrations */}
          <Card id="registrations">
            <CardHeader>
              <CardTitle>Registrations ({workshop.registrations.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {workshop.registrations.length === 0 ? (
                <p className="text-gray-500 text-center py-8">
                  No registrations yet
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead>
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                          Name
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                          Email
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                          Status
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                          Payment
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                          Date
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {workshop.registrations.map((reg) => (
                        <tr key={reg.id}>
                          <td className="px-4 py-3">
                            {reg.firstName} {reg.lastName}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600">
                            {reg.email}
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant="secondary">{reg.status}</Badge>
                          </td>
                          <td className="px-4 py-3">
                            <Badge
                              variant={
                                reg.paymentStatus === "COMPLETED" ||
                                  reg.paymentStatus === "FREE"
                                  ? "success"
                                  : "warning"
                              }
                            >
                              {reg.paymentStatus}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600">
                            {formatDate(reg.createdAt)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Automation Tasks */}
          <Card>
            <CardHeader>
              <CardTitle>Automation Tasks</CardTitle>
            </CardHeader>
            <CardContent>
              {workshop.tasks.length === 0 ? (
                <p className="text-gray-500 text-sm">No automation tasks yet</p>
              ) : (
                <div className="space-y-3">
                  {workshop.tasks.map((task) => (
                    <div
                      key={task.id}
                      className="flex items-center justify-between text-sm"
                    >
                      <span className="text-gray-700">{task.taskType}</span>
                      <Badge
                        variant={
                          task.status === "COMPLETED"
                            ? "success"
                            : task.status === "FAILED"
                              ? "destructive"
                              : "secondary"
                        }
                      >
                        {task.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Quick Links */}
          <Card>
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <QuickActions
                workshopId={workshop.id}
                landingPageSlug={workshop.landingPageSlug}
                landingPages={workshop.landingPages}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
