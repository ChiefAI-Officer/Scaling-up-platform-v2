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
        color: "bg-status-requested/10 text-status-requested border-status-requested/20",
        dotColor: "bg-status-requested",
        animate: true,
    },
    AWAITING_APPROVAL: {
        label: "Awaiting Approval",
        color: "bg-status-awaiting/10 text-status-awaiting border-status-awaiting/20",
        dotColor: "bg-status-awaiting",
        animate: true,
    },
    PRE_EVENT: {
        label: "Pre-Event",
        color: "bg-status-active/10 text-status-active border-status-active/20",
        dotColor: "bg-status-active",
        animate: true,
    },
    POST_EVENT: {
        label: "Post-Event",
        color: "bg-status-post/10 text-status-post border-status-post/20",
        dotColor: "bg-status-post",
    },
    COMPLETED: {
        label: "Completed",
        color: "bg-muted text-status-completed border-border",
        dotColor: "bg-status-completed",
    },
    CANCELED: {
        label: "Canceled",
        color: "bg-status-canceled/10 text-status-canceled border-status-canceled/20",
        dotColor: "bg-status-canceled",
    },
};

const DEFAULT_CONFIG = {
    label: "Unknown",
    color: "bg-muted text-foreground border-border",
    dotColor: "bg-muted-foreground",
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
