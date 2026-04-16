"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { StatusPill } from "@/components/ui/status-pill";
import { CheckCircle2, Circle } from "lucide-react";
import { CopyUrlButton } from "@/components/ui/copy-url-button";

interface WorkshopItem {
    id: string;
    title: string;
    workshopCode: string | null;
    status: string;
    eventDate: string;
    maxAttendees: number;
    workshopType: { name: string } | null;
    _count: { registrations: number };
    landingPageUrl?: string | null;
    // FIG-007: Pricing display
    isFree?: boolean;
    priceCents?: number | null;
    pricingTier?: { name: string; amountCents: number } | null;
    hasPendingPriceChange?: boolean;
    hasCounterOffer?: boolean;
}

interface PortalWorkshopListProps {
    workshops: WorkshopItem[];
    isAdmin?: boolean;
}

const STATUS_OPTIONS = [
    { value: "", label: "All Statuses" },
    { value: "INFO_REQUESTED", label: "Info Requested" },
    { value: "DENIED", label: "Denied" },
    { value: "REQUESTED", label: "Approval Pending" },
    { value: "AWAITING_APPROVAL", label: "Approval Pending" },
    { value: "PRE_EVENT", label: "Pre-Event" },
    { value: "POST_EVENT", label: "Post-Event" },
    { value: "COMPLETED", label: "Completed" },
    { value: "CANCELED", label: "Canceled" },
];

export function PortalWorkshopList({ workshops, isAdmin = false }: PortalWorkshopListProps) {
    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState("");
    const [showFilters, setShowFilters] = useState(false);

    const filtered = useMemo(() => {
        return workshops.filter((w) => {
            const matchesSearch =
                !search ||
                w.title.toLowerCase().includes(search.toLowerCase()) ||
                (w.workshopType?.name || "").toLowerCase().includes(search.toLowerCase());
            const matchesStatus = !statusFilter || w.status === statusFilter;
            return matchesSearch && matchesStatus;
        });
    }, [workshops, search, statusFilter]);

    const hasActiveFilters = search || statusFilter;

    return (
        <>
            {/* Filters & Search */}
            <div className="flex gap-4 mb-6">
                <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                        type="text"
                        placeholder="Search workshops..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                </div>
                <button
                    onClick={() => setShowFilters(!showFilters)}
                    className={`flex items-center gap-2 px-4 py-2 border rounded-lg text-sm transition-colors ${
                        showFilters || statusFilter
                            ? "border-primary text-primary bg-primary/10"
                            : "border-border text-foreground hover:bg-accent"
                    }`}
                >
                    <SlidersHorizontal className="w-4 h-4" /> Filters
                </button>
                {hasActiveFilters && (
                    <button
                        onClick={() => { setSearch(""); setStatusFilter(""); }}
                        className="flex items-center gap-1 px-3 py-2 text-sm text-muted-foreground hover:text-foreground"
                    >
                        <X className="w-4 h-4" /> Clear
                    </button>
                )}
            </div>

            {/* Filter Panel */}
            {showFilters && (
                <div className="mb-4 p-4 bg-muted rounded-lg border border-border">
                    <div className="flex items-center gap-4">
                        <label className="text-sm font-medium text-foreground">Status:</label>
                        <select
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                            className="px-3 py-1.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                        >
                            {STATUS_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                        </select>
                    </div>
                </div>
            )}

            {/* Results count */}
            {hasActiveFilters && (
                <p className="text-sm text-muted-foreground mb-3">
                    Showing {filtered.length} of {workshops.length} workshops
                </p>
            )}

            <div className="bg-card rounded-xl shadow-sm border border-border overflow-hidden">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="bg-muted border-b border-border">
                            <th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Workshop</th>
                            <th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Date</th>
                            <th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Registrations</th>
                            {isAdmin && (
                              <th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-center">Validated</th>
                            )}
                            <th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-center">Approved</th>
                            <th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Pricing</th>
                            <th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Landing Page</th>
                            <th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                            <th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                        {filtered.length === 0 ? (
                            <tr>
                                <td colSpan={isAdmin ? 9 : 8} className="px-6 py-12 text-center text-muted-foreground">
                                    {hasActiveFilters
                                        ? "No workshops match your search."
                                        : "No workshops found. Request your first one above!"}
                                </td>
                            </tr>
                        ) : (
                            filtered.map((workshop) => {
                                const isValidated = ["AWAITING_APPROVAL", "PRE_EVENT", "POST_EVENT", "COMPLETED"].includes(workshop.status);
                                const isApproved = ["PRE_EVENT", "POST_EVENT", "COMPLETED"].includes(workshop.status);

                                return (
                                    <tr key={workshop.id} className="hover:bg-accent transition-colors">
                                        <td className="px-6 py-4">
                                            <Link
                                                href={`/portal/workshops/${workshop.id}`}
                                                className="font-medium text-primary hover:text-primary/80"
                                            >
                                                {workshop.title}
                                            </Link>
                                            <div className="text-sm text-muted-foreground">
                                                {isAdmin && workshop.workshopCode && <span className="font-mono mr-2">{workshop.workshopCode}</span>}
                                                {workshop.workshopType?.name}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-sm text-muted-foreground">
                                            {new Date(workshop.eventDate).toLocaleDateString("en-US", { timeZone: "UTC" })}
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="font-medium">{workshop._count.registrations}</div>
                                            <div className="text-xs text-muted-foreground">of {workshop.maxAttendees} max</div>
                                        </td>
                                        {isAdmin && (
                                          <td className="px-6 py-4 text-center">
                                            {isValidated ? (
                                                <CheckCircle2 className="w-5 h-5 text-success mx-auto" />
                                            ) : (
                                                <Circle className="w-5 h-5 text-muted-foreground mx-auto" />
                                            )}
                                          </td>
                                        )}
                                        <td className="px-6 py-4 text-center">
                                            {isApproved ? (
                                                <CheckCircle2 className="w-5 h-5 text-success mx-auto" />
                                            ) : (
                                                <Circle className="w-5 h-5 text-muted-foreground mx-auto" />
                                            )}
                                        </td>
                                        {/* FIG-007: Pricing column */}
                                        <td className="px-6 py-4">
                                            <div className="text-sm text-foreground">
                                                {workshop.isFree
                                                    ? "Free"
                                                    : workshop.pricingTier
                                                    ? `${workshop.pricingTier.name} — $${(workshop.pricingTier.amountCents / 100).toFixed(0)}`
                                                    : workshop.priceCents != null && workshop.priceCents > 0
                                                    ? `$${(workshop.priceCents / 100).toFixed(0)}`
                                                    : <span className="text-muted-foreground">Not set</span>}
                                            </div>
                                            {workshop.hasCounterOffer ? (
                                                <div className="mt-1">
                                                    <span className="inline-flex items-center rounded-full bg-warning/15 px-2 py-0.5 text-xs font-medium text-warning border border-warning/30">
                                                        Counter-Offer — Review
                                                    </span>
                                                </div>
                                            ) : workshop.hasPendingPriceChange ? (
                                                <div className="mt-1">
                                                    <span className="inline-flex items-center rounded-full bg-warning/15 px-2 py-0.5 text-xs font-medium text-warning border border-warning/30">
                                                        Price Change Pending
                                                    </span>
                                                </div>
                                            ) : null}
                                        </td>
                                        <td className="px-6 py-4">
                                            {workshop.landingPageUrl ? (
                                                <CopyUrlButton url={workshop.landingPageUrl} />
                                            ) : (
                                                <span className="text-xs text-muted-foreground">Not published</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4">
                                            {workshop.hasCounterOffer ? (
                                                <span className="inline-flex items-center gap-1.5 rounded-full bg-warning/15 px-3 py-1 text-xs font-semibold text-warning border border-warning/30">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-warning animate-pulse" />
                                                    Counter-Offer
                                                </span>
                                            ) : (
                                                <StatusPill status={workshop.status} />
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <Link
                                                href={`/portal/workshops/${workshop.id}`}
                                                className="text-sm font-medium text-primary hover:text-primary/80"
                                            >
                                                Manage
                                            </Link>
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>
        </>
    );
}
