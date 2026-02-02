"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import type { Workshop } from "@prisma/client";

// Workshop status type (using strings since SQLite doesn't support enums)
type WorkshopStatus =
  | "REQUESTED"
  | "VALIDATING"
  | "APPROVED"
  | "SETUP_IN_PROGRESS"
  | "MARKETING_ACTIVE"
  | "REGISTRATION_OPEN"
  | "REGISTRATION_CLOSED"
  | "COMPLETED"
  | "CANCELLED";

interface WorkshopActionsProps {
  workshop: Workshop;
}

const statusTransitions: Record<WorkshopStatus, WorkshopStatus[]> = {
  REQUESTED: ["VALIDATING", "CANCELLED"],
  VALIDATING: ["APPROVED", "REQUESTED", "CANCELLED"],
  APPROVED: ["SETUP_IN_PROGRESS", "CANCELLED"],
  SETUP_IN_PROGRESS: ["MARKETING_ACTIVE", "APPROVED", "CANCELLED"],
  MARKETING_ACTIVE: ["REGISTRATION_OPEN", "SETUP_IN_PROGRESS", "CANCELLED"],
  REGISTRATION_OPEN: ["REGISTRATION_CLOSED", "MARKETING_ACTIVE", "CANCELLED"],
  REGISTRATION_CLOSED: ["COMPLETED", "REGISTRATION_OPEN", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: ["REQUESTED"],
};

const statusLabels: Record<WorkshopStatus, string> = {
  REQUESTED: "Requested",
  VALIDATING: "Validating",
  APPROVED: "Approved",
  SETUP_IN_PROGRESS: "Setup in Progress",
  MARKETING_ACTIVE: "Marketing Active",
  REGISTRATION_OPEN: "Registration Open",
  REGISTRATION_CLOSED: "Registration Closed",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

export function WorkshopActions({ workshop }: WorkshopActionsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const currentStatus = workshop.status as WorkshopStatus;
  const availableTransitions = statusTransitions[currentStatus] || [];

  const handleStatusChange = async (newStatus: WorkshopStatus) => {
    if (loading) return;

    const confirmed = window.confirm(
      `Are you sure you want to change the status to "${statusLabels[newStatus]}"?`
    );
    if (!confirmed) return;

    setLoading(true);

    try {
      const response = await fetch(`/api/workshops/${workshop.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || "Failed to update status");
      }

      router.refresh();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  if (availableTransitions.length === 0) {
    return null;
  }

  return (
    <div className="flex gap-2">
      {availableTransitions.map((status) => (
        <Button
          key={status}
          variant={status === "CANCELLED" ? "destructive" : "outline"}
          size="sm"
          onClick={() => handleStatusChange(status)}
          disabled={loading}
        >
          {loading ? "..." : `Move to ${statusLabels[status]}`}
        </Button>
      ))}
    </div>
  );
}
