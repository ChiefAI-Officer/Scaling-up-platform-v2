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

export function RegistrationsClient({ registrations }: RegistrationsClientProps) {
  const [selectedWorkshopId, setSelectedWorkshopId] = useState("all");
  const [submittingForId, setSubmittingForId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

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

  const filteredRegistrations = useMemo(() => {
    if (selectedWorkshopId === "all") {
      return registrations;
    }

    return registrations.filter(
      (registration) => registration.workshopId === selectedWorkshopId
    );
  }, [registrations, selectedWorkshopId]);

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
      "Registered At",
    ];

    const rows = filteredRegistrations.map((registration) => [
      registration.workshopTitle,
      formatDate(registration.workshopDate),
      registration.firstName,
      registration.lastName,
      registration.email,
      registration.company || "",
      registration.paymentStatus,
      registration.status,
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

  const requestRemoval = async (registration: CoachRegistrationView) => {
    const confirmed = window.confirm(
      `Request removal for ${registration.firstName} ${registration.lastName}? This creates an approval request for admin review.`
    );

    if (!confirmed) {
      return;
    }

    setFeedback(null);
    setSubmittingForId(registration.id);

    try {
      const response = await fetch(
        `/api/registrations/${registration.id}/removal-request`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({}),
        }
      );

      const result = (await response.json()) as {
        success?: boolean;
        message?: string;
        error?: string;
      };

      if (!response.ok || !result.success) {
        throw new Error(result.error || "Failed to submit removal request");
      }

      setFeedback({
        type: "success",
        message:
          result.message ||
          "Removal request submitted. Admin approval is required.",
      });
    } catch (error) {
      setFeedback({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "Failed to submit removal request",
      });
    } finally {
      setSubmittingForId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Registrations</h1>
          <p className="text-sm text-gray-500">
            View and export attendee data for your workshops.
          </p>
        </div>
        <Button
          onClick={exportCsv}
          disabled={filteredRegistrations.length === 0}
          className="sm:w-auto"
        >
          Export CSV
        </Button>
      </div>

      {feedback && (
        <div
          className={`rounded-md border px-4 py-3 text-sm ${
            feedback.type === "success"
              ? "border-green-200 bg-green-50 text-green-700"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {feedback.message}
        </div>
      )}

      <div className="flex flex-col gap-2 sm:max-w-sm">
        <label
          htmlFor="workshopFilter"
          className="text-sm font-medium text-gray-700"
        >
          Filter by workshop
        </label>
        <select
          id="workshopFilter"
          value={selectedWorkshopId}
          onChange={(event) => setSelectedWorkshopId(event.target.value)}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">All workshops</option>
          {workshops.map((workshop) => (
            <option key={workshop.id} value={workshop.id}>
              {workshop.title}
            </option>
          ))}
        </select>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Attendee</TableHead>
              <TableHead>Workshop</TableHead>
              <TableHead>Registered</TableHead>
              <TableHead>Payment</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredRegistrations.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-gray-500">
                  No registrations found for this filter.
                </TableCell>
              </TableRow>
            ) : (
              filteredRegistrations.map((registration) => (
                <TableRow key={registration.id}>
                  <TableCell>
                    <div className="font-medium text-gray-900">
                      {registration.firstName} {registration.lastName}
                    </div>
                    <div className="text-sm text-gray-500">{registration.email}</div>
                    {registration.company && (
                      <div className="text-sm text-gray-500">{registration.company}</div>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="font-medium text-gray-900">
                      {registration.workshopTitle}
                    </div>
                    <div className="text-sm text-gray-500">
                      {formatDate(registration.workshopDate)}
                    </div>
                  </TableCell>
                  <TableCell>{formatDate(registration.registeredAt)}</TableCell>
                  <TableCell>
                    <Badge variant={paymentBadgeVariant(registration.paymentStatus)}>
                      {registration.paymentStatus}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => requestRemoval(registration)}
                      disabled={submittingForId === registration.id}
                    >
                      {submittingForId === registration.id
                        ? "Submitting..."
                        : "Request Removal"}
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
