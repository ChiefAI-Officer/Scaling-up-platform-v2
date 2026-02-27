export const dynamic = 'force-dynamic';

import Link from "next/link";
import { db } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FadeUp, StaggerContainer, StaggerItem } from "@/components/ui/animated";

async function getCoaches() {
  return db.coach.findMany({
    include: {
      certifications: {
        include: {
          workshopType: true,
        },
      },
      _count: {
        select: { workshops: true },
      },
    },
    orderBy: { lastName: "asc" },
  });
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

export default async function CoachesPage() {
  const coaches = await getCoaches();

  return (
    <div className="space-y-6">
      <FadeUp>
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Coaches</h1>
            <p className="text-muted-foreground">Manage certified coaches</p>
          </div>
          <Link
            href="/coaches/new"
            className="bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            + Add Coach
          </Link>
        </div>
      </FadeUp>

      {/* Stats */}
      <StaggerContainer className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StaggerItem>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">Total Coaches</p>
              <p className="text-2xl font-bold">{coaches.length}</p>
            </CardContent>
          </Card>
        </StaggerItem>
        <StaggerItem>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">Active</p>
              <p className="text-2xl font-bold text-success">
                {coaches.filter((c) => c.certificationStatus === "ACTIVE").length}
              </p>
            </CardContent>
          </Card>
        </StaggerItem>
        <StaggerItem>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">Pending</p>
              <p className="text-2xl font-bold text-warning">
                {coaches.filter((c) => c.certificationStatus === "PENDING").length}
              </p>
            </CardContent>
          </Card>
        </StaggerItem>
        <StaggerItem>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">Payment Overdue</p>
              <p className="text-2xl font-bold text-destructive">
                {coaches.filter((c) => c.paymentStatus === "OVERDUE").length}
              </p>
            </CardContent>
          </Card>
        </StaggerItem>
      </StaggerContainer>

      {/* Coaches Table */}
      <FadeUp delay={0.15}>
      <Card>
        <CardHeader>
          <CardTitle>All Coaches</CardTitle>
        </CardHeader>
        <CardContent>
          {coaches.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              No coaches yet.{" "}
              <Link href="/coaches/new" className="text-primary hover:underline">
                Add your first coach
              </Link>
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-border">
                <thead>
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">
                      Coach
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">
                      Certification
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">
                      Payment
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">
                      Certifications
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">
                      Workshops
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {coaches.map((coach) => (
                    <tr key={coach.id} className="hover:bg-accent">
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
                            <span className="text-sm font-medium text-primary">
                              {coach.firstName[0]}
                              {coach.lastName[0]}
                            </span>
                          </div>
                          <div>
                            <Link
                              href={`/coaches/${coach.id}`}
                              className="font-medium text-foreground hover:text-primary"
                            >
                              {coach.firstName} {coach.lastName}
                            </Link>
                            <p className="text-sm text-muted-foreground">{coach.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <Badge
                          className={getCertificationStatusColor(
                            coach.certificationStatus
                          )}
                          variant="secondary"
                        >
                          {coach.certificationStatus}
                        </Badge>
                      </td>
                      <td className="px-4 py-4">
                        <Badge
                          className={getPaymentStatusColor(coach.paymentStatus)}
                          variant="secondary"
                        >
                          {coach.paymentStatus}
                        </Badge>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex flex-wrap gap-1">
                          {coach.certifications.length === 0 ? (
                            <span className="text-muted-foreground text-sm">None</span>
                          ) : (
                            coach.certifications.map((cert) => (
                              <Badge
                                key={cert.id}
                                variant="outline"
                                className="text-xs"
                              >
                                {cert.workshopType.name}
                              </Badge>
                            ))
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-4 text-sm text-muted-foreground">
                        {coach._count.workshops}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
      </FadeUp>
    </div>
  );
}
