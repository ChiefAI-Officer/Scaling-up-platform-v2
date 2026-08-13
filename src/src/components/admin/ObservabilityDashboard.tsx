"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { ResponsiveDataView } from "@/components/ui/responsive-data-view";
import {
  ResponsiveRecord,
  ResponsiveRecordMeta,
} from "@/components/ui/responsive-record";

interface DashboardData {
  coaches: { active: number; pending: number; deactivated: number };
  orgs: { total: number; withCampaigns: number };
  templates: { total: number; publishedVersions: number; draftVersions: number };
  campaigns: {
    draft: number;
    active: number;
    closed: number;
    invited: number;
    public: number;
  };
  submissions: {
    total: number;
    last24h: number;
    last7d: number;
    public: number;
    invited: number;
  };
  auditLog: {
    last24h: number;
    byAction: Record<string, number>;
  };
  // Wave F #22 (R3-M1) — group report (bulk-PII surface) DB-derived counters.
  // Optional for back-compat with an older route response.
  groupReports?: {
    views24h: number;
    views7d: number;
  };
  timestamp: string;
}

export function ObservabilityDashboard({
  responsiveEnabled = false,
}: {
  responsiveEnabled?: boolean;
} = {}) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/observability");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as { success: boolean; data: DashboardData };
      setData(body.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading && !data) {
    return (
      <div className="px-6 py-12 text-center text-sm text-muted-foreground">
        Loading metrics…
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="px-6 py-12 text-center text-sm text-destructive">
        {error || "Failed to load"}
      </div>
    );
  }

  const generatedAt = new Date(data.timestamp);

  return (
    <div className={responsiveEnabled ? "min-w-0 space-y-6" : "space-y-6"}>
      <div className={responsiveEnabled ? "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between" : "flex items-center justify-between"}>
        <p className="text-xs text-muted-foreground">
          Generated {generatedAt.toLocaleString()}
        </p>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className={responsiveEnabled ? "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-md border border-border bg-card px-3 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-50" : "inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-md border border-border bg-card text-foreground hover:bg-muted disabled:opacity-50"}
          data-testid="refresh-observability"
        >
          <RefreshCw
            className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`}
          />
          Refresh
        </button>
      </div>

      <Section title="Coaches" responsiveEnabled={responsiveEnabled}>
        <Stat label="Active" value={data.coaches.active} />
        <Stat label="Pending" value={data.coaches.pending} />
        <Stat label="Deactivated" value={data.coaches.deactivated} />
      </Section>

      <Section title="Organizations" responsiveEnabled={responsiveEnabled}>
        <Stat label="Total" value={data.orgs.total} />
        <Stat label="With campaigns" value={data.orgs.withCampaigns} />
      </Section>

      <Section title="Assessment templates" responsiveEnabled={responsiveEnabled}>
        <Stat label="Templates" value={data.templates.total} />
        <Stat label="Published versions" value={data.templates.publishedVersions} />
        <Stat label="Draft versions" value={data.templates.draftVersions} />
      </Section>

      <Section title="Campaigns" responsiveEnabled={responsiveEnabled}>
        <Stat label="Draft" value={data.campaigns.draft} />
        <Stat label="Active" value={data.campaigns.active} />
        <Stat label="Closed" value={data.campaigns.closed} />
        <Stat label="Invited" value={data.campaigns.invited} />
        <Stat label="Public" value={data.campaigns.public} />
      </Section>

      <Section title="Submissions" responsiveEnabled={responsiveEnabled}>
        <Stat label="Total" value={data.submissions.total} />
        <Stat label="Last 24h" value={data.submissions.last24h} />
        <Stat label="Last 7 days" value={data.submissions.last7d} />
        <Stat label="Invited (org)" value={data.submissions.invited} />
        <Stat label="Public" value={data.submissions.public} />
      </Section>

      {data.groupReports && (
        <Section title="Group reports" responsiveEnabled={responsiveEnabled}>
          <Stat label="Views 24h" value={data.groupReports.views24h} />
          <Stat label="Views 7d" value={data.groupReports.views7d} />
        </Section>
      )}

      <Section title="Audit log (last 24h)" responsiveEnabled={responsiveEnabled}>
        <Stat label="Total" value={data.auditLog.last24h} />
      </Section>

      {Object.keys(data.auditLog.byAction).length > 0 && (
        <ResponsiveDataView
          enabled={responsiveEnabled}
          label="Audit log by action"
          wideFrom="md"
          wideRegionLabel="Audit log by action table"
          compact={
            <div className="space-y-3">
              {Object.entries(data.auditLog.byAction)
                .sort((a, b) => b[1] - a[1])
                .map(([action, count]) => (
                  <ResponsiveRecord key={action} aria-label={action}>
                    <ResponsiveRecordMeta items={[
                      { label: "Action", value: <span className="font-mono">{action}</span> },
                      { label: "Count", value: count },
                    ]} />
                  </ResponsiveRecord>
                ))}
            </div>
          }
          wide={
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <h2 className="text-sm font-semibold text-foreground">
              Audit log by action (last 24h)
            </h2>
          </div>
          <table className="w-full">
            <thead className="bg-muted/40 border-b border-border">
              <tr>
                <th className="text-left px-4 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Action
                </th>
                <th className="text-right px-4 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Count
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {Object.entries(data.auditLog.byAction)
                .sort((a, b) => b[1] - a[1])
                .map(([action, count]) => (
                  <tr key={action}>
                    <td className="px-4 py-2 text-sm font-mono text-foreground">
                      {action}
                    </td>
                    <td className="px-4 py-2 text-right text-sm tabular-nums text-foreground">
                      {count}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
          }
        />
      )}
    </div>
  );
}

function Section({
  title,
  children,
  responsiveEnabled = false,
}: {
  title: string;
  children: React.ReactNode;
  responsiveEnabled?: boolean;
}) {
  return (
    <div className="space-y-2">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      <div
        className={responsiveEnabled ? "grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-5" : "grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3"}
        data-testid={responsiveEnabled ? `observability-metrics-${title.toLowerCase().replace(/\s+/g, "-")}` : undefined}
      >
        {children}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div
      className="rounded-lg border border-border bg-card/50 px-4 py-3"
      data-testid={`stat-${label.toLowerCase().replace(/\s+/g, "-")}`}
    >
      <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-xl font-bold tabular-nums text-foreground">
        {value.toLocaleString()}
      </div>
    </div>
  );
}
