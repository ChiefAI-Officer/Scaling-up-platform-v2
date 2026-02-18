export const dynamic = "force-dynamic";

import Link from "next/link";
import { db } from "@/lib/db";
import {
  formatDate,
  formatCurrency,
  getWorkshopStatusColor,
  getWorkshopStatusLabel,
} from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FadeUp, StaggerContainer, StaggerItem } from "@/components/ui/animated";

async function getDashboardMetrics() {
  const [workshopsByStatus, recentWorkshops, pendingApprovals] = await Promise.all([
    db.workshop.groupBy({
      by: ["status"],
      _count: { id: true },
    }),
    db.workshop.findMany({
      take: 8,
      orderBy: { createdAt: "desc" },
      include: {
        coach: true,
        workshopType: true,
        _count: { select: { registrations: true } },
      },
    }),
    db.approvalQueue.count({
      where: { status: "PENDING" },
    }),
  ]);

  return {
    workshopsByStatus: Object.fromEntries(
      workshopsByStatus.map((statusEntry) => [statusEntry.status, statusEntry._count.id])
    ),
    recentWorkshops,
    pendingApprovals,
  };
}

export default async function DashboardPage() {
  const metrics = await getDashboardMetrics();

  return (
    <div className="space-y-8">
      <FadeUp>
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="text-muted-foreground">Overview of workshop operations</p>
      </FadeUp>

      {metrics.pendingApprovals > 0 && (
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl" aria-hidden="true">
              ⚠️
            </span>
            <div>
              <p className="font-medium text-orange-800">
                {metrics.pendingApprovals} pending approval
                {metrics.pendingApprovals > 1 ? "s" : ""} require attention
              </p>
              <p className="text-sm text-orange-600">
                Workshop requests or custom pricing awaiting your review.
              </p>
            </div>
          </div>
          <Link
            href="/workshops?status=REQUESTED"
            className="bg-orange-600 text-white px-4 py-2 rounded-lg hover:bg-orange-700 transition-colors whitespace-nowrap"
          >
            Review Now
          </Link>
        </div>
      )}

      <FadeUp delay={0.1}>
        <Card>
          <CardHeader>
            <CardTitle>Workshop Pipeline</CardTitle>
          </CardHeader>
          <CardContent>
            <StaggerContainer className="flex flex-wrap gap-4">
              {[
                "REQUESTED",
                "AWAITING_APPROVAL",
                "PRE_EVENT",
                "POST_EVENT",
                "COMPLETED",
                "CANCELED",
              ].map((status) => (
                <StaggerItem key={status}>
                  <div className="flex items-center gap-2 bg-muted rounded-lg px-4 py-2">
                    <span
                      className={`px-2 py-1 rounded text-xs font-medium ${getWorkshopStatusColor(
                        status
                      )}`}
                    >
                      {getWorkshopStatusLabel(status)}
                    </span>
                    <span className="font-bold">{metrics.workshopsByStatus[status] || 0}</span>
                  </div>
                </StaggerItem>
              ))}
            </StaggerContainer>
          </CardContent>
        </Card>
      </FadeUp>

      <FadeUp delay={0.2}>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Recent Workshops</CardTitle>
          <Link
            href="/workshops"
            className="text-sm text-blue-600 hover:text-blue-700 font-medium"
          >
            View All
          </Link>
        </CardHeader>
        <CardContent>
          {metrics.recentWorkshops.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              No workshops yet.{" "}
              <Link href="/workshops/new" className="text-blue-600 hover:underline">
                Create your first workshop
              </Link>
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-border">
                <thead>
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Workshop
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Created Date
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Event Date
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Event Time
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Price
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Landing Page
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Status
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Registrations
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {metrics.recentWorkshops.map((workshop) => (
                    <tr key={workshop.id} className="hover:bg-accent">
                      <td className="px-3 py-3">
                        <Link
                          href={`/workshops/${workshop.id}`}
                          className="font-medium text-foreground hover:text-blue-600"
                        >
                          {workshop.title}
                        </Link>
                        <p className="text-xs text-muted-foreground">
                          {workshop.workshopType?.name} · {workshop.coach.firstName}{" "}
                          {workshop.coach.lastName}
                        </p>
                      </td>
                      <td className="px-3 py-3 text-sm text-foreground">
                        {formatDate(workshop.createdAt)}
                      </td>
                      <td className="px-3 py-3 text-sm text-foreground">
                        {formatDate(workshop.eventDate)}
                      </td>
                      <td className="px-3 py-3 text-sm text-foreground">
                        {workshop.eventTime || "TBD"}
                      </td>
                      <td className="px-3 py-3 text-sm text-foreground">
                        {workshop.isFree ? "Free" : formatCurrency(workshop.priceCents || 0)}
                      </td>
                      <td className="px-3 py-3 text-sm">
                        {workshop.landingPageSlug ? (
                          <Link
                            href={`/workshop/${workshop.landingPageSlug}`}
                            target="_blank"
                            className="text-blue-600 hover:text-blue-700 hover:underline"
                          >
                            Open landing page
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">Not published</span>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <Badge className={getWorkshopStatusColor(workshop.status)} variant="secondary">
                          {getWorkshopStatusLabel(workshop.status)}
                        </Badge>
                      </td>
                      <td className="px-3 py-3 text-sm text-foreground">
                        <Link
                          href={`/workshops/${workshop.id}#registrations`}
                          className="text-blue-600 hover:text-blue-700 hover:underline"
                        >
                          {workshop._count.registrations} / {workshop.maxAttendees}
                        </Link>
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

      <FadeUp delay={0.3}>
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <Link
            href="/workshops/new"
            className="block w-full max-w-sm text-center bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
          >
            Create Workshop
          </Link>
        </CardContent>
      </Card>
      </FadeUp>
    </div>
  );
}
