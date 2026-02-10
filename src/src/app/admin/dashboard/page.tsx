import Link from "next/link";
import { db } from "@/lib/db";

type ActivityItem = {
  id: string;
  type: "APPROVAL" | "REGISTRATION" | "WORKSHOP";
  description: string;
  timestamp: Date;
};

function formatRelativeTime(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));

  if (diffMinutes < 1) return "just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

export default async function AdminDashboardPage() {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [
    pendingApprovals,
    activeWorkshops,
    totalCoaches,
    registrationsThisMonth,
    revenueThisMonth,
    recentApprovals,
    recentRegistrations,
    recentWorkshops,
  ] = await Promise.all([
    db.approvalQueue.count({ where: { status: "PENDING" } }),
    db.workshop.count({
      where: {
        status: {
          in: [
            "REQUESTED",
            "VALIDATING",
            "APPROVED",
            "SCHEDULED",
            "LIVE",
            "MARKETING_ACTIVE",
            "REGISTRATION_OPEN",
            "SETUP_IN_PROGRESS",
          ],
        },
      },
    }),
    db.coach.count(),
    db.registration.count({
      where: {
        createdAt: { gte: monthStart },
      },
    }),
    db.registration.aggregate({
      _sum: {
        amountPaidCents: true,
      },
      where: {
        paymentStatus: "COMPLETED",
        createdAt: { gte: monthStart },
      },
    }),
    db.approvalQueue.findMany({
      take: 4,
      orderBy: { requestedAt: "desc" },
      include: {
        coach: {
          select: {
            firstName: true,
            lastName: true,
          },
        },
      },
    }),
    db.registration.findMany({
      take: 4,
      orderBy: { createdAt: "desc" },
      include: {
        workshop: {
          select: { title: true },
        },
      },
    }),
    db.workshop.findMany({
      take: 4,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        title: true,
        status: true,
        createdAt: true,
      },
    }),
  ]);

  const activities: ActivityItem[] = [
    ...recentApprovals.map((item) => ({
      id: `approval-${item.id}`,
      type: "APPROVAL" as const,
      description: `${item.type.replace(/_/g, " ")} request from ${item.coach.firstName} ${item.coach.lastName}`,
      timestamp: item.requestedAt,
    })),
    ...recentRegistrations.map((item) => ({
      id: `registration-${item.id}`,
      type: "REGISTRATION" as const,
      description: `New registration for ${item.workshop.title}`,
      timestamp: item.createdAt,
    })),
    ...recentWorkshops.map((item) => ({
      id: `workshop-${item.id}`,
      type: "WORKSHOP" as const,
      description: `${item.title} is now ${item.status.replace(/_/g, " ")}`,
      timestamp: item.createdAt,
    })),
  ]
    .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
    .slice(0, 8);

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-900">Admin Dashboard</h2>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Pending Approvals" value={pendingApprovals} urgent />
        <StatCard label="Active Workshops" value={activeWorkshops} />
        <StatCard label="Total Coaches" value={totalCoaches} />
        <StatCard label="Registrations (Month)" value={registrationsThisMonth} />
        <StatCard
          label="Revenue (Month)"
          value={`$${((revenueThisMonth._sum.amountPaidCents || 0) / 100).toLocaleString()}`}
        />
      </div>

      <div className="flex flex-wrap gap-3">
        <Link
          href="/admin/approvals"
          className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700"
        >
          Review Pending Approvals
        </Link>
        <Link
          href="/dashboard"
          className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Open Operations Dashboard
        </Link>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <h3 className="mb-3 text-lg font-semibold text-gray-900">Recent Activity</h3>
        {activities.length === 0 ? (
          <p className="text-sm text-gray-500">No recent activity found.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {activities.map((activity) => (
              <li key={activity.id} className="flex items-start justify-between py-3">
                <div className="pr-4">
                  <span className="mr-2 inline-flex rounded bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700">
                    {activity.type}
                  </span>
                  <span className="text-sm text-gray-800">{activity.description}</span>
                </div>
                <span className="shrink-0 text-xs text-gray-500">
                  {formatRelativeTime(activity.timestamp)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  urgent = false,
}: {
  label: string;
  value: string | number;
  urgent?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border bg-white p-4 shadow-sm ${
        urgent ? "border-red-200" : "border-gray-200"
      }`}
    >
      <p className="text-xs uppercase tracking-wide text-gray-500">{label}</p>
      <p className={`mt-2 text-2xl font-semibold ${urgent ? "text-red-600" : "text-gray-900"}`}>
        {value}
      </p>
    </div>
  );
}
