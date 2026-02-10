"use client";

import React from "react";
import { cn } from "@/lib/utils";

type WorkshopStatus =
    | "DRAFT"
    | "REQUESTED"
    | "VALIDATING"
    | "APPROVED"
    | "SCHEDULED"
    | "LIVE"
    | "COMPLETED"
    | "CANCELLED";

interface StatusPillProps {
    status: string;
    className?: string;
    showDot?: boolean;
}

const STATUS_CONFIG: Record<WorkshopStatus, { label: string; color: string; dotColor: string }> = {
    DRAFT: {
        label: "Draft",
        color: "bg-gray-100 text-gray-700 border-gray-200",
        dotColor: "bg-gray-400",
    },
    REQUESTED: {
        label: "Pending Review",
        color: "bg-amber-50 text-amber-700 border-amber-200",
        dotColor: "bg-amber-400",
    },
    VALIDATING: {
        label: "In Review",
        color: "bg-blue-50 text-blue-700 border-blue-200",
        dotColor: "bg-blue-400",
    },
    APPROVED: {
        label: "Approved",
        color: "bg-green-50 text-green-700 border-green-200",
        dotColor: "bg-green-500",
    },
    SCHEDULED: {
        label: "Scheduled",
        color: "bg-indigo-50 text-indigo-700 border-indigo-200",
        dotColor: "bg-indigo-500",
    },
    LIVE: {
        label: "Live",
        color: "bg-emerald-50 text-emerald-700 border-emerald-200",
        dotColor: "bg-emerald-500",
    },
    COMPLETED: {
        label: "Completed",
        color: "bg-gray-100 text-gray-600 border-gray-200",
        dotColor: "bg-gray-400",
    },
    CANCELLED: {
        label: "Cancelled",
        color: "bg-red-50 text-red-700 border-red-200",
        dotColor: "bg-red-500",
    },
};

export function StatusPill({ status, className, showDot = true }: StatusPillProps) {
    const normalizedStatus = status.toUpperCase() as WorkshopStatus;
    const config = STATUS_CONFIG[normalizedStatus] || STATUS_CONFIG.DRAFT;

    return (
        <span
            className={cn(
                "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border",
                config.color,
                className
            )}
        >
            {showDot && (
                <span className={cn("w-1.5 h-1.5 rounded-full", config.dotColor)} />
            )}
            {config.label}
        </span>
    );
}

// Export status options for use in filters/selects
export const WORKSHOP_STATUSES = Object.entries(STATUS_CONFIG).map(([value, config]) => ({
    value,
    label: config.label,
}));
