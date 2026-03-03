export const dynamic = 'force-dynamic';

import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FadeUp, StaggerContainer, StaggerItem } from "@/components/ui/animated";
import { AddCertificationModal } from "@/components/coaches/add-certification-modal";
import { RemoveCertificationButton } from "@/components/coaches/remove-certification-button";
import { DeleteCoachButton } from "@/components/coaches/delete-coach-button";
import { requireAuth } from "@/lib/authorization";

interface CoachDetailPageProps {
  params: Promise<{ id: string }>;
}

function getCertificationStatusColor(status: string) {
  switch (status) {
    case "ACTIVE":
      return "bg-success/10 text-success";
    case "PENDING":
      return "bg-warning/10 text-warning";
    case "EXPIRED":
      return "bg-destructive/10 text-destructive";
    case "SUSPENDED":
      return "bg-muted text-foreground";
    default:
      return "bg-muted text-foreground";
  }
}

function getPaymentStatusColor(status: string) {
  switch (status) {
    case "CURRENT":
      return "bg-success/10 text-success";
    case "PENDING":
      return "bg-warning/10 text-warning";
    case "OVERDUE":
      return "bg-destructive/10 text-destructive";
    case "GRACE_PERIOD":
      return "bg-warning/10 text-warning";
    default:
      return "bg-muted text-foreground";
  }
}

function getWorkshopStatusColor(status: string) {
  switch (status) {
    case "PUBLISHED":
      return "bg-success/10 text-success";
    case "DRAFT":
      return "bg-muted text-foreground";
    case "CANCELED":
      return "bg-destructive/10 text-destructive";
    case "COMPLETED":
      return "bg-info/10 text-info";
    default:
      return "bg-muted text-foreground";
  }
}

export default async function CoachDetailPage({
  params,
}: CoachDetailPageProps) {
  const session = await requireAuth();
  const isAdmin = session.user.role === "ADMIN";
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
  const hasActiveWorkshops = coach.workshops.some(
    (w) => !["COMPLETED", "CANCELED"].includes(w.status)
  );
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
              className="text-muted-foreground hover:text-foreground"
            >
              &larr; Coaches
            </Link>
          </div>
          <div className="flex items-center gap-4">
            {coach.profileImage ? (
              <img
                src={coach.profileImage}
                alt={`${coach.firstName} ${coach.lastName}`}
                className="w-16 h-16 rounded-full object-cover"
              />
            ) : (
              <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
                <span className="text-xl font-medium text-primary">
                  {coach.firstName[0]}{coach.lastName[0]}
                </span>
              </div>
            )}
            <div>
              <h1 className="text-2xl font-bold text-foreground">
                {coach.firstName} {coach.lastName}
              </h1>
              <p className="text-muted-foreground">{coach.email}</p>
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
            className="bg-muted text-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-accent transition-colors"
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
              <p className="text-sm text-muted-foreground">Total Workshops</p>
              <p className="text-xl font-semibold">{totalWorkshops}</p>
            </CardContent>
          </Card>
        </StaggerItem>

        <StaggerItem>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">Upcoming</p>
              <p className="text-xl font-semibold text-primary">{upcomingWorkshops}</p>
            </CardContent>
          </Card>
        </StaggerItem>

        <StaggerItem>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">Total Registrations</p>
              <p className="text-xl font-semibold text-success">{totalRegistrations}</p>
            </CardContent>
          </Card>
        </StaggerItem>

        <StaggerItem>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">Certifications</p>
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
                  <p className="text-sm font-medium text-muted-foreground">Phone</p>
                  <p className="text-foreground">{coach.phone || "Not provided"}</p>
                </div>

                <div>
                  <p className="text-sm font-medium text-muted-foreground">Company</p>
                  <p className="text-foreground">{coach.company || "Not provided"}</p>
                </div>

                <div>
                  <p className="text-sm font-medium text-muted-foreground">Territory</p>
                  <p className="text-foreground">{coach.territory || "Not assigned"}</p>
                </div>

                <div>
                  <p className="text-sm font-medium text-muted-foreground">Member Since</p>
                  <p className="text-foreground">{formatDate(coach.createdAt)}</p>
                </div>
              </div>

              {coach.bio && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Bio</p>
                  <p className="text-foreground whitespace-pre-wrap">{coach.bio}</p>
                </div>
              )}

              {(coach.hubspotId || coach.circleId || coach.syncedAt) && (
                <div className="pt-4 border-t">
                  <p className="text-sm font-medium text-muted-foreground mb-2">Integration IDs</p>
                  <div className="grid grid-cols-2 gap-4">
                    {coach.hubspotId && (
                      <div>
                        <p className="text-xs text-muted-foreground">HubSpot ID</p>
                        <p className="text-sm text-muted-foreground font-mono">{coach.hubspotId}</p>
                      </div>
                    )}
                    {coach.circleId && (
                      <div>
                        <p className="text-xs text-muted-foreground">Circle ID</p>
                        <p className="text-sm text-muted-foreground font-mono">{coach.circleId}</p>
                      </div>
                    )}
                    {coach.syncedAt && (
                      <div>
                        <p className="text-xs text-muted-foreground">Last Circle Sync</p>
                        <p className="text-sm text-muted-foreground">{formatDate(coach.syncedAt)}</p>
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
                className="text-sm text-primary hover:text-primary/80"
              >
                + Create Workshop
              </Link>
            </CardHeader>
            <CardContent>
              {coach.workshops.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">
                  No workshops yet.{" "}
                  <Link
                    href={`/workshops/new?coachId=${coach.id}`}
                    className="text-primary hover:underline"
                  >
                    Create the first one
                  </Link>
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-border">
                    <thead>
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase">
                          Workshop
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase">
                          Date
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase">
                          Status
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase">
                          Registrations
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {coach.workshops.map((workshop) => (
                        <tr key={workshop.id} className="hover:bg-accent">
                          <td className="px-4 py-3">
                            <Link
                              href={`/workshops/${workshop.id}`}
                              className="font-medium text-foreground hover:text-primary"
                            >
                              {workshop.title}
                            </Link>
                            <p className="text-sm text-muted-foreground">{workshop.workshopType?.name}</p>
                          </td>
                          <td className="px-4 py-3 text-sm text-muted-foreground">
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
                          <td className="px-4 py-3 text-sm text-muted-foreground">
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
                <p className="text-muted-foreground text-sm">No certifications yet</p>
              ) : (
                <div className="space-y-3">
                  {coach.certifications.map((cert) => (
                    <div
                      key={cert.id}
                      className="border rounded-lg p-3"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium text-foreground">
                          {cert.workshopType.name}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <Badge
                            className={getCertificationStatusColor(cert.status)}
                            variant="secondary"
                          >
                            {cert.status}
                          </Badge>
                          <RemoveCertificationButton
                            coachId={coach.id}
                            certificationId={cert.id}
                            workshopTypeName={cert.workshopType.name}
                          />
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground">
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
                className="block w-full text-center bg-primary text-primary-foreground px-4 py-2 rounded-lg hover:bg-primary/90 transition-colors"
              >
                Create Workshop
              </Link>
              <AddCertificationModal
                coachId={coach.id}
                existingWorkshopTypeIds={coach.certifications.map((c) => c.workshopTypeId)}
              />
              {isAdmin && (
                <div className="pt-2 border-t border-border mt-2">
                  <DeleteCoachButton
                    coachId={coach.id}
                    coachName={`${coach.firstName} ${coach.lastName}`}
                    hasActiveWorkshops={hasActiveWorkshops}
                  />
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
      </FadeUp>
    </div>
  );
}
