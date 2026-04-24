"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrency } from "@/lib/utils";

// Exported so the server page can use the same allowlist without duplication
export const SORT_ALLOWLIST = ["createdAt", "firstName", "lastName", "amountPaidCents"] as const;
export type SortField = (typeof SORT_ALLOWLIST)[number];

export interface CoachRegistrationView {
  id: string;
  workshopId: string;
  workshopTitle: string;
  workshopDate: string;
  firstName: string;
  lastName: string;
  email: string;
  company: string | null;
  paymentStatus: string;
  amountPaidCents: number;
  status: string;
  attended: boolean;
  registeredAt: string;
}

interface RegistrationsClientProps {
  registrations: CoachRegistrationView[];
  currentSort?: SortField;
}

function toCsvCell(value: string): string {
  const escaped = value.replace(/"/g, "\"\"");
  return `"${escaped}"`;
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function paymentBadgeVariant(
  paymentStatus: string
): "success" | "warning" | "secondary" {
  switch (paymentStatus) {
    case "COMPLETED":
    case "PAID":
    case "FREE":
      return "success";
    case "FAILED":
    case "REFUNDED":
      return "warning";
    default:
      return "secondary";
  }
}

const PAGE_SIZE = 25;

export function RegistrationsClient({ registrations: initialRegistrations, currentSort = "createdAt" }: RegistrationsClientProps) {
  const router = useRouter();
  const [registrations, setRegistrations] = useState(initialRegistrations);
  const [selectedWorkshopId, setSelectedWorkshopId] = useState("all");
  const [submittingForId, setSubmittingForId] = useState<string | null>(null);
  const [togglingAttendanceId, setTogglingAttendanceId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  // MR-31: pagination + sort
  const [page, setPage] = useState(0);
  // Legacy client-side sort state (kept for backward compat with attendee sort)
  const [sortField, setSortField] = useState<"attendee" | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  // Server-side sort: navigate to ?sort=field for DB-level sorting
  function navigateSort(field: SortField) {
    router.push(`?sort=${field}`);
    setPage(0);
  }

  // Client-side attendee sort (first+last name combined — can't do in DB as single field)
  function toggleSort(field: "attendee") {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
    setPage(0);
  }

  // Sort indicator helpers
  function sortIndicator(field: SortField) {
    if (currentSort === field) return currentSort === "createdAt" ? " ↓" : " ↑";
    return "";
  }
  function attendeeSortIndicator() {
    if (sortField === "attendee") return sortDir === "asc" ? " ↑" : " ↓";
    return "";
  }

  const workshops = useMemo(() => {
    const seen = new Map<string, { id: string; title: string; date: string }>();
    registrations.forEach((registration) => {
      if (!seen.has(registration.workshopId)) {
        seen.set(registration.workshopId, {
          id: registration.workshopId,
          title: registration.workshopTitle,
          date: registration.workshopDate,
        });
      }
    });

    return Array.from(seen.values()).sort((a, b) =>
      a.title.localeCompare(b.title)
    );
  }, [registrations]);

  const filteredSorted = useMemo(() => {
    let result = selectedWorkshopId === "all"
      ? registrations
      : registrations.filter((r) => r.workshopId === selectedWorkshopId);

    // Client-side sort only applies to "attendee" (combined first+last name)
    // All other sorts are server-side via URL param
    if (sortField === "attendee") {
      result = [...result].sort((a, b) => {
        const cmp = `${a.lastName}${a.firstName}`.localeCompare(`${b.lastName}${b.firstName}`);
        return sortDir === "asc" ? cmp : -cmp;
      });
    }
    return result;
  }, [registrations, selectedWorkshopId, sortField, sortDir]);

  const totalPages = Math.ceil(filteredSorted.length / PAGE_SIZE);
  const filteredRegistrations = filteredSorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const exportCsv = () => {
    const headers = [
      "Workshop",
      "Workshop Date",
      "First Name",
      "Last Name",
      "Email",
      "Company",
      "Payment Status",
      "Price Paid",
      "Registration Status",
      "Attended",
      "Registered At",
    ];

    const rows = filteredSorted.map((registration) => [
      registration.workshopTitle,
      formatDate(registration.workshopDate),
      registration.firstName,
      registration.lastName,
      registration.email,
      registration.company || "",
      registration.paymentStatus,
      registration.amountPaidCents === 0 ? "Free" : formatCurrency(registration.amountPaidCents),
      registration.status,
      registration.attended ? "Yes" : "No",
      formatDate(registration.registeredAt),
    ]);

    const csvBody = [headers, ...rows]
      .map((row) => row.map((cell) => toCsvCell(cell)).join(","))
      .join("\n");

    const blob = new Blob([csvBody], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute(
      "download",
      `coach-registrations-${new Date().toISOString().slice(0, 10)}.csv`
    );

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleUnregister = async (registration: CoachRegistrationView) => {
    const requiresAdminRefundReview = registration.paymentStatus === "COMPLETED";
    const confirmed = window.confirm(
      `Unregister ${registration.firstName} ${registration.lastName}? ${requiresAdminRefundReview ? "A refund request will be sent to admins for manual processing." : "This cannot be undone."}`
    );

    if (!confirmed) {
      return;
    }

    setFeedback(null);
    setSubmittingForId(registration.id);

    try {
      const response = await fetch(
        requiresAdminRefundReview
          ? `/api/registrations/${registration.id}/removal-request`
          : `/api/registrations/${registration.id}`,
        requiresAdminRefundReview
          ? {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({}),
            }
          : { method: "DELETE" }
      );

      const result = (await response.json()) as {
        success?: boolean;
        message?: string;
        error?: string;
      };

      if (!response.ok || !result.success) {
        throw new Error(result.error || "Failed to unregister attendee");
      }

      setRegistrations((prev) => {
        return prev.map((r) => {
          if (r.id !== registration.id) {
            return r;
          }

          if (requiresAdminRefundReview) {
            return { ...r, status: "PENDING_REMOVAL" };
          }

          return {
            ...r,
            status: "CANCELLED",
            paymentStatus:
              r.paymentStatus === "COMPLETED" ? "REFUNDED" : r.paymentStatus,
          };
        });
      });

      setFeedback({
        type: "success",
        message:
          result.message ||
          (requiresAdminRefundReview
            ? "Removal request submitted for admin review."
            : "Attendee unregistered successfully."),
      });
    } catch (error) {
      setFeedback({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "Failed to unregister attendee",
      });
    } finally {
      setSubmittingForId(null);
    }
  };

  const handleToggleAttendance = async (registration: CoachRegistrationView) => {
    setTogglingAttendanceId(registration.id);

    try {
      const response = await fetch(
        `/api/registrations/${registration.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ attended: !registration.attended }),
        }
      );

      const result = (await response.json()) as {
        success?: boolean;
        data?: { attended: boolean };
        error?: string;
      };

      if (!response.ok || !result.success) {
        throw new Error(result.error || "Failed to update attendance");
      }

      setRegistrations((prev) =>
        prev.map((r) =>
          r.id === registration.id
            ? { ...r, attended: result.data?.attended ?? !r.attended }
            : r
        )
      );
    } catch (error) {
      setFeedback({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "Failed to update attendance",
      });
    } finally {
      setTogglingAttendanceId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Registrations</h1>
          <p className="text-sm text-muted-foreground">
            View and export attendee data for your workshops.
          </p>
        </div>
        <Button
          onClick={exportCsv}
          disabled={filteredSorted.length === 0}
          className="sm:w-auto"
        >
          Export CSV
        </Button>
      </div>

      {feedback && (
        <div
          className={`rounded-md border px-4 py-3 text-sm ${
            feedback.type === "success"
              ? "border-success/20 bg-success/10 text-success"
              : "border-destructive/20 bg-destructive/10 text-destructive"
          }`}
        >
          {feedback.message}
        </div>
      )}

      <div className="flex flex-col gap-2 sm:max-w-sm">
        <label
          htmlFor="workshopFilter"
          className="text-sm font-medium text-foreground"
        >
          Filter by workshop
        </label>
        <select
          id="workshopFilter"
          value={selectedWorkshopId}
          onChange={(event) => setSelectedWorkshopId(event.target.value)}
          className="rounded-md border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <option value="all">All workshops</option>
          {workshops.map((workshop) => (
            <option key={workshop.id} value={workshop.id}>
              {workshop.title}
            </option>
          ))}
        </select>
      </div>

      <div className="rounded-xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead
                className="cursor-pointer select-none hover:text-foreground"
                onClick={() => toggleSort("attendee")}
              >
                Attendee{attendeeSortIndicator()}
              </TableHead>
              <TableHead
                className="cursor-pointer select-none hover:text-foreground"
                onClick={() => navigateSort("createdAt")}
              >
                Workshop{sortIndicator("createdAt")}
              </TableHead>
              <TableHead
                className="cursor-pointer select-none hover:text-foreground"
                onClick={() => navigateSort("createdAt")}
              >
                Registered{sortIndicator("createdAt")}
              </TableHead>
              <TableHead>Payment</TableHead>
              <TableHead
                className="cursor-pointer select-none hover:text-foreground"
                onClick={() => navigateSort("amountPaidCents")}
              >
                Price Paid{sortIndicator("amountPaidCents")}
              </TableHead>
              <TableHead>Attended</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredRegistrations.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                  No registrations found for this filter.
                </TableCell>
              </TableRow>
            ) : (
              filteredRegistrations.map((registration) => (
                <TableRow key={registration.id}>
                  <TableCell>
                    <div className="font-medium text-foreground">
                      {registration.firstName} {registration.lastName}
                    </div>
                    <div className="text-sm text-muted-foreground">{registration.email}</div>
                    {registration.company && (
                      <div className="text-sm text-muted-foreground">{registration.company}</div>
                    )}
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/portal/workshops/${registration.workshopId}`}
                      className="font-medium text-foreground hover:text-primary hover:underline"
                    >
                      {registration.workshopTitle}
                    </Link>
                    <div className="text-sm text-muted-foreground">
                      {formatDate(registration.workshopDate)}
                    </div>
                  </TableCell>
                  <TableCell>{formatDate(registration.registeredAt)}</TableCell>
                  <TableCell>
                    <Badge variant={paymentBadgeVariant(registration.paymentStatus)}>
                      {registration.paymentStatus}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">
                    {registration.amountPaidCents === 0
                      ? <span className="text-muted-foreground">Free</span>
                      : formatCurrency(registration.amountPaidCents)}
                  </TableCell>
                  <TableCell>
                    {registration.status !== "CANCELLED" &&
                      registration.status !== "PENDING_REMOVAL" && (
                      <input
                        type="checkbox"
                        checked={registration.attended}
                        onChange={() => handleToggleAttendance(registration)}
                        disabled={togglingAttendanceId === registration.id}
                        className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                        aria-label={`Mark ${registration.firstName} ${registration.lastName} as ${registration.attended ? "not attended" : "attended"}`}
                      />
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {registration.status === "PENDING_REMOVAL" ? (
                      <Badge variant="secondary">Pending Removal</Badge>
                    ) : registration.status !== "CANCELLED" ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleUnregister(registration)}
                        disabled={submittingForId === registration.id}
                      >
                        {submittingForId === registration.id
                          ? "Processing..."
                          : "Unregister"}
                      </Button>
                    ) : (
                      <Badge variant="secondary">Cancelled</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        {/* MR-31: Pagination controls */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-border px-4 py-3">
            <p className="text-sm text-muted-foreground">
              Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filteredSorted.length)} of {filteredSorted.length}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(p - 1, 0))}
                disabled={page === 0}
                className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent disabled:opacity-40"
              >
                Prev
              </button>
              <button
                onClick={() => setPage((p) => Math.min(p + 1, totalPages - 1))}
                disabled={page >= totalPages - 1}
                className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
