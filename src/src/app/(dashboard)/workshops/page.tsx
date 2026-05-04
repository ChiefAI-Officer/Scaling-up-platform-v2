export const dynamic = "force-dynamic";

import Link from "next/link";
import { Suspense } from "react";
import { db } from "@/lib/db";
import {
  formatCurrency,
  formatTimestamp,
  formatEventDateUTC,
  getWorkshopStatusColor,
  getWorkshopStatusLabel,
} from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { CopyUrlButton } from "@/components/ui/copy-url-button";
import { WorkshopApprovalActions } from "@/components/workshops/workshop-approval-actions";
import { AdminWorkshopFilters } from "@/components/workshops/admin-workshop-filters";
import { FadeUp } from "@/components/ui/animated";
import { ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";

const APP_URL = process.env.APP_URL || "https://scaling-up-platform-v2.vercel.app";

const PER_PAGE_OPTIONS = [10, 25, 50];

type SortField = "title" | "coach" | "createdAt" | "eventDate";
type SortOrder = "asc" | "desc";

interface PageProps {
  searchParams: Promise<{
    search?: string;
    status?: string;
    page?: string;
    per_page?: string;
    sort?: string;
    order?: string;
  }>;
}

async function getWorkshops(
  search?: string,
  status?: string,
  page = 1,
  perPage = 25,
  sort: SortField = "createdAt",
  order: SortOrder = "desc"
) {
  const where = {
    ...(search
      ? {
          OR: [
            { title: { contains: search, mode: "insensitive" as const } },
            { coach: { firstName: { contains: search, mode: "insensitive" as const } } },
            { coach: { lastName: { contains: search, mode: "insensitive" as const } } },
          ],
        }
      : {}),
    ...(status ? { status } : {}),
  };

  const orderBy =
    sort === "coach"
      ? [{ coach: { firstName: order } }, { coach: { lastName: order } }]
      : sort === "title"
        ? [{ title: order }]
        : sort === "eventDate"
          ? [{ eventDate: order }]
          : [{ createdAt: order }];

  const [workshops, total] = await Promise.all([
    db.workshop.findMany({
      where,
      include: {
        coach: true,
        workshopType: true,
        // BUG-02-admin-followup: include pricingTier so the Workshop Type column
        // can render the half-day/full-day/virtual label Jeff asked for at 1:13.
        pricingTier: true,
        approvals: {
          where: { status: "PENDING" },
          select: { id: true },
          take: 1,
        },
        _count: { select: { registrations: { where: { paymentStatus: { not: "PENDING" } } } } },
      },
      orderBy,
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    db.workshop.count({ where }),
  ]);

  return { workshops, total };
}

function formatStartTime(eventTime: string | null): string {
  if (!eventTime) return "TBD";
  if (eventTime.includes("-")) {
    const [start] = eventTime.split("-").map((v) => v.trim());
    return start || eventTime;
  }
  return eventTime;
}

function costLabel(workshop: {
  isFree: boolean;
  priceCents: number | null;
  earlyBirdPriceCents: number | null;
}): string {
  if (workshop.isFree) return "Free";
  const cents = workshop.earlyBirdPriceCents ?? workshop.priceCents ?? 0;
  return formatCurrency(cents);
}

function formatWorkshopMode(format: string): string {
  if (format === "VIRTUAL") return "Virtual";
  if (format === "HYBRID") return "Hybrid";
  return "In-Person";
}

function SortHeader({
  label,
  field,
  currentSort,
  currentOrder,
  currentSearch,
  currentStatus,
  currentPerPage,
}: {
  label: string;
  field: SortField;
  currentSort: SortField;
  currentOrder: SortOrder;
  currentSearch?: string;
  currentStatus?: string;
  currentPerPage: number;
}) {
  const isActive = currentSort === field;
  const nextOrder = isActive && currentOrder === "asc" ? "desc" : "asc";

  const params = new URLSearchParams();
  if (currentSearch) params.set("search", currentSearch);
  if (currentStatus) params.set("status", currentStatus);
  params.set("sort", field);
  params.set("order", nextOrder);
  params.set("per_page", String(currentPerPage));
  params.set("page", "1");

  return (
    <Link
      href={`/workshops?${params.toString()}`}
      className="inline-flex items-center gap-1 hover:text-foreground transition-colors group"
    >
      {label}
      {isActive ? (
        currentOrder === "asc" ? (
          <ChevronUp className="w-3.5 h-3.5" />
        ) : (
          <ChevronDown className="w-3.5 h-3.5" />
        )
      ) : (
        <ChevronsUpDown className="w-3.5 h-3.5 opacity-40 group-hover:opacity-70" />
      )}
    </Link>
  );
}

export default async function WorkshopsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const search = params.search;
  const status = params.status;
  const page = Math.max(1, parseInt(params.page || "1", 10));
  const perPage = PER_PAGE_OPTIONS.includes(parseInt(params.per_page || "25", 10))
    ? parseInt(params.per_page || "25", 10)
    : 25;
  const sort = (["title", "coach", "createdAt", "eventDate"].includes(params.sort || "")
    ? params.sort
    : "createdAt") as SortField;
  const order = (["asc", "desc"].includes(params.order || "") ? params.order : "desc") as SortOrder;

  const { workshops, total } = await getWorkshops(search, status, page, perPage, sort, order);
  const totalPages = Math.ceil(total / perPage);

  function pageUrl(p: number) {
    const ps = new URLSearchParams();
    if (search) ps.set("search", search);
    if (status) ps.set("status", status);
    ps.set("sort", sort);
    ps.set("order", order);
    ps.set("per_page", String(perPage));
    ps.set("page", String(p));
    return `/workshops?${ps.toString()}`;
  }

  function perPageUrl(pp: number) {
    const ps = new URLSearchParams();
    if (search) ps.set("search", search);
    if (status) ps.set("status", status);
    ps.set("sort", sort);
    ps.set("order", order);
    ps.set("per_page", String(pp));
    ps.set("page", "1");
    return `/workshops?${ps.toString()}`;
  }

  const sortHeaderProps = {
    currentSort: sort,
    currentOrder: order,
    currentSearch: search,
    currentStatus: status,
    currentPerPage: perPage,
  };

  return (
    <div className="space-y-6">
      <FadeUp>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">All Workshops</h1>
            <p className="text-muted-foreground">Manage all workshop events</p>
          </div>
          <Link
            href="/workshops/new"
            className="inline-flex rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            + New Workshop
          </Link>
        </div>
      </FadeUp>

      {/* Search & Filter Bar */}
      <Suspense>
        <AdminWorkshopFilters />
      </Suspense>

      <div className="bg-card rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-border">
            <thead className="bg-muted">
              <tr>
                {/* MR-07: Column order: Workshop, Coach, Submit Date, Start Date, Start Time, Cost, Format, Registrations, Landing URL, Status, Actions */}
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  <SortHeader label="Workshop" field="title" {...sortHeaderProps} />
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  <SortHeader label="Coach" field="coach" {...sortHeaderProps} />
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  <SortHeader label="Submit Date" field="createdAt" {...sortHeaderProps} />
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  <SortHeader label="Start Date" field="eventDate" {...sortHeaderProps} />
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Start Time
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Workshop Type
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Cost
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Format
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Registrations
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Landing URL
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-card divide-y divide-border">
              {workshops.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-6 py-12 text-center text-muted-foreground">
                    {search || status ? (
                      <>No workshops match your filters.</>
                    ) : (
                      <>
                        No workshops yet.{" "}
                        <Link href="/workshops/new" className="text-primary hover:underline">
                          Create your first workshop
                        </Link>
                      </>
                    )}
                  </td>
                </tr>
              ) : (
                workshops.map((workshop) => (
                  <tr key={workshop.id} className="hover:bg-accent">
                    <td className="px-4 py-4">
                      <Link
                        href={`/workshops/${workshop.id}`}
                        className="text-primary hover:text-primary/80 font-medium"
                      >
                        {workshop.title}
                      </Link>
                      <p className="text-sm text-muted-foreground">{workshop.workshopType?.name}</p>
                    </td>
                    <td className="px-4 py-4 text-sm text-foreground">
                      {workshop.coach.firstName} {workshop.coach.lastName}
                    </td>
                    <td className="px-4 py-4 text-sm text-foreground">
                      {formatTimestamp(workshop.createdAt)}
                    </td>
                    <td className="px-4 py-4 text-sm text-foreground">
                      {formatEventDateUTC(workshop.eventDate)}
                    </td>
                    <td className="px-4 py-4 text-sm text-foreground">
                      {formatStartTime(workshop.eventTime)}
                    </td>
                    <td className="px-4 py-4 text-sm text-foreground">
                      {workshop.pricingTier?.name ?? <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-4 py-4 text-sm text-foreground">
                      {costLabel(workshop)}
                    </td>
                    <td className="px-4 py-4 text-sm text-foreground">
                      {formatWorkshopMode(workshop.format)}
                    </td>
                    <td className="px-4 py-4 text-sm text-foreground">
                      <Link
                        href={`/workshops/${workshop.id}#registrations`}
                        className="text-primary hover:text-primary/80 hover:underline"
                      >
                        {workshop._count.registrations} / {workshop.maxAttendees}
                      </Link>
                    </td>
                    <td className="px-4 py-4 text-sm">
                      {workshop.landingPageSlug ? (
                        <CopyUrlButton url={`${APP_URL}/workshop/${workshop.landingPageSlug}`} />
                      ) : (
                        <span className="text-muted-foreground text-xs">Not published</span>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      <Badge className={getWorkshopStatusColor(workshop.status)} variant="secondary">
                        {getWorkshopStatusLabel(workshop.status)}
                      </Badge>
                    </td>
                    <td className="px-4 py-4 text-sm">
                      {workshop.approvals[0] ? (
                        <WorkshopApprovalActions
                          approvalId={workshop.approvals[0].id}
                          workshopTitle={workshop.title}
                        />
                      ) : (
                        <Link
                          href={`/workshops/${workshop.id}/landing-pages`}
                          className="text-muted-foreground hover:text-primary font-medium text-xs"
                        >
                          Edit
                        </Link>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* MR-09: Pagination */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-muted/40">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>Rows per page:</span>
            {PER_PAGE_OPTIONS.map((pp) => (
              <Link
                key={pp}
                href={perPageUrl(pp)}
                className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                  perPage === pp
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-accent text-foreground"
                }`}
              >
                {pp}
              </Link>
            ))}
          </div>

          <div className="flex items-center gap-1 text-sm">
            <span className="text-muted-foreground mr-2">
              {total === 0
                ? "0 workshops"
                : `${(page - 1) * perPage + 1}–${Math.min(page * perPage, total)} of ${total}`}
            </span>
            <Link
              href={pageUrl(page - 1)}
              aria-disabled={page <= 1}
              className={`px-3 py-1.5 rounded border text-xs font-medium transition-colors ${
                page <= 1
                  ? "pointer-events-none opacity-40 border-border"
                  : "border-border hover:bg-accent"
              }`}
            >
              ← Prev
            </Link>
            <Link
              href={pageUrl(page + 1)}
              aria-disabled={page >= totalPages}
              className={`px-3 py-1.5 rounded border text-xs font-medium transition-colors ${
                page >= totalPages
                  ? "pointer-events-none opacity-40 border-border"
                  : "border-border hover:bg-accent"
              }`}
            >
              Next →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
