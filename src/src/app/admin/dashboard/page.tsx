import Link from "next/link";
import { db } from "@/lib/db";
import { getWorkshopStatusColor, getWorkshopStatusLabel, formatCurrency } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { FadeUp, StaggerContainer, StaggerItem } from "@/components/ui/animated";

const PIPELINE_STAGES = [
  { status: "REQUESTED", icon: "📝" },
  { status: "AWAITING_APPROVAL", icon: "⏳" },
  { status: "PRE_EVENT", icon: "🟢" },
  { status: "POST_EVENT", icon: "📊" },
  { status: "COMPLETED", icon: "✅" },
  { status: "CANCELED", icon: "🚫" },
] as const;

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
    totalCoaches,
    registrationsThisMonth,
    revenueThisMonth,
    pipelineCounts,
    recentApprovals,
    recentRegistrations,
    recentWorkshops,
  ] = await Promise.all([
    db.approvalQueue.count({ where: { status: "PENDING" } }),
    db.coach.count(),
    db.registration.count({
      where: { createdAt: { gte: monthStart } },
    }),
    db.registration.aggregate({
      _sum: { amountPaidCents: true },
      where: {
        paymentStatus: "COMPLETED",
        createdAt: { gte: monthStart },
      },
    }),
    // Pipeline: count workshops per stage
    db.workshop.groupBy({
      by: ["status"],
      _count: { id: true },
    }),
    db.approvalQueue.findMany({
      take: 5,
      orderBy: { requestedAt: "desc" },
      include: {
        coach: { select: { firstName: true, lastName: true } },
      },
    }),
    db.registration.findMany({
      take: 5,
      orderBy: { createdAt: "desc" },
      include: {
        workshop: { select: { title: true } },
      },
    }),
    db.workshop.findMany({
      take: 5,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        title: true,
        workshopCode: true,
        status: true,
        createdAt: true,
      },
    }),
  ]);

  // Build pipeline counts map
  const countsByStatus: Record<string, number> = {};
  for (const group of pipelineCounts) {
    countsByStatus[group.status] = group._count.id;
  }
  const totalWorkshops = Object.values(countsByStatus).reduce((a, b) => a + b, 0);

  // Build activity feed
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
      description: `${item.workshopCode ? `[${item.workshopCode}] ` : ""}${item.title} — ${item.status.replace(/_/g, " ")}`,
      timestamp: item.createdAt,
    })),
  ]
    .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
    .slice(0, 10);

  return (
    <div className="space-y-6">
      <FadeUp>
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-gray-900">Admin Dashboard</h2>
          <div className="flex gap-3">
            <Link
              href="/admin/approvals"
              className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700"
            >
              Review Approvals {pendingApprovals > 0 && `(${pendingApprovals})`}
            </Link>
            <Link
              href="/admin/financials"
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Financial Dashboard
            </Link>
          </div>
        </div>
      </FadeUp>

      {/* Top-level Stats */}
      <StaggerContainer className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StaggerItem>
          <StatCard label="Pending Approvals" value={pendingApprovals} urgent={pendingApprovals > 0} />
        </StaggerItem>
        <StaggerItem>
          <StatCard label="Total Workshops" value={totalWorkshops} />
        </StaggerItem>
        <StaggerItem>
          <StatCard label="Total Coaches" value={totalCoaches} />
        </StaggerItem>
        <StaggerItem>
          <StatCard
            label="Revenue (Month)"
            value={formatCurrency(revenueThisMonth._sum.amountPaidCents || 0)}
            sub={`${registrationsThisMonth} registrations`}
          />
        </StaggerItem>
      </StaggerContainer>

      {/* JV-01/02: 6-Stage Pipeline */}
      <FadeUp delay={0.15}>
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <h3 className="mb-4 text-lg font-semibold text-gray-900">Workshop Pipeline</h3>
          <StaggerContainer className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {PIPELINE_STAGES.map((stage) => {
              const count = countsByStatus[stage.status] || 0;
              return (
                <StaggerItem key={stage.status}>
                  <Link
                    href={`/workshops?status=${stage.status}`}
                    className="group block rounded-lg border border-gray-200 p-4 hover:border-blue-300 hover:shadow-sm transition-all"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-lg">{stage.icon}</span>
                      <Badge className={getWorkshopStatusColor(stage.status)} variant="secondary">
                        {getWorkshopStatusLabel(stage.status)}
                      </Badge>
                    </div>
                    <div className="text-3xl font-bold text-gray-900 group-hover:text-blue-600 transition-colors">
                      {count}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      {count === 1 ? "workshop" : "workshops"}
                    </div>
                  </Link>
                </StaggerItem>
              );
            })}
          </StaggerContainer>
        </div>
      </FadeUp>

      {/* Recent Activity */}
      <FadeUp delay={0.25}>
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <h3 className="mb-3 text-lg font-semibold text-gray-900">Recent Activity</h3>
          {activities.length === 0 ? (
            <p className="text-sm text-gray-500">No recent activity found.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {activities.map((activity) => (
                <li key={activity.id} className="flex items-start justify-between py-3">
                  <div className="pr-4">
                    <span
                      className={`mr-2 inline-flex rounded px-2 py-1 text-xs font-medium ${
                        activity.type === "APPROVAL"
                          ? "bg-purple-100 text-purple-700"
                          : activity.type === "REGISTRATION"
                            ? "bg-green-100 text-green-700"
                            : "bg-blue-100 text-blue-700"
                      }`}
                    >
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
      </FadeUp>
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  urgent = false,
}: {
  label: string;
  value: string | number;
  sub?: string;
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
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}
