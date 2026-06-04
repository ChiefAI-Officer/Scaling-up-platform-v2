import { db } from "@/lib/db";
import { requireCoach } from "@/lib/auth/authorization";
import { formatTimeWithZone } from "@/lib/utils";
import Link from "next/link";
import { StatusPill } from "@/components/ui/status-pill";
import { FadeUp, StaggerContainer, StaggerItem } from "@/components/ui/animated";

/**
 * Coach Dashboard - Home Page
 * Sprint 1: Wired to real Prisma data, scoped to logged-in coach
 * Sprint 3: Uses StatusPill component, revenue data hidden (only attendee counts)
 */
export default async function CoachDashboardPage() {
  // Get authenticated coach
  const { coach } = await requireCoach();

  const now = new Date();

  // Real data: Upcoming workshops for this coach
  const upcomingWorkshops = await db.workshop.findMany({
    where: {
      coachId: coach.id,
      eventDate: { gte: now },
    },
    orderBy: { eventDate: "asc" },
    take: 5,
    include: {
      _count: { select: { registrations: { where: { paymentStatus: { not: "PENDING" } } } } },
      workshopType: { select: { name: true } },
    },
  });

  // Real data: Stats aggregation (NO revenue data for coaches)
  const [
    upcomingCount,
    pastCount,
    totalRegistrations,
    pendingFollowUps,
  ] = await Promise.all([
    // Upcoming workshops count
    db.workshop.count({
      where: { coachId: coach.id, eventDate: { gte: now } },
    }),
    // Past workshops count
    db.workshop.count({
      where: { coachId: coach.id, eventDate: { lt: now } },
    }),
    // Total registrations across all workshops (NOT revenue)
    db.registration.count({
      where: { workshop: { coachId: coach.id }, paymentStatus: { not: "PENDING" } },
    }),
    // Pending follow-up reports
    db.followUpReport.count({
      where: { coachId: coach.id, status: "PENDING" },
    }),
  ]);

  const stats = {
    upcomingWorkshops: upcomingCount,
    pastWorkshops: pastCount,
    totalRegistrations,
    pendingFollowUps,
  };

  return (
    <div className="space-y-6">
      <FadeUp>
        <div className="flex justify-between items-center">
          <h2 className="text-2xl font-bold text-foreground">
            Welcome Back, {coach.firstName}!
          </h2>
          <Link
            href="/portal/request"
            className="bg-primary text-primary-foreground px-4 py-2 rounded-lg hover:bg-primary/90 transition-colors"
          >
            + Request New Workshop
          </Link>
        </div>
      </FadeUp>

      {/* Stats Grid - Sprint 3: Only attendee/count stats, NO revenue */}
      <StaggerContainer className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <StaggerItem>
          <StatCard
            label="Upcoming Workshops"
            value={stats.upcomingWorkshops}
            color="blue"
          />
        </StaggerItem>
        <StaggerItem>
          <StatCard
            label="Total Registrations"
            value={stats.totalRegistrations}
            color="green"
          />
        </StaggerItem>
        <StaggerItem>
          <StatCard
            label="Past Workshops"
            value={stats.pastWorkshops}
            color="gray"
          />
        </StaggerItem>
        <StaggerItem>
          <StatCard
            label="Pending Follow-Ups"
            value={stats.pendingFollowUps}
            color={stats.pendingFollowUps > 0 ? "orange" : "gray"}
          />
        </StaggerItem>
      </StaggerContainer>

      {/* Upcoming Workshops */}
      <FadeUp delay={0.15}>
        <div className="bg-card rounded-xl shadow-sm border border-border overflow-hidden">
          <div className="px-6 py-4 border-b border-border flex justify-between items-center">
            <h3 className="text-lg font-semibold text-foreground">Upcoming Workshops</h3>
            <Link href="/portal/workshops" className="text-primary hover:text-primary/80 text-sm">
              View All →
            </Link>
          </div>

          {upcomingWorkshops.length === 0 ? (
            <div className="px-6 py-12 text-center text-muted-foreground">
              <p className="mb-4">No upcoming workshops scheduled.</p>
              <Link
                href="/portal/request"
                className="text-primary hover:text-primary/80 font-medium"
              >
                Request your first workshop →
              </Link>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {upcomingWorkshops.map((workshop) => (
                <li key={workshop.id} className="px-6 py-4 hover:bg-accent transition-colors">
                  <div className="flex justify-between items-center">
                    <div>
                      <h4 className="font-medium text-foreground">{workshop.title}</h4>
                      <p className="text-sm text-muted-foreground">
                        {new Date(workshop.eventDate).toLocaleDateString("en-US", {
                          weekday: "long",
                          month: "long",
                          day: "numeric",
                          year: "numeric",
                          timeZone: "UTC",
                        })}
                        {workshop.eventTime &&
                          ` at ${formatTimeWithZone(workshop.eventTime, workshop.eventDate, workshop.timezone)}`}
                      </p>
                    </div>
                    <div className="text-right">
                      {/* Sprint 3: Only show attendee count, NOT revenue */}
                      <div className="text-lg font-semibold text-primary">
                        {workshop._count.registrations}
                        <span className="text-sm font-normal text-muted-foreground ml-1">
                          registrations
                        </span>
                      </div>
                      <StatusPill status={workshop.status} />
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </FadeUp>

      {/* Pending Follow-Ups Alert */}
      {stats.pendingFollowUps > 0 && (
        <FadeUp delay={0.25}>
          <div className="bg-warning/10 border border-warning/20 rounded-xl p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-2xl">⚠️</span>
              <div>
                <p className="font-medium text-warning">
                  You have {stats.pendingFollowUps} pending 90-day follow-up report{stats.pendingFollowUps > 1 ? "s" : ""}.
                </p>
                <p className="text-sm text-warning/80">
                  Please submit your follow-up reports to maintain your certification status.
                </p>
              </div>
            </div>
            <Link
              href="/portal/follow-up"
              className="bg-warning text-primary-foreground px-4 py-2 rounded-lg hover:bg-warning/90 transition-colors whitespace-nowrap"
            >
              Submit Reports
            </Link>
          </div>
        </FadeUp>
      )}
    </div>
  );
}

// Helper Components
function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  const colors: Record<string, string> = {
    blue: "text-primary",
    green: "text-success",
    gray: "text-muted-foreground",
    orange: "text-warning",
  };

  return (
    <div className="bg-card rounded-xl shadow-sm border border-border p-6">
      <div className="text-sm text-muted-foreground uppercase tracking-wider">{label}</div>
      <div className={`text-3xl font-bold mt-2 ${colors[color] || "text-foreground"}`}>
        {value}
      </div>
    </div>
  );
}
