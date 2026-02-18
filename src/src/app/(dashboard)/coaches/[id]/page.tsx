export const dynamic = 'force-dynamic';

import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FadeUp, StaggerContainer, StaggerItem } from "@/components/ui/animated";

interface CoachDetailPageProps {
  params: Promise<{ id: string }>;
}

function getCertificationStatusColor(status: string) {
  switch (status) {
    case "ACTIVE":
      return "bg-green-100 text-green-800";
    case "PENDING":
      return "bg-yellow-100 text-yellow-800";
    case "EXPIRED":
      return "bg-red-100 text-red-800";
    case "SUSPENDED":
      return "bg-gray-100 text-gray-800";
    default:
      return "bg-gray-100 text-gray-800";
  }
}

function getPaymentStatusColor(status: string) {
  switch (status) {
    case "CURRENT":
      return "bg-green-100 text-green-800";
    case "PENDING":
      return "bg-yellow-100 text-yellow-800";
    case "OVERDUE":
      return "bg-red-100 text-red-800";
    case "GRACE_PERIOD":
      return "bg-orange-100 text-orange-800";
    default:
      return "bg-gray-100 text-gray-800";
  }
}

function getWorkshopStatusColor(status: string) {
  switch (status) {
    case "PUBLISHED":
      return "bg-green-100 text-green-800";
    case "DRAFT":
      return "bg-gray-100 text-gray-800";
    case "CANCELED":
      return "bg-red-100 text-red-800";
    case "COMPLETED":
      return "bg-blue-100 text-blue-800";
    default:
      return "bg-gray-100 text-gray-800";
  }
}

export default async function CoachDetailPage({
  params,
}: CoachDetailPageProps) {
  const { id } = await params;

  const coach = await db.coach.findUnique({
    where: { id },
    include: {
      certifications: {
        include: {
          workshopType: true,
        },
      },
      workshops: {
        include: {
          workshopType: true,
          _count: {
            select: { registrations: true },
          },
        },
        orderBy: { eventDate: "desc" },
        take: 10,
      },
    },
  });

  if (!coach) {
    notFound();
  }

  const totalWorkshops = coach.workshops.length;
  const upcomingWorkshops = coach.workshops.filter(
    (w) => new Date(w.eventDate) > new Date() && w.status !== "CANCELED"
  ).length;
  const totalRegistrations = coach.workshops.reduce(
    (sum, w) => sum + w._count.registrations,
    0
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <FadeUp>
      <div className="flex justify-between items-start">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <Link
              href="/coaches"
              className="text-gray-500 hover:text-gray-700"
            >
              &larr; Coaches
            </Link>
          </div>
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center">
              <span className="text-xl font-medium text-blue-600">
                {coach.firstName[0]}{coach.lastName[0]}
              </span>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                {coach.firstName} {coach.lastName}
              </h1>
              <p className="text-gray-600">{coach.email}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 mt-3">
            <Badge
              className={getCertificationStatusColor(coach.certificationStatus)}
              variant="secondary"
            >
              {coach.certificationStatus}
            </Badge>
            <Badge
              className={getPaymentStatusColor(coach.paymentStatus)}
              variant="secondary"
            >
              Payment: {coach.paymentStatus}
            </Badge>
          </div>
        </div>
        <div className="flex gap-2">
          <Link
            href={`/coaches/${coach.id}/edit`}
            className="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors"
          >
            Edit Coach
          </Link>
        </div>
      </div>
      </FadeUp>

      {/* Quick Stats */}
      <StaggerContainer className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StaggerItem>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-gray-500">Total Workshops</p>
              <p className="text-xl font-semibold">{totalWorkshops}</p>
            </CardContent>
          </Card>
        </StaggerItem>

        <StaggerItem>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-gray-500">Upcoming</p>
              <p className="text-xl font-semibold text-blue-600">{upcomingWorkshops}</p>
            </CardContent>
          </Card>
        </StaggerItem>

        <StaggerItem>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-gray-500">Total Registrations</p>
              <p className="text-xl font-semibold text-green-600">{totalRegistrations}</p>
            </CardContent>
          </Card>
        </StaggerItem>

        <StaggerItem>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-gray-500">Certifications</p>
              <p className="text-xl font-semibold">{coach.certifications.length}</p>
            </CardContent>
          </Card>
        </StaggerItem>
      </StaggerContainer>

      <FadeUp delay={0.15}>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Details */}
        <div className="lg:col-span-2 space-y-6">
          {/* Coach Details */}
          <Card>
            <CardHeader>
              <CardTitle>Coach Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-gray-500">Phone</p>
                  <p className="text-gray-900">{coach.phone || "Not provided"}</p>
                </div>

                <div>
                  <p className="text-sm font-medium text-gray-500">Company</p>
                  <p className="text-gray-900">{coach.company || "Not provided"}</p>
                </div>

                <div>
                  <p className="text-sm font-medium text-gray-500">Territory</p>
                  <p className="text-gray-900">{coach.territory || "Not assigned"}</p>
                </div>

                <div>
                  <p className="text-sm font-medium text-gray-500">Member Since</p>
                  <p className="text-gray-900">{formatDate(coach.createdAt)}</p>
                </div>
              </div>

              {coach.bio && (
                <div>
                  <p className="text-sm font-medium text-gray-500">Bio</p>
                  <p className="text-gray-900 whitespace-pre-wrap">{coach.bio}</p>
                </div>
              )}

              {(coach.hubspotId || coach.circleId) && (
                <div className="pt-4 border-t">
                  <p className="text-sm font-medium text-gray-500 mb-2">Integration IDs</p>
                  <div className="grid grid-cols-2 gap-4">
                    {coach.hubspotId && (
                      <div>
                        <p className="text-xs text-gray-400">HubSpot ID</p>
                        <p className="text-sm text-gray-600 font-mono">{coach.hubspotId}</p>
                      </div>
                    )}
                    {coach.circleId && (
                      <div>
                        <p className="text-xs text-gray-400">Circle ID</p>
                        <p className="text-sm text-gray-600 font-mono">{coach.circleId}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Workshops */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Recent Workshops</CardTitle>
              <Link
                href={`/workshops/new?coachId=${coach.id}`}
                className="text-sm text-blue-600 hover:text-blue-700"
              >
                + Create Workshop
              </Link>
            </CardHeader>
            <CardContent>
              {coach.workshops.length === 0 ? (
                <p className="text-gray-500 text-center py-8">
                  No workshops yet.{" "}
                  <Link
                    href={`/workshops/new?coachId=${coach.id}`}
                    className="text-blue-600 hover:underline"
                  >
                    Create the first one
                  </Link>
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead>
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                          Workshop
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                          Date
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                          Status
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                          Registrations
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {coach.workshops.map((workshop) => (
                        <tr key={workshop.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3">
                            <Link
                              href={`/workshops/${workshop.id}`}
                              className="font-medium text-gray-900 hover:text-blue-600"
                            >
                              {workshop.title}
                            </Link>
                            <p className="text-sm text-gray-500">{workshop.workshopType?.name}</p>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600">
                            {formatDate(workshop.eventDate)}
                          </td>
                          <td className="px-4 py-3">
                            <Badge
                              className={getWorkshopStatusColor(workshop.status)}
                              variant="secondary"
                            >
                              {workshop.status}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600">
                            {workshop._count.registrations} / {workshop.maxAttendees}
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
          {/* Certifications */}
          <Card>
            <CardHeader>
              <CardTitle>Certifications</CardTitle>
            </CardHeader>
            <CardContent>
              {coach.certifications.length === 0 ? (
                <p className="text-gray-500 text-sm">No certifications yet</p>
              ) : (
                <div className="space-y-3">
                  {coach.certifications.map((cert) => (
                    <div
                      key={cert.id}
                      className="border rounded-lg p-3"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium text-gray-900">
                          {cert.workshopType.name}
                        </span>
                        <Badge
                          className={getCertificationStatusColor(cert.status)}
                          variant="secondary"
                        >
                          {cert.status}
                        </Badge>
                      </div>
                      <div className="text-xs text-gray-500">
                        <p>Certified: {formatDate(cert.certifiedAt)}</p>
                        {cert.expiresAt && (
                          <p>Expires: {formatDate(cert.expiresAt)}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Quick Actions */}
          <Card>
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Link
                href={`/workshops/new?coachId=${coach.id}`}
                className="block w-full text-center bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
              >
                Create Workshop
              </Link>
              <span className="block w-full text-center bg-gray-50 text-gray-400 px-4 py-2 rounded-lg text-sm cursor-default border border-dashed border-gray-300">
                Add Certification — Coming Soon
              </span>
              <span className="block w-full text-center bg-gray-50 text-gray-400 px-4 py-2 rounded-lg text-sm cursor-default border border-dashed border-gray-300">
                Sync with HubSpot — Coming Soon
              </span>
            </CardContent>
          </Card>
        </div>
      </div>
      </FadeUp>
    </div>
  );
}
