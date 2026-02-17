"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import type { Workshop } from "@prisma/client";

// JV-02: Jeff Verdun's 6 workshop stages
type WorkshopStatus =
  | "REQUESTED"
  | "AWAITING_APPROVAL"
  | "PRE_EVENT"
  | "POST_EVENT"
  | "COMPLETED"
  | "CANCELED";

interface WorkshopActionsProps {
  workshop: Workshop;
}

const statusTransitions: Record<WorkshopStatus, WorkshopStatus[]> = {
  REQUESTED: ["AWAITING_APPROVAL", "CANCELED"],
  AWAITING_APPROVAL: ["PRE_EVENT", "REQUESTED", "CANCELED"],
  PRE_EVENT: ["POST_EVENT", "CANCELED"],
  POST_EVENT: ["COMPLETED"],
  COMPLETED: [],
  CANCELED: ["REQUESTED"],
};

const statusLabels: Record<WorkshopStatus, string> = {
  REQUESTED: "Requested",
  AWAITING_APPROVAL: "Awaiting Approval",
  PRE_EVENT: "Pre-Event",
  POST_EVENT: "Post-Event",
  COMPLETED: "Completed",
  CANCELED: "Canceled",
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
          variant={status === "CANCELED" ? "destructive" : "outline"}
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
