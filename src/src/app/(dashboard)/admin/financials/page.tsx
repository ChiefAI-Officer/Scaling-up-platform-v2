export const dynamic = "force-dynamic";

import Link from "next/link";
import { Suspense } from "react";
import { db } from "@/lib/db";
import { formatCurrency, formatDate } from "@/lib/utils";
import { FadeUp, StaggerContainer, StaggerItem } from "@/components/ui/animated";
import { FinancialFilters } from "@/components/financials/financial-filters";

type PeriodFilter = "month" | "quarter" | "year" | "all" | "custom";

interface PageProps {
  searchParams: Promise<{
    period?: string;
    coachId?: string;
    categoryId?: string;
    startDate?: string;
    endDate?: string;
  }>;
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
    case "custom":
      return null;
  }
}

function getPeriodLabel(period: PeriodFilter, startDate?: string, endDate?: string): string {
  if (period === "custom") {
    const parts: string[] = [];
    if (startDate) parts.push(new Date(startDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }));
    if (endDate) parts.push(new Date(endDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }));
    return parts.length > 0 ? parts.join(" – ") : "Custom Range";
  }
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
  const { period: rawPeriod, coachId, categoryId, startDate, endDate } = await searchParams;
  const validPeriods = ["month", "quarter", "year", "all", "custom"];
  const period: PeriodFilter = validPeriods.includes(rawPeriod || "")
    ? (rawPeriod as PeriodFilter)
    : "month";

  // Build date filter from period presets or custom range
  let dateFilter: { gte?: Date; lte?: Date } | undefined;
  if (period === "custom") {
    const gte = startDate ? new Date(startDate) : undefined;
    const lte = endDate ? new Date(`${endDate}T23:59:59.999Z`) : undefined;
    if (gte || lte) {
      dateFilter = { ...(gte ? { gte } : {}), ...(lte ? { lte } : {}) };
    }
  } else {
    const periodStart = getPeriodStart(period);
    dateFilter = periodStart ? { gte: periodStart } : undefined;
  }

  // Build workshop-level filter for coach and category
  const workshopFilter: Record<string, unknown> = {};
  if (coachId) workshopFilter.coachId = coachId;
  if (categoryId) workshopFilter.categoryId = categoryId;
  const hasWorkshopFilter = Object.keys(workshopFilter).length > 0;

  // Fetch filter options
  const [coaches, categories] = await Promise.all([
    db.coach.findMany({
      select: { id: true, firstName: true, lastName: true },
      orderBy: { firstName: "asc" },
    }),
    db.category.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  // Registration-level filter: date + optional workshop scoping
  const registrationWhere = {
    ...(dateFilter ? { createdAt: dateFilter } : {}),
    ...(hasWorkshopFilter ? { workshop: workshopFilter } : {}),
  };

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
      where: { paymentStatus: "COMPLETED", ...registrationWhere },
    }),
    db.registration.count({
      where: { paymentStatus: { not: "PENDING" }, ...registrationWhere },
    }),
    db.registration.count({
      where: { paymentStatus: "COMPLETED", ...registrationWhere },
    }),
    db.registration.count({
      where: { paymentStatus: "FREE", ...registrationWhere },
    }),
    db.workshop.findMany({
      where: {
        ...workshopFilter,
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
        _count: { select: { registrations: { where: { paymentStatus: { not: "PENDING" } } } } },
      },
      orderBy: { eventDate: "desc" },
    }),
    db.workshopType.findMany({
      select: {
        id: true,
        name: true,
        workshops: {
          where: hasWorkshopFilter ? workshopFilter : undefined,
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
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <Link href="/admin/dashboard" className="hover:text-foreground">Admin Dashboard</Link>
              <span>/</span>
              <span className="text-foreground">Financial Dashboard</span>
            </div>
            <h1 className="text-2xl font-bold text-foreground">Financial Dashboard</h1>
            <p className="text-muted-foreground">Revenue breakdown — {getPeriodLabel(period, startDate, endDate)}</p>
          </div>
        </div>
      </FadeUp>

      {/* Filters: Period + Coach + Category + Date Range */}
      <Suspense>
        <FinancialFilters coaches={coaches} categories={categories} />
      </Suspense>

      {/* Summary Stats */}
      <StaggerContainer className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StaggerItem>
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Total Revenue</p>
            <p className="mt-2 text-2xl font-semibold text-success">{formatCurrency(totalRevenueCents)}</p>
          </div>
        </StaggerItem>
        <StaggerItem>
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Avg / Workshop</p>
            <p className="mt-2 text-2xl font-semibold text-foreground">{formatCurrency(avgRevenuePerWorkshop)}</p>
          </div>
        </StaggerItem>
        <StaggerItem>
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Paid Registrations</p>
            <p className="mt-2 text-2xl font-semibold text-foreground">{paidRegistrations}</p>
            <p className="text-xs text-muted-foreground mt-1">{freeRegistrations} free</p>
          </div>
        </StaggerItem>
        <StaggerItem>
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Total Registrations</p>
            <p className="mt-2 text-2xl font-semibold text-foreground">{totalRegistrations}</p>
          </div>
        </StaggerItem>
      </StaggerContainer>

      {/* Revenue by Category */}
      {categoryRevenue.length > 0 && (
        <FadeUp delay={0.15}>
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="mb-4 text-lg font-semibold text-foreground">Revenue by Workshop Type</h3>
          <div className="space-y-3">
            {categoryRevenue.map((cat) => {
              const pct = totalRevenueCents > 0 ? Math.round((cat.revenue / totalRevenueCents) * 100) : 0;
              return (
                <div key={cat.id} className="flex items-center gap-4">
                  <div className="w-40 text-sm font-medium text-foreground truncate">{cat.name}</div>
                  <div className="flex-1 bg-muted rounded-full h-4 overflow-hidden">
                    <div
                      className="bg-primary h-full rounded-full transition-all"
                      style={{ width: `${Math.max(pct, 2)}%` }}
                    />
                  </div>
                  <div className="w-24 text-right text-sm font-semibold text-foreground">
                    {formatCurrency(cat.revenue)}
                  </div>
                  <div className="w-12 text-right text-xs text-muted-foreground">{pct}%</div>
                </div>
              );
            })}
          </div>
        </div>
        </FadeUp>
      )}

      {/* Revenue by Workshop */}
      <FadeUp delay={0.25}>
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h3 className="text-lg font-semibold text-foreground">Revenue by Workshop</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-border">
            <thead className="bg-muted">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Code</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Workshop</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Coach</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Event Date</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">Registrations</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">Revenue</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {workshopRevenue.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">
                    No revenue data for this period.
                  </td>
                </tr>
              ) : (
                workshopRevenue.map((w) => (
                  <tr key={w.id} className="hover:bg-accent">
                    <td className="px-4 py-3 text-sm font-mono text-muted-foreground">
                      {w.workshopCode || "—"}
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/workshops/${w.id}`} className="text-primary hover:text-primary/80 font-medium text-sm">
                        {w.title}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-sm text-foreground">{w.coachName}</td>
                    <td className="px-4 py-3 text-sm text-foreground">{formatDate(w.eventDate)}</td>
                    <td className="px-4 py-3 text-sm text-foreground text-right">{w.totalRegistrations}</td>
                    <td className="px-4 py-3 text-sm font-semibold text-success text-right">
                      {formatCurrency(w.revenue)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {workshopRevenue.length > 0 && (
              <tfoot className="bg-muted">
                <tr>
                  <td colSpan={5} className="px-4 py-3 text-sm font-semibold text-foreground text-right">
                    Total
                  </td>
                  <td className="px-4 py-3 text-sm font-bold text-success text-right">
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
