"use client";

import React from "react";
import { cn } from "@/lib/utils";

// JV-02: Jeff Verdun's 6 workshop stages
type WorkshopStatus =
    | "REQUESTED"
    | "AWAITING_APPROVAL"
    | "PRE_EVENT"
    | "POST_EVENT"
    | "COMPLETED"
    | "CANCELED";

interface StatusPillProps {
    status: string;
    className?: string;
    showDot?: boolean;
}

const STATUS_CONFIG: Record<WorkshopStatus, { label: string; color: string; dotColor: string; animate?: boolean }> = {
    REQUESTED: {
        label: "Requested",
        color: "bg-amber-50 text-amber-700 border-amber-200",
        dotColor: "bg-amber-400",
        animate: true,
    },
    AWAITING_APPROVAL: {
        label: "Awaiting Approval",
        color: "bg-blue-50 text-blue-700 border-blue-200",
        dotColor: "bg-blue-400",
        animate: true,
    },
    PRE_EVENT: {
        label: "Pre-Event",
        color: "bg-emerald-50 text-emerald-700 border-emerald-200",
        dotColor: "bg-emerald-500",
        animate: true,
    },
    POST_EVENT: {
        label: "Post-Event",
        color: "bg-purple-50 text-purple-700 border-purple-200",
        dotColor: "bg-purple-500",
    },
    COMPLETED: {
        label: "Completed",
        color: "bg-slate-100 text-slate-600 border-slate-200",
        dotColor: "bg-slate-400",
    },
    CANCELED: {
        label: "Canceled",
        color: "bg-red-50 text-red-700 border-red-200",
        dotColor: "bg-red-500",
    },
};

const DEFAULT_CONFIG = {
    label: "Unknown",
    color: "bg-gray-100 text-gray-700 border-gray-200",
    dotColor: "bg-gray-400",
};

export function StatusPill({ status, className, showDot = true }: StatusPillProps) {
    const normalizedStatus = status.toUpperCase() as WorkshopStatus;
    const config = STATUS_CONFIG[normalizedStatus] || DEFAULT_CONFIG;

    return (
        <span
            className={cn(
                "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border",
                config.color,
                className
            )}
        >
            {showDot && (
                <span className={cn(
                    "w-1.5 h-1.5 rounded-full",
                    config.dotColor,
                    (config as { animate?: boolean }).animate && "animate-pulse"
                )} />
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
