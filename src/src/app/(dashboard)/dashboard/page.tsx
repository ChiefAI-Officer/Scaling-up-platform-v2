export const dynamic = 'force-dynamic';

import Link from "next/link";
import { db } from "@/lib/db";
import { formatDate, formatCurrency, getWorkshopStatusColor, getWorkshopStatusLabel } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

async function getDashboardMetrics() {
  const now = new Date();

  const [
    totalWorkshops,
    upcomingWorkshops,
    totalRegistrations,
    revenueResult,
    workshopsByStatus,
    recentWorkshops,
    totalCoaches,
    pendingApprovals,
  ] = await Promise.all([
    db.workshop.count(),
    db.workshop.count({
      where: {
        eventDate: { gte: now },
        status: { notIn: ["CANCELLED", "COMPLETED"] },
      },
    }),
    db.registration.count({
      where: { status: { not: "CANCELLED" } },
    }),
    db.registration.aggregate({
      _sum: { amountPaidCents: true },
      where: { paymentStatus: "COMPLETED" },
    }),
    db.workshop.groupBy({
      by: ["status"],
      _count: { id: true },
    }),
    db.workshop.findMany({
      take: 5,
      orderBy: { createdAt: "desc" },
      include: {
        coach: true,
        workshopType: true,
        _count: { select: { registrations: true } },
      },
    }),
    db.coach.count(),
    // Sprint 1: Pending approvals for Figma urgency widget
    db.approvalQueue.count({
      where: { status: "PENDING" },
    }),
  ]);

  return {
    totalWorkshops,
    upcomingWorkshops,
    totalRegistrations,
    totalRevenue: revenueResult._sum.amountPaidCents || 0,
    workshopsByStatus: Object.fromEntries(
      workshopsByStatus.map((s) => [s.status, s._count.id])
    ),
    recentWorkshops,
    totalCoaches,
    pendingApprovals,
  };
}

export default async function DashboardPage() {
  const metrics = await getDashboardMetrics();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-600">Overview of workshop operations</p>
      </div>

      {/* Sprint 1: Pending Approvals Urgency Banner */}
      {metrics.pendingApprovals > 0 && (
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">⚠️</span>
            <div>
              <p className="font-medium text-orange-800">
                {metrics.pendingApprovals} pending approval{metrics.pendingApprovals > 1 ? "s" : ""} require attention
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

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">
              Total Workshops
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{metrics.totalWorkshops}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">
              Upcoming Workshops
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-blue-600">
              {metrics.upcomingWorkshops}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">
              Total Registrations
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{metrics.totalRegistrations}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">
              Total Revenue
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-green-600">
              {formatCurrency(metrics.totalRevenue)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Pipeline Summary */}
      <Card>
        <CardHeader>
          <CardTitle>Workshop Pipeline</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            {[
              "REQUESTED",
              "VALIDATING",
              "APPROVED",
              "SETUP_IN_PROGRESS",
              "MARKETING_ACTIVE",
              "REGISTRATION_OPEN",
              "COMPLETED",
            ].map((status) => (
              <div
                key={status}
                className="flex items-center gap-2 bg-gray-50 rounded-lg px-4 py-2"
              >
                <span
                  className={`px-2 py-1 rounded text-xs font-medium ${getWorkshopStatusColor(
                    status
                  )}`}
                >
                  {getWorkshopStatusLabel(status)}
                </span>
                <span className="font-bold">
                  {metrics.workshopsByStatus[status] || 0}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Recent Workshops */}
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
          <div className="space-y-4">
            {metrics.recentWorkshops.length === 0 ? (
              <p className="text-gray-500 text-center py-8">
                No workshops yet.{" "}
                <Link href="/workshops/new" className="text-blue-600 hover:underline">
                  Create your first workshop
                </Link>
              </p>
            ) : (
              metrics.recentWorkshops.map((workshop) => (
                <Link
                  key={workshop.id}
                  href={`/workshops/${workshop.id}`}
                  className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <h3 className="font-medium text-gray-900">
                        {workshop.title}
                      </h3>
                      <Badge
                        className={getWorkshopStatusColor(workshop.status)}
                        variant="secondary"
                      >
                        {getWorkshopStatusLabel(workshop.status)}
                      </Badge>
                    </div>
                    <p className="text-sm text-gray-500 mt-1">
                      {workshop.workshopType.name} • {workshop.coach.firstName}{" "}
                      {workshop.coach.lastName} • {formatDate(workshop.eventDate)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium">
                      {workshop._count.registrations} registrations
                    </p>
                    <p className="text-sm text-gray-500">
                      of {workshop.maxAttendees} max
                    </p>
                  </div>
                </Link>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Active Coaches</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-4xl font-bold">{metrics.totalCoaches}</p>
            <Link
              href="/coaches"
              className="text-sm text-blue-600 hover:text-blue-700 font-medium mt-2 inline-block"
            >
              Manage Coaches
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Link
              href="/workshops/new"
              className="block w-full text-center bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
            >
              Create New Workshop
            </Link>
            <Link
              href="/coaches"
              className="block w-full text-center bg-gray-100 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-200 transition-colors"
            >
              View All Coaches
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
