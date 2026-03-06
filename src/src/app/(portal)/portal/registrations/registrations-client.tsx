"use client";

import { useMemo, useState } from "react";
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
  status: string;
  attended: boolean;
  registeredAt: string;
}

interface RegistrationsClientProps {
  registrations: CoachRegistrationView[];
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

export function RegistrationsClient({ registrations: initialRegistrations }: RegistrationsClientProps) {
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
  const [sortField, setSortField] = useState<"attendee" | "registeredAt" | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  function toggleSort(field: "attendee" | "registeredAt") {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
    setPage(0);
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

    if (sortField) {
      result = [...result].sort((a, b) => {
        let cmp = 0;
        if (sortField === "attendee") {
          cmp = `${a.lastName}${a.firstName}`.localeCompare(`${b.lastName}${b.firstName}`);
        } else {
          cmp = new Date(a.registeredAt).getTime() - new Date(b.registeredAt).getTime();
        }
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
    const confirmed = window.confirm(
      `Unregister ${registration.firstName} ${registration.lastName}? ${registration.paymentStatus === "COMPLETED" ? "A refund will be issued automatically." : "This cannot be undone."}`
    );

    if (!confirmed) {
      return;
    }

    setFeedback(null);
    setSubmittingForId(registration.id);

    try {
      const response = await fetch(
        `/api/registrations/${registration.id}`,
        { method: "DELETE" }
      );

      const result = (await response.json()) as {
        success?: boolean;
        message?: string;
        error?: string;
      };

      if (!response.ok || !result.success) {
        throw new Error(result.error || "Failed to unregister attendee");
      }

      setRegistrations((prev) =>
        prev.map((r) =>
          r.id === registration.id
            ? { ...r, status: "CANCELLED", paymentStatus: r.paymentStatus === "COMPLETED" ? "REFUNDED" : r.paymentStatus }
            : r
        )
      );

      setFeedback({
        type: "success",
        message: result.message || "Attendee unregistered successfully.",
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
                Attendee {sortField === "attendee" ? (sortDir === "asc" ? "↑" : "↓") : ""}
              </TableHead>
              <TableHead>Workshop</TableHead>
              <TableHead
                className="cursor-pointer select-none hover:text-foreground"
                onClick={() => toggleSort("registeredAt")}
              >
                Registered {sortField === "registeredAt" ? (sortDir === "asc" ? "↑" : "↓") : ""}
              </TableHead>
              <TableHead>Payment</TableHead>
              <TableHead>Attended</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredRegistrations.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
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
                    <div className="font-medium text-foreground">
                      {registration.workshopTitle}
                    </div>
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
                  <TableCell>
                    {registration.status !== "CANCELLED" && (
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
                    {registration.status !== "CANCELLED" ? (
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
