"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useCallback } from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

const STATUS_OPTIONS = [
    { value: "", label: "All Statuses" },
    { value: "INFO_REQUESTED", label: "Info Requested" },
    { value: "DENIED", label: "Denied" },
    { value: "AWAITING_APPROVAL", label: "Awaiting Approval" },
    { value: "PRE_EVENT", label: "Pre-Event" },
    { value: "POST_EVENT", label: "Post-Event" },
    { value: "COMPLETED", label: "Completed" },
    { value: "CANCELED", label: "Canceled" },
];

export function AdminWorkshopFilters({ responsiveEnabled = false }: { responsiveEnabled?: boolean }) {
    const router = useRouter();
    const searchParams = useSearchParams();

    const [searchValue, setSearchValue] = useState(searchParams.get("search") || "");
    const currentStatus = searchParams.get("status") || "";

    const updateParams = useCallback(
        (key: string, value: string) => {
            const params = new URLSearchParams(searchParams.toString());
            if (value) {
                params.set(key, value);
            } else {
                params.delete(key);
            }
            router.push(`/workshops?${params.toString()}`);
        },
        [router, searchParams]
    );

    const handleSearchSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        updateParams("search", searchValue.trim());
    };

    const clearAll = () => {
        setSearchValue("");
        router.push("/workshops");
    };

    const hasFilters = searchParams.get("search") || searchParams.get("status");

    return (
        <div className={cn("flex items-center gap-3 flex-wrap", responsiveEnabled && "flex-col items-stretch sm:flex-row sm:items-center")}>
            <form onSubmit={handleSearchSubmit} className={cn("relative flex-1 min-w-[200px] max-w-sm", responsiveEnabled && "min-w-0 max-w-none sm:max-w-sm")}>
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                    type="text"
                    placeholder="Search by title or coach..."
                    value={searchValue}
                    onChange={(e) => setSearchValue(e.target.value)}
                    onBlur={() => updateParams("search", searchValue.trim())}
                    className={cn("w-full pl-10 pr-4 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary", responsiveEnabled && "min-h-11 min-w-0")}
                />
            </form>
            <select
                value={currentStatus}
                onChange={(e) => updateParams("status", e.target.value)}
                aria-label={responsiveEnabled ? "Workshop status" : undefined}
                className={cn("px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary", responsiveEnabled && "min-h-11 min-w-0")}
            >
                {STATUS_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
            </select>
            {hasFilters && (
                <button
                    onClick={clearAll}
                    className={cn("flex items-center gap-1 px-3 py-2 text-sm text-muted-foreground hover:text-foreground", responsiveEnabled && "min-h-11 justify-center")}
                >
                    <X className="w-4 h-4" /> Clear
                </button>
            )}
        </div>
    );
}
