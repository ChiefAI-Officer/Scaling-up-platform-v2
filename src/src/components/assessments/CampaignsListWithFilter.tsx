"use client";

/**
 * Assessment v7.6 — Coach campaigns landing list with status filter pills (Task I).
 *
 * Server component fetches the full campaign list; this client wrapper
 * renders the filter pills + the table and handles client-side filtering.
 * URL state is intentionally NOT persisted in this slice — keep it simple.
 */

import { useMemo, useState } from "react";
import Link from "next/link";

export type CampaignStatus = "DRAFT" | "ACTIVE" | "CLOSED";

export interface CampaignListItem {
  id: string;
  name: string;
  alias: string;
  status: CampaignStatus | string;
  templateName: string;
  organizationName: string;
  openAt: string; // ISO date so server -> client serializes safely
}

type FilterValue = "ALL" | CampaignStatus;

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  ACTIVE: "Active",
  CLOSED: "Closed",
};

const STATUS_TONE: Record<string, string> = {
  DRAFT: "bg-muted text-muted-foreground border-border",
  ACTIVE: "bg-success/10 text-success border-success/20",
  CLOSED: "bg-secondary/10 text-secondary-foreground border-border",
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function CampaignsListWithFilter({
  campaigns,
}: {
  campaigns: CampaignListItem[];
}) {
  const [filter, setFilter] = useState<FilterValue>("ALL");

  const counts = useMemo(() => {
    const acc = { ALL: campaigns.length, DRAFT: 0, ACTIVE: 0, CLOSED: 0 };
    for (const c of campaigns) {
      if (c.status === "DRAFT") acc.DRAFT += 1;
      else if (c.status === "ACTIVE") acc.ACTIVE += 1;
      else if (c.status === "CLOSED") acc.CLOSED += 1;
    }
    return acc;
  }, [campaigns]);

  const visible = useMemo(() => {
    if (filter === "ALL") return campaigns;
    return campaigns.filter((c) => c.status === filter);
  }, [campaigns, filter]);

  const pills: Array<{ value: FilterValue; label: string; count: number }> = [
    { value: "ALL", label: "All", count: counts.ALL },
    { value: "DRAFT", label: "Draft", count: counts.DRAFT },
    { value: "ACTIVE", label: "Active", count: counts.ACTIVE },
    { value: "CLOSED", label: "Closed", count: counts.CLOSED },
  ];

  return (
    <div className="space-y-4">
      <div
        className="flex flex-wrap items-center gap-2"
        role="group"
        aria-label="Filter campaigns by status"
        data-testid="campaign-status-filter"
      >
        {pills.map((p) => {
          const selected = filter === p.value;
          return (
            <button
              key={p.value}
              type="button"
              onClick={() => setFilter(p.value)}
              aria-pressed={selected}
              className={
                selected
                  ? "inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full bg-primary text-primary-foreground"
                  : "inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full bg-muted text-muted-foreground hover:bg-muted/80"
              }
              data-testid={`campaign-filter-pill-${p.value.toLowerCase()}`}
            >
              {p.label}
              <span
                className={
                  selected
                    ? "inline-flex items-center justify-center min-w-[1.25rem] px-1 rounded-full bg-primary-foreground/20 tabular-nums"
                    : "inline-flex items-center justify-center min-w-[1.25rem] px-1 rounded-full bg-background/60 tabular-nums"
                }
                data-testid={`campaign-filter-count-${p.value.toLowerCase()}`}
              >
                {p.count}
              </span>
            </button>
          );
        })}
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <table className="w-full">
          <thead className="bg-muted/50 border-b border-border">
            <tr>
              <th className="text-left px-4 py-3 text-sm font-semibold text-foreground">
                Name
              </th>
              <th className="text-left px-4 py-3 text-sm font-semibold text-foreground">
                Template
              </th>
              <th className="text-left px-4 py-3 text-sm font-semibold text-foreground">
                Organization
              </th>
              <th className="text-left px-4 py-3 text-sm font-semibold text-foreground">
                Status
              </th>
              <th className="text-left px-4 py-3 text-sm font-semibold text-foreground">
                Opens
              </th>
              <th className="text-right px-4 py-3 text-sm font-semibold text-foreground">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {visible.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-12 text-center text-sm text-muted-foreground"
                  data-testid="campaign-filter-empty"
                >
                  No campaigns in this status.
                </td>
              </tr>
            ) : (
              visible.map((c) => (
                <tr
                  key={c.id}
                  className="hover:bg-muted/30 transition-colors"
                  data-testid={`campaign-row-${c.id}`}
                >
                  <td className="px-4 py-3 text-sm">
                    <Link
                      href={`/portal/assessments/${c.id}`}
                      className="font-medium text-foreground hover:text-primary"
                    >
                      {c.name}
                    </Link>
                    <div className="text-xs text-muted-foreground">
                      {c.alias}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    {c.templateName}
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    {c.organizationName}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <span
                      className={`inline-flex items-center text-xs font-medium px-2 py-1 rounded border ${
                        STATUS_TONE[c.status] ??
                        "bg-muted text-muted-foreground border-border"
                      }`}
                    >
                      {STATUS_LABELS[c.status] ?? c.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    {formatDate(c.openAt)}
                  </td>
                  <td className="px-4 py-3 text-sm text-right">
                    <Link
                      href={`/portal/assessments/${c.id}`}
                      className="text-primary hover:underline"
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default CampaignsListWithFilter;
