export const dynamic = "force-dynamic";

import Link from "next/link";
import { db } from "@/lib/db";
import { formatCurrency, formatDate } from "@/lib/utils";
import { FadeUp, StaggerContainer, StaggerItem } from "@/components/ui/animated";

type PeriodFilter = "month" | "quarter" | "year" | "all";

interface PageProps {
  searchParams: Promise<{ period?: string }>;
}

function getPeriodStart(period: PeriodFilter): Date | null {
  const now = new Date();
  switch (period) {
    case "month":
      return new Date(now.getFullYear(), now.getMonth(), 1);
    case "quarter": {
      const q = Math.floor(now.getMonth() / 3) * 3;
      return new Date(now.getFullYear(), q, 1);
    }
    case "year":
      return new Date(now.getFullYear(), 0, 1);
    case "all":
      return null;
  }
}

function getPeriodLabel(period: PeriodFilter): string {
  const now = new Date();
  switch (period) {
    case "month":
      return now.toLocaleDateString("en-US", { month: "long", year: "numeric" });
    case "quarter": {
      const q = Math.floor(now.getMonth() / 3) + 1;
      return `Q${q} ${now.getFullYear()}`;
    }
    case "year":
      return `${now.getFullYear()}`;
    case "all":
      return "All Time";
  }
}

export default async function FinancialDashboardPage({ searchParams }: PageProps) {
  const { period: rawPeriod } = await searchParams;
  const period: PeriodFilter =
    rawPeriod === "month" || rawPeriod === "quarter" || rawPeriod === "year" || rawPeriod === "all"
      ? rawPeriod
      : "month";

  const periodStart = getPeriodStart(period);
  const dateFilter = periodStart ? { gte: periodStart } : undefined;

  const [
    totalRevenue,
    totalRegistrations,
    paidRegistrations,
    freeRegistrations,
    revenueByWorkshop,
    revenueByCategory,
  ] = await Promise.all([
    db.registration.aggregate({
      _sum: { amountPaidCents: true },
      where: {
        paymentStatus: "COMPLETED",
        ...(dateFilter ? { createdAt: dateFilter } : {}),
      },
    }),
    db.registration.count({
      where: dateFilter ? { createdAt: dateFilter } : {},
    }),
    db.registration.count({
      where: {
        paymentStatus: "COMPLETED",
        ...(dateFilter ? { createdAt: dateFilter } : {}),
      },
    }),
    db.registration.count({
      where: {
        paymentStatus: "FREE",
        ...(dateFilter ? { createdAt: dateFilter } : {}),
      },
    }),
    db.workshop.findMany({
      where: {
        registrations: {
          some: {
            paymentStatus: "COMPLETED",
            ...(dateFilter ? { createdAt: dateFilter } : {}),
          },
        },
      },
      select: {
        id: true,
        title: true,
        workshopCode: true,
        eventDate: true,
        status: true,
        coach: { select: { firstName: true, lastName: true } },
        registrations: {
          where: {
            paymentStatus: "COMPLETED",
            ...(dateFilter ? { createdAt: dateFilter } : {}),
          },
          select: { amountPaidCents: true },
        },
        _count: { select: { registrations: true } },
      },
      orderBy: { eventDate: "desc" },
    }),
    db.workshopType.findMany({
      select: {
        id: true,
        name: true,
        workshops: {
          select: {
            registrations: {
              where: {
                paymentStatus: "COMPLETED",
                ...(dateFilter ? { createdAt: dateFilter } : {}),
              },
              select: { amountPaidCents: true },
            },
          },
        },
      },
    }),
  ]);

  const totalRevenueCents = totalRevenue._sum.amountPaidCents || 0;

  const workshopRevenue = revenueByWorkshop
    .map((w) => ({
      id: w.id,
      title: w.title,
      workshopCode: w.workshopCode,
      eventDate: w.eventDate,
      status: w.status,
      coachName: `${w.coach.firstName} ${w.coach.lastName}`,
      totalRegistrations: w._count.registrations,
      revenue: w.registrations.reduce((sum, r) => sum + (r.amountPaidCents || 0), 0),
    }))
    .sort((a, b) => b.revenue - a.revenue);

  const categoryRevenue = revenueByCategory
    .map((cat) => ({
      id: cat.id,
      name: cat.name,
      revenue: cat.workshops.reduce(
        (sum, w) => sum + w.registrations.reduce((s, r) => s + (r.amountPaidCents || 0), 0),
        0
      ),
      workshops: cat.workshops.length,
    }))
    .filter((c) => c.revenue > 0)
    .sort((a, b) => b.revenue - a.revenue);

  const avgRevenuePerWorkshop =
    workshopRevenue.length > 0 ? Math.round(totalRevenueCents / workshopRevenue.length) : 0;

  return (
    <div className="space-y-6">
      <FadeUp>
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
              <Link href="/admin/dashboard" className="hover:text-gray-700">Admin Dashboard</Link>
              <span>/</span>
              <span className="text-gray-900">Financial Dashboard</span>
            </div>
            <h1 className="text-2xl font-bold text-gray-900">Financial Dashboard</h1>
            <p className="text-gray-600">Revenue breakdown — {getPeriodLabel(period)}</p>
          </div>
        </div>
      </FadeUp>

      {/* Period Filter */}
      <div className="flex gap-2">
        {(["month", "quarter", "year", "all"] as PeriodFilter[]).map((p) => (
          <Link
            key={p}
            href={`/admin/financials?period=${p}`}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              period === p
                ? "bg-blue-600 text-white"
                : "bg-white border border-gray-300 text-gray-700 hover:bg-gray-50"
            }`}
          >
            {p === "month" ? "Monthly" : p === "quarter" ? "Quarterly" : p === "year" ? "Annual" : "All Time"}
          </Link>
        ))}
      </div>

      {/* Summary Stats */}
      <StaggerContainer className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StaggerItem>
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <p className="text-xs uppercase tracking-wide text-gray-500">Total Revenue</p>
            <p className="mt-2 text-2xl font-semibold text-green-600">{formatCurrency(totalRevenueCents)}</p>
          </div>
        </StaggerItem>
        <StaggerItem>
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <p className="text-xs uppercase tracking-wide text-gray-500">Avg / Workshop</p>
            <p className="mt-2 text-2xl font-semibold text-gray-900">{formatCurrency(avgRevenuePerWorkshop)}</p>
          </div>
        </StaggerItem>
        <StaggerItem>
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <p className="text-xs uppercase tracking-wide text-gray-500">Paid Registrations</p>
            <p className="mt-2 text-2xl font-semibold text-gray-900">{paidRegistrations}</p>
            <p className="text-xs text-gray-400 mt-1">{freeRegistrations} free</p>
          </div>
        </StaggerItem>
        <StaggerItem>
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <p className="text-xs uppercase tracking-wide text-gray-500">Total Registrations</p>
            <p className="mt-2 text-2xl font-semibold text-gray-900">{totalRegistrations}</p>
          </div>
        </StaggerItem>
      </StaggerContainer>

      {/* Revenue by Category */}
      {categoryRevenue.length > 0 && (
        <FadeUp delay={0.15}>
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <h3 className="mb-4 text-lg font-semibold text-gray-900">Revenue by Workshop Type</h3>
          <div className="space-y-3">
            {categoryRevenue.map((cat) => {
              const pct = totalRevenueCents > 0 ? Math.round((cat.revenue / totalRevenueCents) * 100) : 0;
              return (
                <div key={cat.id} className="flex items-center gap-4">
                  <div className="w-40 text-sm font-medium text-gray-900 truncate">{cat.name}</div>
                  <div className="flex-1 bg-gray-100 rounded-full h-4 overflow-hidden">
                    <div
                      className="bg-blue-500 h-full rounded-full transition-all"
                      style={{ width: `${Math.max(pct, 2)}%` }}
                    />
                  </div>
                  <div className="w-24 text-right text-sm font-semibold text-gray-900">
                    {formatCurrency(cat.revenue)}
                  </div>
                  <div className="w-12 text-right text-xs text-gray-500">{pct}%</div>
                </div>
              );
            })}
          </div>
        </div>
        </FadeUp>
      )}

      {/* Revenue by Workshop */}
      <FadeUp delay={0.25}>
      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="text-lg font-semibold text-gray-900">Revenue by Workshop</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Code</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Workshop</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Coach</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Event Date</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Registrations</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Revenue</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {workshopRevenue.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-gray-500">
                    No revenue data for this period.
                  </td>
                </tr>
              ) : (
                workshopRevenue.map((w) => (
                  <tr key={w.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-mono text-gray-600">
                      {w.workshopCode || "—"}
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/workshops/${w.id}`} className="text-blue-600 hover:text-blue-800 font-medium text-sm">
                        {w.title}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900">{w.coachName}</td>
                    <td className="px-4 py-3 text-sm text-gray-900">{formatDate(w.eventDate)}</td>
                    <td className="px-4 py-3 text-sm text-gray-900 text-right">{w.totalRegistrations}</td>
                    <td className="px-4 py-3 text-sm font-semibold text-green-600 text-right">
                      {formatCurrency(w.revenue)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {workshopRevenue.length > 0 && (
              <tfoot className="bg-gray-50">
                <tr>
                  <td colSpan={5} className="px-4 py-3 text-sm font-semibold text-gray-900 text-right">
                    Total
                  </td>
                  <td className="px-4 py-3 text-sm font-bold text-green-600 text-right">
                    {formatCurrency(totalRevenueCents)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
      </FadeUp>
    </div>
  );
}
