"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import type { Workshop } from "@prisma/client";
import { DeleteWorkshopDialog } from "@/components/workshops/delete-workshop-dialog";

// JV-02: Jeff Verdun's 6 workshop stages
type WorkshopStatus =
  | "INFO_REQUESTED"
  | "AWAITING_APPROVAL"
  | "PRE_EVENT"
  | "POST_EVENT"
  | "COMPLETED"
  | "DENIED"
  | "CANCELED";

interface WorkshopActionsProps {
  workshop: Workshop;
  userRole?: string;
}

// Sprint 5: Status transitions are now automated via auto-build on approval.
// Only manual cancel and re-request remain as admin overrides.
const statusTransitions: Record<WorkshopStatus, WorkshopStatus[]> = {
  INFO_REQUESTED: ["CANCELED"],
  AWAITING_APPROVAL: ["CANCELED"],
  PRE_EVENT: ["POST_EVENT", "CANCELED"],
  POST_EVENT: ["COMPLETED"],
  COMPLETED: [],
  DENIED: ["CANCELED"],
  CANCELED: ["INFO_REQUESTED"],
};

const statusLabels: Record<WorkshopStatus, string> = {
  INFO_REQUESTED: "Info Requested",
  AWAITING_APPROVAL: "Awaiting Approval",
  PRE_EVENT: "Pre-Event",
  POST_EVENT: "Post-Event",
  COMPLETED: "Completed",
  DENIED: "Denied",
  CANCELED: "Canceled",
};

export function WorkshopActions({ workshop, userRole }: WorkshopActionsProps) {
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

  const canDelete =
    userRole === "ADMIN" &&
    ["CANCELED", "COMPLETED"].includes(currentStatus);

  if (availableTransitions.length === 0 && !canDelete) {
    return null;
  }

  return (
    <div className="flex gap-2">
      {availableTransitions.map((status) => (
        <Button
          key={status}
          variant={status === "CANCELED" ? "destructive" : "outline"}
          size="sm"
          onClick={() => handleStatusChange(status)}
          disabled={loading}
        >
          {loading ? "..." : `Move to ${statusLabels[status]}`}
        </Button>
      ))}
      {canDelete && (
        <DeleteWorkshopDialog
          workshopId={workshop.id}
          workshopTitle={workshop.title}
        />
      )}
    </div>
  );
}
