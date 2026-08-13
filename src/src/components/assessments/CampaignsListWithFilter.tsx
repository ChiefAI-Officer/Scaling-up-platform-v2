"use client";

/**
 * Assessment v7.6 — Coach campaigns landing list grouped by company (Task 5.3 / Slice 5).
 *
 * Server component fetches the full campaign list with pre-computed metrics;
 * this client wrapper renders:
 *  - Global status filter pills (All / Draft / Active / Closed) with global counts.
 *  - One section per company (Organization), alphabetically ordered.
 *    Each section has a company header + per-campaign rows with staged-progress metrics.
 *  - Companies with zero campaigns after filtering are hidden entirely.
 *
 * URL state is intentionally NOT persisted — keep it simple.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { CampaignStatusMetrics } from "@/components/assessments/CampaignStatusMetrics";
import type { CampaignStatusMetrics as CampaignStatusMetricsType } from "@/lib/assessments/campaign-status-metrics";

export type CampaignStatus = "DRAFT" | "ACTIVE" | "CLOSED";

export interface CampaignListEdition {
  versionNumber: number;
  newerEditionAvailable: boolean;
  pinnedRetired: boolean;
}

export interface CampaignListItem {
  id: string;
  name: string;
  alias: string;
  status: CampaignStatus | string;
  templateName: string;
  organizationId: string;
  organizationName: string;
  openAt: string; // ISO date so server -> client serializes safely
  metrics: CampaignStatusMetricsType;
  edition: CampaignListEdition | null;
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

// A company section — campaigns filtered by the active pill
interface CompanySectionProps {
  organizationName: string;
  campaigns: CampaignListItem[];
  /** Base path for a campaign's detail link. Default: the coach portal. */
  detailBasePath: string;
  responsiveEnabled: boolean;
}

function CompanySection({
  organizationName,
  campaigns,
  detailBasePath,
  responsiveEnabled,
}: CompanySectionProps) {
  const count = campaigns.length;
  return (
    <section className="space-y-2">
      {/* Company header */}
      <h2 className={responsiveEnabled ? "text-sm font-semibold text-foreground flex min-w-0 flex-wrap items-center gap-2" : "text-sm font-semibold text-foreground flex items-center gap-2"}>
        <span className={responsiveEnabled ? "min-w-0 break-words" : undefined}>{organizationName}</span>
        <span className="text-muted-foreground font-normal">
          &middot; {count} {count === 1 ? "campaign" : "campaigns"}
        </span>
      </h2>

      {/* Campaign rows */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="divide-y divide-border">
          {campaigns.map((c) => {
            const isDraftNoInvites = c.status === "DRAFT" && c.metrics.total === 0;
            const canShowEditionWarning =
              c.status === "DRAFT" || c.status === "ACTIVE";
            return (
              <div
                key={c.id}
                className={responsiveEnabled ? "min-w-0 px-4 py-3 space-y-2 hover:bg-muted/30 transition-colors" : "px-4 py-3 space-y-2 hover:bg-muted/30 transition-colors"}
                data-testid={`campaign-row-${c.id}`}
              >
                {/* Top row: name + template + status + date + action */}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                  <div className="min-w-0 basis-full sm:flex-1">
                    <Link
                      href={`${detailBasePath}/${c.id}`}
                      className={responsiveEnabled ? "inline-flex min-h-11 min-w-11 items-center min-w-0 break-words font-medium text-foreground hover:text-primary text-sm" : "font-medium text-foreground hover:text-primary text-sm"}
                      {...(responsiveEnabled ? { "data-touch-target": true } : {})}
                    >
                      {c.name}
                    </Link>
                    <div className={responsiveEnabled ? "break-all text-xs text-muted-foreground" : "text-xs text-muted-foreground"}>{c.alias}</div>
                  </div>
                  <span
                    className="min-w-0 max-w-full text-xs text-muted-foreground break-words"
                    data-testid={`campaign-edition-identity-${c.id}`}
                  >
                    {c.templateName}
                    {c.edition ? (
                      <>
                        <span aria-hidden="true"> &middot; </span>
                        <span className="whitespace-nowrap tabular-nums">
                          Edition {c.edition.versionNumber}
                        </span>
                      </>
                    ) : null}
                  </span>
                  {canShowEditionWarning && c.edition?.pinnedRetired ? (
                    <span
                      className="inline-flex items-center rounded-md border border-destructive bg-destructive/10 px-1.5 py-0.5 text-xs font-semibold text-destructive"
                      data-testid={`campaign-edition-retired-${c.id}`}
                    >
                      Retired
                    </span>
                  ) : canShowEditionWarning && c.edition?.newerEditionAvailable ? (
                    <span
                      className="inline-flex items-center rounded-md border border-warning/30 bg-warning/10 px-1.5 py-0.5 text-xs font-semibold text-warning"
                      data-testid={`campaign-edition-stale-${c.id}`}
                    >
                      Not latest
                    </span>
                  ) : null}
                  <span
                    className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded border ${
                      STATUS_TONE[c.status] ?? "bg-muted text-muted-foreground border-border"
                    }`}
                  >
                    {STATUS_LABELS[c.status] ?? c.status}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Opens {formatDate(c.openAt)}
                  </span>
                  <Link
                    href={`${detailBasePath}/${c.id}`}
                    className={responsiveEnabled ? "ml-auto inline-flex min-h-11 items-center text-xs text-primary hover:underline" : "text-xs text-primary hover:underline ml-auto"}
                    {...(responsiveEnabled ? { "data-touch-target": true } : {})}
                  >
                    View
                  </Link>
                </div>

                {/* Metrics row */}
                <CampaignStatusMetrics
                  metrics={c.metrics}
                  emptyHint={
                    isDraftNoInvites
                      ? "No invitations yet — activate the campaign to send."
                      : undefined
                  }
                  compact
                  testIdPrefix={`campaign-metrics-${c.id}`}
                />
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export function CampaignsListWithFilter({
  campaigns,
  detailBasePath = "/portal/assessments",
  responsiveEnabled = false,
}: {
  campaigns: CampaignListItem[];
  /** Base path for each campaign's detail link. Default: coach portal.
   *  The admin oversight page passes "/admin/assessments/campaigns". */
  detailBasePath?: string;
  responsiveEnabled?: boolean;
}) {
  const [filter, setFilter] = useState<FilterValue>("ALL");

  // Global counts across all companies
  const counts = useMemo(() => {
    const acc = { ALL: campaigns.length, DRAFT: 0, ACTIVE: 0, CLOSED: 0 };
    for (const c of campaigns) {
      if (c.status === "DRAFT") acc.DRAFT += 1;
      else if (c.status === "ACTIVE") acc.ACTIVE += 1;
      else if (c.status === "CLOSED") acc.CLOSED += 1;
    }
    return acc;
  }, [campaigns]);

  // Build company groups from the full (unfiltered) campaign list, then apply filter per section
  const companyGroups = useMemo(() => {
    // Group all campaigns by organizationId, preserving server order within each group
    const groupMap = new Map<string, { name: string; campaigns: CampaignListItem[] }>();
    for (const c of campaigns) {
      if (!groupMap.has(c.organizationId)) {
        groupMap.set(c.organizationId, { name: c.organizationName, campaigns: [] });
      }
      groupMap.get(c.organizationId)!.campaigns.push(c);
    }

    // Sort companies alphabetically by name
    const groups = Array.from(groupMap.entries()).sort(([, a], [, b]) =>
      a.name.localeCompare(b.name)
    );

    // Apply the active filter within each company
    return groups.map(([orgId, group]) => ({
      orgId,
      name: group.name,
      campaigns:
        filter === "ALL"
          ? group.campaigns
          : group.campaigns.filter((c) => c.status === filter),
    }));
  }, [campaigns, filter]);

  // Only companies with at least one visible campaign
  const visibleGroups = useMemo(
    () => companyGroups.filter((g) => g.campaigns.length > 0),
    [companyGroups]
  );

  const pills: Array<{ value: FilterValue; label: string; count: number }> = [
    { value: "ALL", label: "All", count: counts.ALL },
    { value: "DRAFT", label: "Draft", count: counts.DRAFT },
    { value: "ACTIVE", label: "Active", count: counts.ACTIVE },
    { value: "CLOSED", label: "Closed", count: counts.CLOSED },
  ];

  return (
    <div className="space-y-4">
      {/* Status filter pills */}
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
              {...(responsiveEnabled ? { "data-touch-target": true } : {})}
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

      {/* Company sections */}
      {visibleGroups.length === 0 ? (
        <div
          className="px-4 py-12 text-center text-sm text-muted-foreground bg-card border border-border rounded-xl"
          data-testid="campaign-filter-empty"
        >
          No campaigns in this status.
        </div>
      ) : (
        <div className="space-y-6">
          {visibleGroups.map((group) => (
            <CompanySection
              key={group.orgId}
              organizationName={group.name}
              campaigns={group.campaigns}
              detailBasePath={detailBasePath}
              responsiveEnabled={responsiveEnabled}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default CampaignsListWithFilter;
